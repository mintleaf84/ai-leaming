#!/usr/bin/env node
/**
 * Web Vitals 报告（docs/performance.md T-01 / P2-02）
 *
 * 一条命令把 `web_vitals` 表变成"按路由的分位数表"，省掉每次手写 SQL。
 * 读的是真实 SQLite 文件，直接复用应用已装的 better-sqlite3，不引新依赖。
 *
 * 用法：
 *   npm run vitals:report                      # 默认 data/ai-learning.db
 *   npm run vitals:report -- --since 2026-11-17
 *   npm run vitals:report -- --db /app/data/ai-learning.db
 *   npm run vitals:report -- --json > vitals.json
 *
 * 容器内：
 *   docker compose exec ai-learning node scripts/vitals-report.mjs
 *
 * 读数规则（与 docs/performance-baseline.md 一致）：
 *   * 每个 (kind, route, name) 组合 **≥ 20 个样本**才算一档，低于即标「样本不足」；
 *   * 只看 p75，不看平均值；
 *   * CLS 在库里是 ×1000 的整数，这里除回来显示。
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const root = path.resolve(import.meta.dirname, "..");
const dbPath = argValue("--db", path.join(root, "data", "ai-learning.db"));
const since = argValue("--since", null);
const asJson = args.includes("--json");
const MIN_SAMPLES = Number(argValue("--min-samples", "20"));

if (!fs.existsSync(dbPath)) {
  console.error(`找不到数据库：${dbPath}`);
  console.error(`容器内请用 --db /app/data/ai-learning.db，或 docker compose exec ai-learning node scripts/vitals-report.mjs`);
  process.exit(2);
}

const db = new Database(dbPath, { readonly: true });

// 表可能不存在（镜像旧于 #188）
const hasTable = db
  .prepare("select name from sqlite_master where type='table' and name='web_vitals'")
  .get();
if (!hasTable) {
  console.error("web_vitals 表不存在：当前镜像早于 Web Vitals 埋点（#188）。先更新镜像。");
  process.exit(2);
}

const hasKind = db
  .prepare("select count(*) n from pragma_table_info('web_vitals') where name='kind'")
  .get().n > 0;
const kindExpr = hasKind ? "coalesce(kind,'vital')" : "'vital'";

const rows = db
  .prepare(
    `select ${kindExpr} as kind, route, name, value
       from web_vitals
      ${since ? "where created_at >= ?" : ""}
      order by kind, route, name`,
  )
  .all(...(since ? [since] : []));

db.close();

if (rows.length === 0) {
  console.error(
    `没有样本${since ? `（since=${since}）` : ""}。手机上正常用一段时间再跑；若刚部署，先确认访问是 HTTPS（SW 与埋点都需要）。`,
  );
  process.exit(1);
}

/** 升序取第 ceil(p*n) 个点；偶数样本取偏低一侧（下中位数），避免 p50 跳动 */
function pct(sorted, p) {
  const n = sorted.length;
  if (n === 0) return 0;
  const idx = Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1));
  return sorted[idx];
}

const groups = new Map();
for (const r of rows) {
  const key = `${r.kind}|${r.route}|${r.name}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(Number(r.value));
}

const out = [];
for (const [key, values] of groups) {
  const [kind, route, name] = key.split("|");
  const sorted = [...values].sort((a, b) => a - b);
  const scale = name === "CLS" ? 1000 : 1;
  out.push({
    kind,
    route,
    name,
    samples: sorted.length,
    enough: sorted.length >= MIN_SAMPLES,
    p50: pct(sorted, 0.5) / scale,
    p75: pct(sorted, 0.75) / scale,
    p95: pct(sorted, 0.95) / scale,
    max: sorted[sorted.length - 1] / scale,
  });
}

// 排序：kind → p75 倒序（最差的页排最前）
const kindOrder = { launch: 0, vital: 1, nav: 2 };
out.sort(
  (a, b) =>
    (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9) ||
    b.p75 - a.p75 ||
    a.route.localeCompare(b.route),
);

if (asJson) {
  console.log(JSON.stringify({ db: dbPath, since, minSamples: MIN_SAMPLES, rows: out }, null, 2));
  process.exit(0);
}

const unit = (name) => (name === "CLS" ? "" : "ms");
const fmt = (v, name) => (name === "CLS" ? v.toFixed(3) : String(Math.round(v)));

console.log(`数据库：${dbPath}${since ? `（since ${since}）` : ""}`);
console.log(`样本阈值：${MIN_SAMPLES} 条\n`);

let currentKind = null;
for (const row of out) {
  if (row.kind !== currentKind) {
    currentKind = row.kind;
    const title = {
      launch: "首屏可交互（launch）",
      vital: "Core Web Vitals（vital）",
      nav: "单次交互耗时（nav）",
    }[row.kind] ?? row.kind;
    console.log(`── ${title} ──`);
    console.log(
      `${"路由".padEnd(22)}${"指标".padEnd(6)}${"n".padStart(5)}${"p50".padStart(9)}${"p75".padStart(9)}${"p95".padStart(9)}${"max".padStart(9)}  判定`,
    );
  }
  // 判定：样本不足优先；否则按 Core Web Vitals 的 p75 阈值给达标/超阈值
  const THRESHOLD = { INP: 200, LCP: 2500, CLS: 0.1 };
  const flag = !row.enough
    ? "样本不足"
    : THRESHOLD[row.name] === undefined
      ? ""
      : row.p75 > THRESHOLD[row.name]
        ? `超阈值(>${THRESHOLD[row.name]})`
        : "达标";
  console.log(
    `${row.route.padEnd(22)}${row.name.padEnd(6)}${String(row.samples).padStart(5)}` +
      `${fmt(row.p50, row.name).padStart(9)}${fmt(row.p75, row.name).padStart(9)}` +
      `${fmt(row.p95, row.name).padStart(9)}${fmt(row.max, row.name).padStart(9)}  ${flag}`,
  );
}

console.log(`\n（单位：${unit("INP")}；CLS 为无量纲）`);

// 给台账用的一行
const worstInp = out.filter((r) => r.name === "INP" && r.enough).sort((a, b) => b.p75 - a.p75)[0];
const worstLcp = out.filter((r) => r.name === "LCP" && r.enough).sort((a, b) => b.p75 - a.p75)[0];
const worstCls = out.filter((r) => r.name === "CLS" && r.enough).sort((a, b) => b.p75 - a.p75)[0];
if (worstInp || worstLcp || worstCls) {
  console.log(
    `可粘进 docs/performance-baseline.md：\n| ${new Date().toISOString().slice(0, 10)} | 现场 | ` +
      `INP p75 ${worstInp ? `${Math.round(worstInp.p75)}ms（${worstInp.route}）` : "样本不足"} | ` +
      `LCP p75 ${worstLcp ? `${Math.round(worstLcp.p75)}ms（${worstLcp.route}）` : "样本不足"} | ` +
      `CLS p75 ${worstCls ? worstCls.p75.toFixed(3) : "样本不足"} | — | 由 vitals:report 生成 |`,
  );
}
