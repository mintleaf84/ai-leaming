#!/usr/bin/env node
/**
 * ESLint warning 棘轮（按规则而非总数）。
 *
 * 为什么不能只用 `eslint --max-warnings N`：它只看总数。当警告从 536 降到 520
 * 之后，新增 10 条 A 规则、删掉 10 条 B 规则，总数仍是 520 < 536 —— 检查通过，
 * 但"新增代码不得引入新警告"这条规则已经被绕过。
 *
 * 本脚本按 ruleId 统计：
 *   - 任何一条规则的计数 > 基线 → 失败（即使总数下降）；
 *   - 总数 > 基线 → 失败；
 *   - eslint 被信号终止 / 输出为空 / 退出码非 0、1 → 失败（不能把崩溃当通过）。
 *
 *   node scripts/check-lint-ratchet.cjs            # 校验
 *   node scripts/check-lint-ratchet.cjs --update   # 收紧基线（只允许持平或下降）
 *   node scripts/check-lint-ratchet.cjs --update --allow-increase "<理由>"  # 显式例外
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const baselinePath = path.join(root, ".eslint-baseline.json");
const update = process.argv.includes("--update");
const allowIncreaseIndex = process.argv.indexOf("--allow-increase");
const allowIncrease = allowIncreaseIndex !== -1;
const allowIncreaseReason =
  allowIncrease && process.argv[allowIncreaseIndex + 1]
    ? process.argv[allowIncreaseIndex + 1]
    : "";

const eslintBin = path.join(root, "node_modules", ".bin", "eslint");
const run = spawnSync(eslintBin, ["-f", "json", "."], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

if (run.error) {
  console.error("✖ 无法执行 eslint:", run.error.message);
  process.exit(1);
}
// 0 = 无问题；1 = 有 error/warning（正常）；其余（含 null=被信号终止）= 异常
if (run.status !== 0 && run.status !== 1) {
  console.error(
    `✖ eslint 异常退出（status=${run.status}, signal=${run.signal || "none"}），不能视为通过`,
  );
  if (run.stderr) console.error(run.stderr.slice(0, 2000));
  process.exit(2);
}

let reports = [];
try {
  reports = JSON.parse(run.stdout || "[]");
} catch {
  console.error("✖ 无法解析 eslint JSON 输出，不能视为通过");
  process.exit(2);
}
if (!Array.isArray(reports) || reports.length === 0) {
  console.error("✖ eslint 未返回任何文件报告（输出为空），拒绝把空报告当通过");
  process.exit(2);
}

const counts = {};
let errors = 0;
let total = 0;
let filesScanned = 0;
for (const file of reports) {
  if (file && file.filePath) filesScanned += 1;
  for (const m of file.messages || []) {
    if (m.severity === 2) {
      errors += 1;
      continue;
    }
    const rule = m.ruleId || "(no-rule)";
    counts[rule] = (counts[rule] || 0) + 1;
    total += 1;
  }
}

if (errors > 0) {
  console.error(`✖ ESLint 有 ${errors} 个 error，必须先清零`);
  process.exit(1);
}

const previous = fs.existsSync(baselinePath)
  ? JSON.parse(fs.readFileSync(baselinePath, "utf8"))
  : null;

if (update) {
  if (previous && !allowIncrease) {
    const increases = [];
    for (const [rule, n] of Object.entries(counts)) {
      const before = previous.rules[rule] || 0;
      if (n > before) increases.push(`${rule}: ${before} → ${n}`);
    }
    if (total > previous.total) increases.push(`总数 ${previous.total} → ${total}`);
    if (increases.length > 0) {
      console.error("✖ 基线只能持平或下降，检测到增长：");
      for (const line of increases) console.error("   - " + line);
      console.error(
        '\n  若确属有意放宽，请显式执行：--update --allow-increase "<理由>"（应写进 PR 描述）',
      );
      process.exit(1);
    }
  }

  const payload = {
    updatedAt: new Date().toISOString().slice(0, 10),
    total,
    filesScanned,
    rules: Object.fromEntries(
      Object.entries(counts).sort((a, b) => b[1] - a[1]),
    ),
  };
  if (allowIncrease && allowIncreaseReason) payload.exceptionReason = allowIncreaseReason;
  fs.writeFileSync(baselinePath, JSON.stringify(payload, null, 2) + "\n");
  console.log(
    `✔ 基线已更新：total=${total}，规则数=${Object.keys(counts).length}` +
      (allowIncrease ? `（显式放宽：${allowIncreaseReason || "未填写理由"}）` : ""),
  );
  process.exit(0);
}

if (!previous) {
  console.error(
    "✖ 缺少 .eslint-baseline.json，先运行 node scripts/check-lint-ratchet.cjs --update",
  );
  process.exit(1);
}

const regressions = [];
if (total > previous.total) regressions.push(`总数 ${previous.total} → ${total}`);
for (const [rule, n] of Object.entries(counts)) {
  const before = previous.rules[rule] || 0;
  if (n > before) regressions.push(`${rule}: ${before} → ${n}`);
}

if (regressions.length > 0) {
  console.error("✖ ESLint warning 出现回退（同一条规则不得增加）：");
  for (const line of regressions) console.error("   - " + line);
  console.error(
    "\n  修掉新增的 warning；确属有意放宽时用 --update --allow-increase \"<理由>\" 并写进 PR。",
  );
  process.exit(1);
}

const improved = previous.total - total;
console.log(
  `✔ ESLint warning 通过：total=${total}（基线 ${previous.total}` +
    (improved > 0 ? `，已减少 ${improved}` : "") +
    "）",
);
if (improved > 0) {
  console.log(
    "  提示：总数已下降，建议同 PR 运行 --update 收紧基线，避免回退空间被重新打开。",
  );
}
