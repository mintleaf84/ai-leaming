#!/usr/bin/env node
/**
 * IME 组合态 Enter 守卫审计（docs/ux-a11y-audit.md §3.1 的机械化版本）。
 *
 * 中文用户用拼音输入时，Enter 是「确认候选词」而不是「提交」。没有守卫的 Enter
 * handler 会把半截拼音（"dai"）当内容提交。本脚本找出所有「判定 Enter」的
 * handler，要求它（或其最多 3 层内的上层 handler）里出现下列任一判定：
 *   - `isImeComposing(...)`（src/lib/utils/ime.ts 的唯一入口）
 *   - 任何 `.isComposing` 读取（含 `e.nativeEvent.isComposing`）
 *   - `xxx.keyCode === 229`（老浏览器的组合态约定）
 *
 * 为什么必须用 TS AST 而不是正则：源码里单双引号混用、`==`/`===` 混用、
 * `e.key` 出现在内联箭头 / 具名 handler / `addEventListener("keydown")` 回调
 * 三种形态、且 Enter 判定常与 `Escape`/`Tab` 判定同处一个 if 链 —— 正则必然
 * 既漏报（多行、可选链）又误报（字符串字面量、注释）。AST 也才能回答
 * 「守卫是否在 preventDefault() 之前」这个顺序问题（顺序错了比原 bug 更糟：
 * 连候选词都选不了）。
 *
 * 用法：
 *   node scripts/audit-ime-enter.cjs             # 校验（出现基线里没有的 handler 即失败）
 *   node scripts/audit-ime-enter.cjs --list      # 打印全部可疑 handler
 *   node scripts/audit-ime-enter.cjs --update    # 刷新基线（只允许持平或下降）
 *   node scripts/audit-ime-enter.cjs --update --allow-increase "<理由>"   # 显式放宽
 *
 * 基线按「文件 + 规范化 handler 哈希」记录签名，因此"修好一个、新增一个"不会
 * 被总数抵消。
 *
 * 退出码：0 = 未超基线；1 = 新增违规；2 = 工具本身不可信（基线缺失/损坏、
 * 源码解析失败）。与 scripts/audit-catches.cjs 的差异：那里基线缺失按 1 处理，
 * 这里按 2 —— 本门禁是零容忍（基线必须是明确的空集），"读不到基线"与
 * "检查跑不起来"同类，不能算通过。
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const baselinePath = path.join(root, "docs", "ime-enter.baseline.json");
const args = process.argv.slice(2);
const update = args.includes("--update");
const list = args.includes("--list");
const allowIncreaseIndex = args.indexOf("--allow-increase");
const allowIncrease = allowIncreaseIndex !== -1;
const allowIncreaseReason =
  allowIncrease && args[allowIncreaseIndex + 1] && !args[allowIncreaseIndex + 1].startsWith("--")
    ? args[allowIncreaseIndex + 1]
    : "";

if (allowIncrease && !update) {
  console.error("✖ --allow-increase 只能与 --update 同时使用");
  process.exit(2);
}

const SRC = path.join(root, "src");
const EXT = new Set([".ts", ".tsx"]);
const SKIP_DIR = /(?:__tests__|__mocks__|node_modules|e2e)/;
const SKIP_FILE = /\.(?:test|spec)\.(?:ts|tsx)$/;
const MAX_HANDLER_DEPTH = 3;

function walkFiles(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIR.test(p)) walkFiles(p, out);
      continue;
    }
    if (EXT.has(path.extname(entry.name)) && !SKIP_FILE.test(entry.name)) {
      out.push(p);
    }
  }
}

function rel(p) {
  return path.relative(root, p).split(path.sep).join("/");
}

function normalize(text) {
  return text.replace(/\s+/g, " ").trim();
}

/** `e.key` / `e['key']` / `e.key.toLowerCase()` 都算「读到了 key」 */
function isKeyRead(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text === "key";
  if (ts.isElementAccessExpression(node)) {
    return (
      !!node.argumentExpression &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      node.argumentExpression.text === "key"
    );
  }
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "toLowerCase"
  ) {
    return isKeyRead(node.expression.expression);
  }
  return false;
}

/** 返回 "exact"（字面量就是 Enter）/ "folded"（走了 toLowerCase 后再比） */
function enterLiteralKind(node) {
  if (!ts.isStringLiteralLike(node)) return null;
  if (node.text === "Enter") return "exact";
  if (node.text.toLowerCase() === "enter") return "folded";
  return null;
}

const EQUALITY_OPS = new Set([
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
]);

/** `x.key === "Enter"` / `"Enter" === x.key`，四种子等号都算 */
function isEnterComparison(node) {
  if (!ts.isBinaryExpression(node)) return false;
  if (!EQUALITY_OPS.has(node.operatorToken.kind)) return false;

  const pairs = [
    [node.left, node.right],
    [node.right, node.left],
  ];
  for (const [keySide, literalSide] of pairs) {
    const kind = enterLiteralKind(literalSide);
    if (!kind) continue;
    if (kind === "exact" && isKeyRead(keySide)) return true;
    // "enter" 小写字面量只有在明确 toLowerCase 之后才认，避免凭空误报
    if (kind === "folded" && ts.isCallExpression(keySide) && isKeyRead(keySide)) {
      return true;
    }
  }
  return false;
}

function isKeyCode229Comparison(node) {
  if (!ts.isBinaryExpression(node)) return false;
  if (!EQUALITY_OPS.has(node.operatorToken.kind)) return false;
  const isKeyCode = (n) =>
    ts.isPropertyAccessExpression(n) && n.name.text === "keyCode";
  const is229 = (n) => ts.isNumericLiteral(n) && n.text === "229";
  return (
    (isKeyCode(node.left) && is229(node.right)) ||
    (isKeyCode(node.right) && is229(node.left))
  );
}

function isPreventDefaultCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "preventDefault"
  );
}

/**
 * 收集**该 handler 自身函数体**里的 IME 判定与 preventDefault 位置。
 *
 * 不进入嵌套函数：`handleSubmit` 里的 `e.preventDefault()` 是另一个函数的事，
 * 拿它判断本 handler 的守卫顺序会把正确写法误报成「守卫在 preventDefault 之后」
 * （ChatInput 就是这样）。只看本层才是"这个 handler 的判定顺序"。
 */
function scanHandler(fn) {
  const guardPositions = [];
  const preventDefaultPositions = [];
  const sf = fn.getSourceFile();

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const calleeName = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : "";
      if (calleeName === "isImeComposing") {
        guardPositions.push(node.getStart(sf));
      }
      if (isPreventDefaultCall(node)) {
        preventDefaultPositions.push(node.getStart(sf));
      }
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === "isComposing") {
      guardPositions.push(node.getStart(sf));
    }
    if (isKeyCode229Comparison(node)) {
      guardPositions.push(node.getStart(sf));
    }
    ts.forEachChild(node, (child) => {
      if (ts.isFunctionLike(child)) return; // 嵌套函数的行为不算本 handler 的
      visit(child);
    });
  };
  visit(fn);

  return { guardPositions, preventDefaultPositions };
}

/**
 * 命中 Enter 的 handler 从内向外找守卫：守卫通常写在本 handler 开头，
 * 少数在包一层的事件委托函数里（如组件级 `onKeyDown` 加守卫、里面再判键）。
 * 找到的第一个守卫决定结论 —— 若它排在**同一层**的 preventDefault 之后，
 * 那就是「修复方式错误」，比原 bug 更糟（IME 的确认动作被吞掉）。
 */
function classify(fnStack) {
  const candidates = fnStack.slice(-MAX_HANDLER_DEPTH).reverse();
  if (candidates.length === 0) return "missing-guard";

  for (const fn of candidates) {
    const { guardPositions, preventDefaultPositions } = scanHandler(fn);
    if (guardPositions.length === 0) continue;
    const firstGuard = Math.min(...guardPositions);
    const firstPrevent = Math.min(...preventDefaultPositions);
    if (preventDefaultPositions.length > 0 && firstGuard > firstPrevent) {
      return "guard-after-prevent-default";
    }
    return null; // 合规：有守卫且不晚于本层任何 preventDefault
  }
  return "missing-guard";
}

const files = [];
walkFiles(SRC, files);

const parseErrors = [];
const violations = [];

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  if (!/enter/i.test(source)) continue; // 快速过滤：不含 Enter 字样的文件不可能命中

  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  if (sf.parseDiagnostics && sf.parseDiagnostics.length > 0) {
    const d = sf.parseDiagnostics[0];
    const { line } = sf.getLineAndCharacterOfPosition(d.start || 0);
    parseErrors.push(`${rel(file)}:${line + 1} ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`);
    continue;
  }

  const occurrences = new Map();
  const reportedHandlers = new Set();

  const visit = (node, fnStack) => {
    const isFunctionLike = ts.isFunctionLike(node);
    const stack = isFunctionLike ? [...fnStack, node] : fnStack;

    if (ts.isBinaryExpression(node) && isEnterComparison(node)) {
      const host = stack[stack.length - 1];
      // 无外层函数（模块顶层直接判 Enter）时，把比较本身当作"handler"——
      // 这类写法没有任何守卫位置可言，如实报出而不是静默跳过。
      const handlerNode = host || node;
      if (!reportedHandlers.has(handlerNode)) {
        reportedHandlers.add(handlerNode);
        const kind = classify(stack);
        if (kind) {
          const hash = crypto
            .createHash("sha1")
            .update(normalize(handlerNode.getText(sf)))
            .digest("hex")
            .slice(0, 10);
          const index = (occurrences.get(hash) || 0) + 1;
          occurrences.set(hash, index);
          const { line } = sf.getLineAndCharacterOfPosition(handlerNode.getStart(sf));
          violations.push({
            id: `${rel(file)}#${hash}#${index}`,
            kind,
            file: rel(file),
            line: line + 1,
          });
        }
      }
    }

    ts.forEachChild(node, (child) => visit(child, stack));
  };
  visit(sf, []);
}

if (parseErrors.length > 0) {
  console.error(`✖ 有 ${parseErrors.length} 个文件解析失败，统计不可信（不能视为通过）：`);
  for (const line of parseErrors.slice(0, 20)) console.error("   - " + line);
  process.exit(2);
}

violations.sort(
  (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.id.localeCompare(b.id),
);
const currentIds = violations.map((v) => v.id).sort();
const counts = {
  handlers: violations.length,
  missingGuard: violations.filter((v) => v.kind === "missing-guard").length,
  guardAfterPreventDefault: violations.filter((v) => v.kind === "guard-after-prevent-default")
    .length,
};

if (list) {
  for (const v of violations) {
    console.log(`${v.kind}\t${v.file}:${v.line}\t${v.id}`);
  }
  console.log("");
}

console.log(
  `IME Enter 审计：待修 handler=${counts.handlers}` +
    `（缺守卫 ${counts.missingGuard}，守卫位置错误 ${counts.guardAfterPreventDefault}）`,
);

// -------------------------------------------------------------------- 基线
function failBrokenBaseline(detail) {
  console.error(`✖ 基线文件不可用（${rel(baselinePath)}）：${detail}`);
  console.error("  损坏/缺失时无法判断是否新增，故不视为通过；修好后重新 --update。");
  process.exit(2);
}

function loadBaseline() {
  if (!fs.existsSync(baselinePath)) {
    failBrokenBaseline("文件不存在。首次落基线：node scripts/audit-ime-enter.cjs --update");
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  } catch (err) {
    failBrokenBaseline(`JSON 解析失败（${err.message}）`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    failBrokenBaseline("顶层应为 JSON 对象");
  }
  if (!Array.isArray(parsed.ids)) {
    failBrokenBaseline("缺少 ids 数组（零容忍门禁要求显式的空数组，而不是缺字段）");
  }
  return parsed;
}

if (update) {
  // 首次落基线时文件还不存在：此时"上一步"就是空集，允许从 0 写一次；
  // 之后任何 --update 都必须持平或下降。
  const hadBaseline = fs.existsSync(baselinePath);
  const previousIds = hadBaseline ? new Set(loadBaseline().ids) : new Set();
  const added = currentIds.filter((id) => !previousIds.has(id));
  if (hadBaseline && added.length > 0 && !allowIncrease) {
    console.error(`✖ 基线只能持平或下降，检测到 ${added.length} 个新增待修 handler：`);
    for (const id of added.slice(0, 10)) console.error("   - " + id);
    console.error('  确属有意放宽时：--update --allow-increase "<理由>"（写进 PR 描述）');
    process.exit(1);
  }

  const payload = {
    updatedAt: new Date().toISOString().slice(0, 10),
    counts,
    ids: currentIds,
  };
  if (allowIncrease) payload.exceptionReason = allowIncreaseReason;

  const tmpPath = `${baselinePath}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2) + "\n");
    fs.renameSync(tmpPath, baselinePath);
  } catch (err) {
    if (fs.existsSync(tmpPath)) fs.rmSync(tmpPath, { force: true });
    console.error(`✖ 写基线失败（${rel(baselinePath)}）：${err.message}`);
    process.exit(2);
  }
  console.log(
    `✔ 基线已更新：${rel(baselinePath)}（${currentIds.length} 个待修 handler）` +
      (allowIncrease ? `（显式放宽：${allowIncreaseReason || "未填写理由"}）` : ""),
  );
  process.exit(0);
}

const baseline = loadBaseline();
const baselineIds = new Set(baseline.ids);
const added = currentIds.filter((id) => !baselineIds.has(id));

if (added.length > 0) {
  console.error(`✖ 出现 ${added.length} 个未通过 IME 组合态门禁的 Enter handler（按签名比对）：`);
  for (const id of added.slice(0, 10)) {
    const v = violations.find((x) => x.id === id);
    console.error(`   - [${v ? v.kind : "?"}] ${id}`);
  }
  console.error(
    "  改法：if (isImeComposing(e)) return; —— 且必须放在本 handler 的任何 preventDefault() 之前。",
  );
  process.exit(1);
}

const fixed = baselineIds.size - currentIds.length;
console.log(
  `✔ 通过（基线 ${baselineIds.size} 个待修 handler，当前 ${currentIds.length}` +
    (fixed > 0 ? `，已修 ${fixed}` : "") +
    "）" +
    (fixed > 0 ? "；建议同 PR 运行 --update 收紧基线。" : ""),
);
