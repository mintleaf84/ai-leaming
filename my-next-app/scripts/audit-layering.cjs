#!/usr/bin/env node
/**
 * 分层门禁：路由层禁止直连数据库。
 *
 * `src/lib/api/routes/**` 只负责 HTTP 协议面（校验、鉴权、状态码、OpenAPI 文档），
 * 数据访问必须落在 `src/lib/services/**`。路由直接
 * `import { drizzleDb } from "@/lib/db"` 会绕过 service 层：同一个查询被两个端点
 * 各写一遍，事务边界、幂等键、归属校验就只能靠评审发现。
 *
 * 扫描范围：`src/lib/api/routes/**` 下**排除测试**（`__tests__/`、`*.test.ts`、
 * `*.spec.ts`）。测试里 import db 是为了造真实 fixture（VI.mock 里替换实例），
 * 属于合法用途；把它算进白名单会让"只减不增"变成一笔永远还不清的账。
 *
 * 判定口径：把模块说明符**按路径解析**到真实文件，解析结果落在
 * `src/lib/db` 目录内即违规——既包括 `src/lib/db/index.ts`（连接实例
 * `drizzleDb`），也包括 `@/lib/db/drizzle-schema`、`@/lib/db/executor`、
 * `@/lib/db/db-file` 这些子模块。绕过 service 层不止"直接拿连接"一种写法：
 * 路由里手写 drizzle 查询、自己开事务、自己探表结构，同样是数据访问上浮。
 * 不用正则匹配字符串：那样 `../db`、`../../../db`、`@/lib/db/index.js` 会漏。
 * 只看 `import`/`export ... from`/`require()`/`import()`，类型位置的
 * `typeof import("@/lib/db")` 不算（那只是类型）。
 *
 * 存量以 `scripts/layering-allowlist.json` 记录，**只减不增**：
 *   - 出现白名单外的新违规 → 失败（否则新代码可以随便绕过 service 层）
 *   - 白名单条目已修好 → 只提示可删，不失败（允许"先修代码、后清条目"）
 *
 * 用法：
 *   node scripts/audit-layering.cjs                       # 校验（新增违规即失败）
 *   node scripts/audit-layering.cjs --list                # 打印当前违规与各条理由
 *   node scripts/audit-layering.cjs --update              # 只删除已修好的条目
 *   node scripts/audit-layering.cjs --allow-add=src/lib/api/routes/foo.ts --reason="理由"
 *                                                         # 唯一能新增条目的入口（需在 PR 里说明）
 */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const routesDir = path.join(root, "src", "lib", "api", "routes");
const dbEntry = path.join(root, "src", "lib", "db");
const allowlistPath = path.join(__dirname, "layering-allowlist.json");

const args = process.argv.slice(2);

/** 支持 `--opt=value` 与 `--opt value` 两种写法 */
function getOption(name) {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = args.indexOf(name);
  if (i !== -1) return args[i + 1];
  return undefined;
}

const wantList = args.includes("--list");
const wantUpdate = args.includes("--update");
const allowAdd = getOption("--allow-add"); // 未提供时为 undefined
const allowReason = getOption("--reason");

const SKIP_DIR = /(?:__tests__|__mocks__|node_modules)/;
const SKIP_FILE = /\.(?:test|spec)\.(?:ts|tsx)$/;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIR.test(p)) walk(p, out);
      continue;
    }
    if (/\.tsx?$/.test(entry.name) && !SKIP_FILE.test(entry.name)) out.push(p);
  }
}

function toRel(abs) {
  return path.relative(root, abs).split(path.sep).join("/");
}

/** 说明符 → 真实模块路径（去掉扩展名与 /index）；落在 src/lib/db 目录内即算 */
function resolvesToDbLayer(spec, fromFile) {
  let base;
  if (spec === "@/lib/db" || spec.startsWith("@/lib/db/")) {
    base = path.join(root, "src", spec.slice(2));
  } else if (spec.startsWith(".")) {
    base = path.resolve(path.dirname(fromFile), spec);
  } else {
    return false;
  }
  base = base.replace(/\.(?:d\.)?[cm]?[jt]sx?$/, "");
  base = base.replace(/\/index$/, "");
  base = path.normalize(base);
  return base === dbEntry || base.startsWith(dbEntry + path.sep);
}

function findDbImports(source, file) {
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const hits = [];
  const visit = (node) => {
    let specNode = null;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
        specNode = node.moduleSpecifier;
      }
    } else if (ts.isCallExpression(node)) {
      const isRequire =
        ts.isIdentifier(node.expression) && node.expression.text === "require";
      const isDynamicImport =
        node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const first = node.arguments[0];
      if ((isRequire || isDynamicImport) && first && ts.isStringLiteralLike(first)) {
        specNode = first;
      }
    }
    if (specNode && resolvesToDbLayer(specNode.text, file)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      hits.push({ line: line + 1, spec: specNode.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

if (!fs.existsSync(routesDir)) {
  console.error(`✖ 找不到路由目录：${toRel(routesDir)}`);
  process.exit(1);
}

// ---------------- 采集违规 ----------------
const files = [];
walk(routesDir, files);

/** rel → { file, line, specs }（同一文件多处 import 只记首处行号，说明符去重） */
const violations = new Map();
for (const file of files.sort()) {
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes("lib/db")) continue;
  const hits = findDbImports(source, file);
  if (hits.length === 0) continue;
  const rel = toRel(file);
  violations.set(rel, {
    file: rel,
    line: hits[0].line,
    specs: [...new Set(hits.map((h) => h.spec))],
  });
}

// ---------------- 白名单读写 ----------------
function readAllowlist() {
  if (!fs.existsSync(allowlistPath)) {
    throw new Error(
      `缺少白名单 ${toRel(allowlistPath)}；用 --allow-add=<path> --reason="..." 逐条建立`,
    );
  }
  const raw = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
  const files = raw && raw.files;
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    throw new Error(`${toRel(allowlistPath)} 缺少 "files" 对象`);
  }
  for (const [key, reason] of Object.entries(files)) {
    if (typeof reason !== "string" || reason.trim() === "") {
      throw new Error(`白名单条目 ${key} 缺少理由（每个条目必须写明待迁移到哪个 service）`);
    }
  }
  return raw;
}

function writeAllowlist(raw, filesMap) {
  const sorted = {};
  for (const key of Object.keys(filesMap).sort()) sorted[key] = filesMap[key];
  const payload = { ...raw, files: sorted };
  fs.writeFileSync(allowlistPath, JSON.stringify(payload, null, 2) + "\n");
}

const rel = toRel(allowlistPath);

// ---------------- --list：只打印，永远 exit 0 ----------------
if (wantList) {
  const allow = readAllowlist();
  for (const v of violations.values()) {
    const reason = allow.files[v.file] || "（不在白名单：新增违规）";
    console.log(`${v.file}:${v.line}\t${v.specs.join(", ")}\t${reason}`);
  }
  const stale = Object.keys(allow.files).filter((f) => !violations.has(f));
  for (const f of stale.sort()) {
    console.log(`已修好\t${f}\t（可用 --update 删除该条目）`);
  }
  console.log("");
  console.log(
    `直连 db 的文件 ${violations.size} 个，白名单 ${Object.keys(allow.files).length} 条` +
      (stale.length ? `，其中 ${stale.length} 条已可删除` : ""),
  );
  process.exit(0);
}

// ---------------- --allow-add 校验 ----------------
let allow = readAllowlist();
let allowChanged = false;

if (allowAdd !== undefined) {
  const target = path
    .relative(root, path.resolve(root, allowAdd))
    .split(path.sep)
    .join("/");
  if (!allowReason || allowReason.trim() === "") {
    console.error('✖ --allow-add 必须同时给出 --reason="<待迁移到哪个 service>"');
    process.exit(1);
  }
  if (!violations.has(target)) {
    console.error(
      `✖ ${target} 当前并不直连 @/lib/db（路径写错，或已修好）；白名单只能收录现存违规`,
    );
    process.exit(1);
  }
  if (allow.files[target]) {
    console.error(`✖ ${target} 已在白名单中：${allow.files[target]}`);
    process.exit(1);
  }
  allow.files[target] = allowReason.trim();
  allowChanged = true;
  console.log(`＋ 新增白名单条目：${target}`);
}

// ---------------- --update：只删已修好的条目 ----------------
if (wantUpdate) {
  const stale = Object.keys(allow.files).filter((f) => !violations.has(f));
  if (stale.length > 0) {
    for (const f of stale.sort()) {
      delete allow.files[f];
      console.log(`－ 删除已修好的条目：${f}`);
    }
    allowChanged = true;
  }
  if (allowChanged) {
    writeAllowlist(allow, allow.files);
    console.log(
      `✔ 白名单已更新：${rel}（剩 ${Object.keys(allow.files).length} 条）`,
    );
  } else {
    console.log(`✔ 白名单无需删除（${Object.keys(allow.files).length} 条均仍属违规）`);
  }
  if (!allowAdd) {
    // --update 永不新增：列表外的现存违规必须显式 --allow-add
    const unlisted = [...violations.keys()].filter((f) => !allow.files[f]);
    if (unlisted.length > 0) {
      console.error(
        `✖ 白名单只能收紧：${unlisted.length} 个文件直连 db 且不在白名单，--update 不会收录`,
      );
      for (const f of unlisted.slice(0, 10)) {
        console.error(`   - ${f}:${violations.get(f).line}`);
      }
      console.error(
        '  确属存量（如并行 lane 在拆的文件）才用 --allow-add=<path> --reason="<理由>"，并在 PR 里说明',
      );
      process.exit(1);
    }
  }
  process.exit(0);
}

// --allow-add 单独使用时也要落盘（--update 分支上面已写过）
if (allowChanged && !wantUpdate) {
  writeAllowlist(allow, allow.files);
  console.log(
    `✔ 白名单已更新：${rel}（${Object.keys(allow.files).length} 条）`,
  );
}

// ---------------- 默认：校验 ----------------
const unlisted = [...violations.values()].filter((v) => !allow.files[v.file]);
const stale = Object.keys(allow.files).filter((f) => !violations.has(f));

if (stale.length > 0) {
  console.log(
    `⚠ 白名单中 ${stale.length} 条已不再违规，可运行 --update 删除：${stale.sort().join(", ")}`,
  );
}

if (unlisted.length > 0) {
  console.error(
    `✖ 出现 ${unlisted.length} 个新增违规（路由层直连 @/lib/db 及其子模块）：`,
  );
  for (const v of unlisted.slice(0, 10)) {
    console.error(`   - ${v.file}:${v.line}（${v.specs.join(", ")}）`);
  }
  if (unlisted.length > 10) {
    console.error(`   …… 另有 ${unlisted.length - 10} 个，用 --list 查看全部`);
  }
  console.error("  把数据访问下沉到 src/lib/services/*；确属存量才 --allow-add=<path> --reason=\"<理由>\"");
  process.exit(1);
}

console.log(
  `✔ 通过（路由层 ${files.length} 个文件无新增直连 db；白名单 ${Object.keys(allow.files).length} 条，只减不增）`,
);
