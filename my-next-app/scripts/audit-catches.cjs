#!/usr/bin/env node
/**
 * `catch` 形态审计（docs/error-handling.md 的机械化版本）。
 *
 * 用 TypeScript AST 而不是正则：正则版本会把 `.catch(`、嵌套 catch、
 * 字符串/模板里的 `throw` 都算错，导致门禁既漏报也误报。
 *
 * 分类（只看「会从 catch 主体逃逸」的控制流，忽略嵌套函数）：
 *   - `rethrow`   主体内存在逃逸的 `throw`
 *   - `degraded`  有日志 + 有 return/continue/break 降级
 *   - `logged`    有日志，但没有显式降级
 *   - `fallback`  只有降级、没有日志
 *   - `silent`    什么都没有
 *
 * 用法：
 *   node scripts/audit-catches.cjs             # 校验（新增标记项即失败）
 *   node scripts/audit-catches.cjs --list      # 打印全部可疑位置
 *   node scripts/audit-catches.cjs --update    # 刷新基线（只允许新增 rethrow/degraded）
 *   node scripts/audit-catches.cjs --update --allow-increase "<理由>"
 *
 * 基线按「文件 + 规范化代码块哈希」记录签名，因此"修好一个、新增一个"
 * 不会被总数抵消。
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const baselinePath = path.join(root, "docs", "catch-audit.baseline.json");
const args = process.argv.slice(2);
const update = args.includes("--update");
const list = args.includes("--list");
const allowIncrease = args.includes("--allow-increase");

const SRC = path.join(root, "src");
const EXT = new Set([".ts", ".tsx"]);
const SKIP_DIR = /(?:__tests__|__mocks__|node_modules)/;
const SKIP_FILE = /\.(?:test|spec)\.(?:ts|tsx)$/;
const FLAGGED = new Set(["logged", "fallback", "silent"]);

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIR.test(p)) walk(p, out);
      continue;
    }
    if (EXT.has(path.extname(entry.name)) && !SKIP_FILE.test(entry.name)) {
      out.push(p);
    }
  }
}

/** 遍历节点，但**不进入**嵌套函数/类的内部 */
function visitShallow(node, cb) {
  cb(node);
  ts.forEachChild(node, (child) => {
    if (
      ts.isFunctionLike(child) ||
      ts.isClassLike(child) ||
      ts.isMethodDeclaration(child) ||
      ts.isArrowFunction(child) ||
      ts.isFunctionExpression(child) ||
      ts.isFunctionDeclaration(child)
    ) {
      return; // 嵌套函数里的 throw/log 不算 catch 主体的行为
    }
    visitShallow(child, cb);
  });
}

function isLogCall(node) {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee)) return false;
  const receiver = callee.expression;
  const receiverName = ts.isIdentifier(receiver) ? receiver.text : "";
  const method = callee.name.text;
  const isLogReceiver = ["log", "logger", "console"].includes(receiverName);
  return isLogReceiver && ["error", "warn", "info", "debug"].includes(method);
}

function normalize(text) {
  return text.replace(/\s+/g, " ").trim();
}

function classify(catchClause) {
  let hasThrow = false;
  let hasLog = false;
  let hasFallback = false;

  visitShallow(catchClause.block, (node) => {
    if (ts.isThrowStatement(node)) hasThrow = true;
    if (isLogCall(node)) hasLog = true;
    if (
      ts.isReturnStatement(node) ||
      ts.isContinueStatement(node) ||
      ts.isBreakStatement(node)
    ) {
      hasFallback = true;
    }
  });

  if (hasThrow) return "rethrow";
  if (hasLog && hasFallback) return "degraded";
  if (hasLog) return "logged";
  if (hasFallback) return "fallback";
  return "silent";
}

const files = [];
walk(SRC, files);

const counts = { rethrow: 0, degraded: 0, fallback: 0, logged: 0, silent: 0 };
const flagged = []; // { id, kind, file, line }

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes("catch")) continue;

  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  // 同一文件里可能有多个完全相同的 catch 块：用「哈希 + 序号」保证 id 唯一，
  // 这样新增一份重复块也会被识别为新增项。
  const occurrences = new Map();
  const visit = (node) => {
    if (ts.isCatchClause(node)) {
      const kind = classify(node);
      counts[kind] += 1;
      if (FLAGGED.has(kind)) {
        const rel = path.relative(root, file);
        const blockText = normalize(node.block.getText(sf));
        const hash = crypto
          .createHash("sha1")
          .update(blockText)
          .digest("hex")
          .slice(0, 10);
        const index = (occurrences.get(hash) || 0) + 1;
        occurrences.set(hash, index);
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        flagged.push({ id: `${rel}#${hash}#${index}`, kind, file: rel, line: line + 1 });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (list) {
  for (const f of flagged) {
    console.log(`${f.kind}\t${f.file}:${f.line}\t${f.id}`);
  }
  console.log("");
}

console.log(
  `catch 审计：rethrow=${counts.rethrow} degraded=${counts.degraded} ` +
    `fallback=${counts.fallback} logged=${counts.logged} silent=${counts.silent}`,
);

const currentIds = flagged.map((f) => f.id).sort();

if (update) {
  const previous = fs.existsSync(baselinePath)
    ? JSON.parse(fs.readFileSync(baselinePath, "utf8"))
    : null;
  if (previous && !allowIncrease) {
    const previousIds = new Set(previous.ids || []);
    const added = currentIds.filter((id) => !previousIds.has(id));
    if (added.length > 0) {
      console.error(
        `✖ 基线只能持平或下降，检测到 ${added.length} 个新增标记项：`,
      );
      for (const id of added.slice(0, 10)) console.error("   - " + id);
      console.error(
        '  确属有意放宽时：--update --allow-increase "<理由>"（写进 PR 描述）',
      );
      process.exit(1);
    }
  }
  const payload = {
    updatedAt: new Date().toISOString().slice(0, 10),
    counts,
    ids: currentIds,
  };
  if (allowIncrease) {
    payload.exceptionReason = args[args.indexOf("--allow-increase") + 1] || "";
  }
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(baselinePath, JSON.stringify(payload, null, 2) + "\n");
  console.log(`✔ 基线已更新：${baselinePath}（${currentIds.length} 个标记项）`);
  process.exit(0);
}

if (!fs.existsSync(baselinePath)) {
  console.error("✖ 缺少基线，先运行 node scripts/audit-catches.cjs --update");
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const baselineIds = new Set(baseline.ids || []);
const added = currentIds.filter((id) => !baselineIds.has(id));

if (added.length > 0) {
  console.error(`✖ 出现 ${added.length} 个新的可疑 catch（按位置签名比对）：`);
  for (const id of added.slice(0, 10)) console.error("   - " + id);
  console.error("  用 --list 查看位置；按 docs/error-handling.md 的三形态处理。");
  process.exit(1);
}

console.log(
  `✔ 通过（基线 ${baselineIds.size} 个标记项：logged/fallback/silent 无新增）`,
);
