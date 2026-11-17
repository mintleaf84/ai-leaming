#!/usr/bin/env node
/**
 * 无障碍（a11y）静态检查 + 基线棘轮。
 *
 * 规则集来自 eslint-plugin-jsx-a11y 的 `flatConfigs.recommended`（见
 * eslint.a11y.config.mjs），只扫 `src/**\/*.{ts,tsx}`。审计轮不改存量代码，
 * 因此这里只统计、只落基线，不动 severity、不加 ignore/off。
 *
 * CLI（与 scripts/check-lint-ratchet.cjs 保持同一形态与退出码约定）：
 *   node scripts/audit-a11y.cjs              # 报告；超基线 → 退出码 1
 *   node scripts/audit-a11y.cjs --json       # 机器可读明细（stdout 只有 JSON）
 *   node scripts/audit-a11y.cjs --update     # 收紧基线（只允许持平或下降）
 *   node scripts/audit-a11y.cjs --update --allow-increase "<理由>"   # 显式放宽
 *
 * 退出码：
 *   0 = 未超基线（或首次运行无基线，仅报告）
 *   1 = 某规则数量超过基线 / 出现基线里没有的规则 / 总数超过基线
 *   2 = 工具本身异常（eslint 崩溃、JSON 解析失败、解析报错、空报告）——
 *       不能把「跑不起来」当成「通过」
 *
 * 为什么按规则做棘轮而不是只看总数：总数从 200 降到 190 的同时，可以新增
 * 10 条 aria-props、再删 20 条 no-static-element-interactions —— 总数看着
 * 在降，但硬伤在涨。按 ruleId 逐条比对能挡住这种置换。
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const baselinePath = path.join(root, "a11y-baseline.json");
const configFile = "eslint.a11y.config.mjs";

const argv = process.argv.slice(2);
const update = argv.includes("--update");
const asJson = argv.includes("--json");
const allowIncreaseIndex = argv.indexOf("--allow-increase");
const allowIncrease = allowIncreaseIndex !== -1;
const allowIncreaseReason =
  allowIncrease && argv[allowIncreaseIndex + 1] && !argv[allowIncreaseIndex + 1].startsWith("--")
    ? argv[allowIncreaseIndex + 1]
    : "";

/**
 * 严重度 + WCAG 条款映射。
 * P1 = 无障碍硬伤（WCAG 有明确条款，屏幕阅读器/键盘用户直接不可用）
 * P2 = 大概率误报或纯风格（规则启发式判不准，需人工看上下文）
 * P3 = 其余（真实但影响面小，或有更直接的等价规则覆盖）
 */
const RULE_META = {
  // ---- P1 ----
  "jsx-a11y/alt-text": { level: "P1", wcag: "1.1.1 非文本内容" },
  "jsx-a11y/anchor-is-valid": { level: "P1", wcag: "2.4.4 / 4.1.2 链接目的与角色" },
  "jsx-a11y/label-has-associated-control": { level: "P1", wcag: "1.3.1 / 3.3.2 标签关联" },
  "jsx-a11y/aria-props": { level: "P1", wcag: "4.1.2 名称角色值" },
  "jsx-a11y/aria-proptypes": { level: "P1", wcag: "4.1.2 名称角色值" },
  "jsx-a11y/aria-unsupported-elements": { level: "P1", wcag: "4.1.2 名称角色值" },
  "jsx-a11y/role-has-required-aria-props": { level: "P1", wcag: "4.1.2 名称角色值" },
  "jsx-a11y/no-redundant-roles": { level: "P1", wcag: "1.3.1 信息与关系（影响很低）" },
  "jsx-a11y/interactive-supports-focus": { level: "P1", wcag: "2.1.1 / 2.4.7 键盘可达" },
  "jsx-a11y/click-events-have-key-events": { level: "P1", wcag: "2.1.1 键盘" },
  "jsx-a11y/no-noninteractive-tabindex": { level: "P1", wcag: "2.1.1 键盘 / 2.4.3 焦点顺序" },

  // ---- P2 ----
  "jsx-a11y/no-static-element-interactions": { level: "P2", wcag: "4.1.2（启发式，易误报）" },
  "jsx-a11y/media-has-caption": { level: "P2", wcag: "1.2.2 字幕" },
  "jsx-a11y/no-autofocus": { level: "P2", wcag: "（最佳实践，非 WCAG 条款）" },
  "jsx-a11y/heading-has-content": { level: "P2", wcag: "1.3.1 / 2.4.6 标题" },
  "jsx-a11y/prefer-tag-over-role": { level: "P2", wcag: "（最佳实践，非 WCAG 条款）" },

  // ---- P3 ----
  "jsx-a11y/anchor-has-content": { level: "P3", wcag: "2.4.4 / 4.1.2 链接文本" },
  "jsx-a11y/aria-activedescendant-has-tabindex": { level: "P3", wcag: "2.1.1 / 4.1.2" },
  "jsx-a11y/aria-role": { level: "P3", wcag: "4.1.2 名称角色值" },
  "jsx-a11y/autocomplete-valid": { level: "P3", wcag: "1.3.5 输入用途" },
  "jsx-a11y/control-has-associated-label": { level: "P3", wcag: "4.1.2 / 1.3.1" },
  "jsx-a11y/html-has-lang": { level: "P3", wcag: "3.1.1 语言" },
  "jsx-a11y/iframe-has-title": { level: "P3", wcag: "4.1.2 / 2.4.1" },
  "jsx-a11y/img-redundant-alt": { level: "P3", wcag: "1.1.1 非文本内容" },
  "jsx-a11y/mouse-events-have-key-events": { level: "P3", wcag: "2.1.1 键盘" },
  "jsx-a11y/no-access-key": { level: "P3", wcag: "（最佳实践，非 WCAG 条款）" },
  "jsx-a11y/no-distracting-elements": { level: "P3", wcag: "2.2.2 暂停/停止/隐藏" },
  "jsx-a11y/no-interactive-element-to-noninteractive-role": { level: "P3", wcag: "4.1.2" },
  "jsx-a11y/no-noninteractive-element-interactions": { level: "P3", wcag: "4.1.2（启发式）" },
  "jsx-a11y/no-noninteractive-element-to-interactive-role": { level: "P3", wcag: "4.1.2" },
  "jsx-a11y/role-supports-aria-props": { level: "P3", wcag: "4.1.2" },
  "jsx-a11y/scope": { level: "P3", wcag: "1.3.1 表格关系" },
  "jsx-a11y/tabindex-no-positive": { level: "P3", wcag: "2.4.3 焦点顺序" },
};

const LEVEL_LABEL = { P1: "P1 硬伤", P2: "P2 疑似误报", P3: "P3 一般" };

function metaOf(ruleId) {
  return RULE_META[ruleId] || { level: "P3", wcag: "未分类" };
}
function levelOf(ruleId) {
  return metaOf(ruleId).level;
}
function rel(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

// ---------------------------------------------------------------- 跑 eslint
const eslintBin = path.join(root, "node_modules", ".bin", "eslint");
if (!fs.existsSync(eslintBin)) {
  console.error(`✖ 找不到 ${rel(eslintBin)}`);
  process.exit(2);
}

const run = spawnSync(eslintBin, ["--no-config-lookup", "--config", configFile, "-f", "json", "src"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

if (run.error) {
  console.error("✖ 无法执行 eslint:", run.error.message);
  process.exit(2);
}
// 0 = 无问题；1 = 有 a11y 报告（本配置里规则是 error 级，属正常）；其余 = 异常
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
  if (run.stderr) console.error(run.stderr.slice(0, 2000));
  process.exit(2);
}

// ---------------------------------------------------------------- 汇总
const findings = [];
const parseErrors = [];
const outOfScope = [];
let filesScanned = 0;
for (const file of reports) {
  if (!file || !file.filePath) continue;
  filesScanned += 1;
  for (const m of file.messages || []) {
    if (m.fatal) {
      parseErrors.push(`${rel(file.filePath)}:${m.line || 0} ${m.message}`);
      continue;
    }
    // 本配置只启用 jsx-a11y/*。其余消息来自源码里针对 eslint.config.mjs 规则集的
    // `eslint-disable-next-line` 注释（「Definition for rule ... was not found」）
    // 与「Unused eslint-disable directive」——属于跨配置的噪声，不是 a11y 结论。
    // 不计入基线，但计数后如实提示，避免"悄悄丢掉"。
    if (!m.ruleId || !String(m.ruleId).startsWith("jsx-a11y/")) {
      outOfScope.push(`${rel(file.filePath)}:${m.line || 0} ${m.ruleId || "(no-rule)"}`);
      continue;
    }
    findings.push({
      ruleId: m.ruleId,
      file: rel(file.filePath),
      line: m.line || 0,
      column: m.column || 0,
      severity: m.severity === 2 ? "error" : "warning",
      message: m.message,
    });
  }
}

if (parseErrors.length > 0) {
  console.error(`✖ 有 ${parseErrors.length} 个文件解析失败，统计不可信：`);
  for (const line of parseErrors.slice(0, 20)) console.error("   - " + line);
  process.exit(2);
}

// 排序保证两次运行输出逐字节一致（eslint 自身顺序不作为契约）
findings.sort(
  (a, b) =>
    a.file.localeCompare(b.file) ||
    a.line - b.line ||
    a.column - b.column ||
    a.ruleId.localeCompare(b.ruleId),
);

const counts = {};
for (const f of findings) counts[f.ruleId] = (counts[f.ruleId] || 0) + 1;
const total = findings.length;

const groups = Object.entries(counts)
  .map(([ruleId, n]) => {
    const first = findings.find((f) => f.ruleId === ruleId);
    const meta = metaOf(ruleId);
    return {
      ruleId,
      count: n,
      example: first ? `${first.file}:${first.line}` : "-",
      level: meta.level,
      wcag: meta.wcag,
    };
  })
  .sort((a, b) => b.count - a.count || a.ruleId.localeCompare(b.ruleId));

// ---------------------------------------------------------------- --json
if (asJson && !update) {
  process.stdout.write(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        total,
        filesScanned,
        ignoredOutOfScope: outOfScope.length,
        rules: Object.fromEntries(groups.map((g) => [g.ruleId, g.count])),
        groupDetail: groups,
        findings,
      },
      null,
      2,
    ) + "\n",
  );
  // 棘轮判定结果走 stderr，保证 stdout 是纯 JSON
  const ratchet = checkRatchet(counts, total, { quiet: true });
  if (ratchet.code !== 0) {
    for (const line of ratchet.messages) console.error(line);
  }
  process.exit(ratchet.code);
}

// ---------------------------------------------------------------- 报告
const levelTotals = { P1: 0, P2: 0, P3: 0 };
for (const g of groups) levelTotals[g.level] = (levelTotals[g.level] || 0) + g.count;

function displayWidth(str) {
  // 中日韩字符按 2 列显示宽度计
  return [...String(str)].reduce(
    (n, ch) => n + (ch.codePointAt(0) > 0x2e80 ? 2 : 1),
    0,
  );
}

function pad(s, w) {
  const str = String(s);
  return str + " ".repeat(Math.max(0, w - displayWidth(str)));
}

const tableRows = [
  ["规则", "数量", "代表位置", "严重度 / WCAG"],
  ...groups.map((g) => [g.ruleId, String(g.count), g.example, `${g.level} · ${g.wcag}`]),
];
const widths = [0, 1, 2].map((i) =>
  Math.max(...tableRows.map((row) => displayWidth(row[i]))),
);
const lines = tableRows.map((row, idx) => {
  if (idx === 0) {
    return row.map((cell, i) => pad(cell, widths[i] + 2)).join("").trimEnd();
  }
  return (
    pad(row[0], widths[0] + 2) +
    pad(row[1], widths[1] + 2) +
    pad(row[2], widths[2] + 2) +
    row[3]
  );
});
lines.splice(1, 0, "-".repeat(displayWidth(lines[0]) + 4));

console.log("a11y 静态检查（eslint-plugin-jsx-a11y flatConfigs.recommended）");
console.log(`扫描范围 src/**/*.{ts,tsx}：${filesScanned} 个文件，命中 ${total} 条，${groups.length} 条规则`);
console.log(
  `严重度分布：P1=${levelTotals.P1}，P2=${levelTotals.P2}，P3=${levelTotals.P3}`,
);
if (outOfScope.length > 0) {
  console.log(
    `已排除 ${outOfScope.length} 条非 a11y 消息（源码 disable 注释引用 eslint.config.mjs 的规则集产生的噪声，见脚本注释）`,
  );
}
console.log("");
console.log(lines.join("\n"));
console.log("");
console.log(`级别口径：${Object.entries(LEVEL_LABEL).map(([k, v]) => `${k}=${v}`).join(" / ")}`);

// ---------------------------------------------------------------- 棘轮
const ratchet = checkRatchet(counts, total);
if (ratchet.messages.length > 0) {
  if (ratchet.code !== 0) console.error("");
  const sink = ratchet.code !== 0 ? console.error : console.log;
  for (const line of ratchet.messages) sink(line);
}
process.exit(ratchet.code);

function checkRatchet(counts, total, opts = {}) {
  const messages = [];
  const previous = fs.existsSync(baselinePath)
    ? JSON.parse(fs.readFileSync(baselinePath, "utf8"))
    : null;

  if (update) {
    if (previous && !allowIncrease) {
      const increases = [];
      for (const [rule, n] of Object.entries(counts)) {
        const before = (previous.rules && previous.rules[rule]) || 0;
        if (n > before) increases.push(`${rule}: ${before} → ${n}`);
      }
      if (typeof previous.total === "number" && total > previous.total) {
        increases.push(`总数 ${previous.total} → ${total}`);
      }
      if (increases.length > 0) {
        messages.push("✖ 基线只能持平或下降，检测到增长：");
        for (const line of increases) messages.push("   - " + line);
        messages.push(
          '\n  若确属有意放宽，请显式执行：--update --allow-increase "<理由>"（应写进 PR 描述）',
        );
        return { code: 1, messages };
      }
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      total,
      rules: Object.fromEntries(
        groups.map((g) => [g.ruleId, g.count]),
      ),
    };
    if (allowIncrease && allowIncreaseReason) payload.exceptionReason = allowIncreaseReason;
    fs.writeFileSync(baselinePath, JSON.stringify(payload, null, 2) + "\n");
    console.log(
      `\n✔ a11y 基线已写入 ${rel(baselinePath)}：total=${total}，规则数=${groups.length}` +
        (allowIncrease ? `（显式放宽：${allowIncreaseReason || "未填写理由"}）` : ""),
    );
    return { code: 0, messages };
  }

  if (!previous) {
    messages.push(
      `○ 无 ${rel(baselinePath)}（首次运行），仅报告不失败。落基线：node scripts/audit-a11y.cjs --update`,
    );
    return { code: 0, messages };
  }

  const regressions = [];
  if (typeof previous.total === "number" && total > previous.total) {
    regressions.push(`总数 ${previous.total} → ${total}`);
  }
  for (const [rule, n] of Object.entries(counts)) {
    const before = (previous.rules && previous.rules[rule]) || 0;
    if (n > before) {
      regressions.push(
        `${rule}: ${before} → ${n}${before === 0 ? "（基线中不存在此规则）" : ""}`,
      );
    }
  }

  if (regressions.length > 0) {
    messages.push("✖ a11y 违规出现回退（同一条规则不得增加，新规则视为回退）：");
    for (const line of regressions) messages.push("   - " + line);
    messages.push(
      '\n  修掉新增项；确属有意放宽时用 --update --allow-increase "<理由>" 并写进 PR。',
    );
    return { code: 1, messages };
  }

  const improved = previous.total - total;
  messages.push(
    `✔ a11y 未超基线：total=${total}（基线 ${previous.total}` +
      (improved > 0 ? `，已减少 ${improved}` : "") +
      "）",
  );
  if (improved > 0 && !opts.quiet) {
    messages.push(
      "  提示：总数已下降，建议同 PR 运行 --update 收紧基线，避免回退空间被重新打开。",
    );
  }
  return { code: 0, messages };
}
