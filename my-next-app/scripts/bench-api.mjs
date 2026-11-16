#!/usr/bin/env node
/**
 * API p95 基准（docs/performance.md T-11）
 *
 * 目的：让"某次改动把接口拖慢了 20%"变成红灯，而不是等手机端体感变差。
 * 只做**环比**（与 perf-baseline.json 里上一次的数字比），不做绝对门槛 ——
 * 本机与 CI 机器性能差异太大，绝对值毫无意义。
 *
 * 为什么不用 autocannon：
 *   * 引入新 devDependency 需要联网安装，而本仓库的构建机是 glibc 2.17 的
 *     离线环境（见 docs/engineering.md 的本机约束），一个只跑基准的依赖不值得；
 *   * 这里只需要 p50/p95/p99 + 吞吐，内置 fetch + 固定并发就够，且没有
 *     HTTP/1.1 keep-alive 复用策略的黑盒行为。
 *
 * 用法：
 *   node scripts/bench-api.mjs --base-url http://localhost:3001 \
 *        --cookie "$BENCH_COOKIE" [--duration 10] [--concurrency 10] [--update]
 *
 * 认证：/api/history 等端点需要登录态。没有传 --cookie 时，401 会被跳过并
 * 在输出里标注（不会把 401 当成功计入 p95，也不会让脚本假装通过）。
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const baseUrl = argValue("--base-url", "http://localhost:3001").replace(/\/$/, "");
const cookie = argValue("--cookie", process.env.BENCH_COOKIE ?? "");
const durationSec = Number(argValue("--duration", "10"));
const concurrency = Number(argValue("--concurrency", "10"));
const update = args.includes("--update");
const root = path.resolve(import.meta.dirname, "..");
const baselinePath = argValue("--baseline", path.join(root, "perf-baseline.json"));

/** 环比允许涨幅 */
const GROWTH_LIMIT = 1.2;

/** 高频端点：与 docs/mobile-performance.md §8 的查询热点对应 */
const ENDPOINTS = [
  { name: "history.list", path: "/api/history?page=1" },
  { name: "wrong-book.list", path: "/api/wrong-book?page=1" },
  { name: "knowledge.cards", path: "/api/knowledge/cards" },
  { name: "stats.overview", path: "/api/stats/overview" },
  { name: "admin.system", path: "/api/admin/system" },
];

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function bench(endpoint) {
  const url = `${baseUrl}${endpoint.path}`;
  const headers = cookie ? { cookie } : {};
  const latencies = [];
  let ok = 0;
  let unauthorized = 0;
  let failed = 0;
  const deadline = Date.now() + durationSec * 1000;

  // 预热一次：排除 DNS/TCP/TLS 首次成本
  try {
    await fetch(url, { headers });
  } catch {
    return { endpoint, unreachable: true };
  }

  const worker = async () => {
    while (Date.now() < deadline) {
      const t0 = performance.now();
      try {
        const res = await fetch(url, { headers });
        await res.arrayBuffer(); // 计时包含响应体
        const dt = performance.now() - t0;
        if (res.status >= 200 && res.status < 400) {
          latencies.push(dt);
          ok++;
        } else if (res.status === 401 || res.status === 403) {
          unauthorized++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  latencies.sort((a, b) => a - b);
  return {
    endpoint,
    ok,
    unauthorized,
    failed,
    rps: latencies.length / durationSec,
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
  };
}

const baseline = fs.existsSync(baselinePath)
  ? JSON.parse(fs.readFileSync(baselinePath, "utf8"))
  : {};
const baselineApi = baseline.api ?? {};
const failures = [];
const results = {};

console.log(`目标 ${baseUrl}（${durationSec}s × ${concurrency} 并发，cookie ${cookie ? "已提供" : "未提供"}）\n`);
console.log("端点                   p50      p95      p99     rps     说明");

for (const endpoint of ENDPOINTS) {
  const r = await bench(endpoint);
  if (r.unreachable) {
    console.log(`  ${endpoint.name.padEnd(20)} 目标不可达，跳过`);
    continue;
  }
  if (r.unauthorized > 0 && r.ok === 0) {
    console.log(`  ${endpoint.name.padEnd(20)} 全部 401/403（缺 --cookie），跳过`);
    continue;
  }
  results[endpoint.name] = Math.round(r.p95);

  const prev = baselineApi[endpoint.name];
  const growth = prev ? r.p95 / prev : 0;
  const overGrowth = prev ? growth > GROWTH_LIMIT : false;
  if (overGrowth) {
    failures.push(
      `${endpoint.name} p95 环比 ${prev}ms → ${Math.round(r.p95)}ms（+${((growth - 1) * 100).toFixed(0)}%，上限 +20%）`,
    );
  }
  console.log(
    `  ${endpoint.name.padEnd(20)} ${r.p50.toFixed(1).padStart(7)}ms ${r.p95.toFixed(1).padStart(7)}ms ${r.p99.toFixed(1).padStart(7)}ms ${r.rps.toFixed(1).padStart(6)}   ${prev ? `${prev}ms→${Math.round(r.p95)}ms` : "首次记为基线"}${r.failed ? ` failed=${r.failed}` : ""}`,
  );
}

if (update && Object.keys(results).length > 0) {
  baseline.api = { ...baselineApi, ...results };
  baseline.apiUpdatedAt = new Date().toISOString();
  fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + "\n");
  console.log(`\n基线已写入 ${path.relative(root, baselinePath)}`);
}

if (failures.length > 0) {
  console.error("\nAPI 性能回归：");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

if (Object.keys(results).length === 0) {
  console.log("\n没有可测端点（全部不可达或缺登录态）—— 未产生基线，按跳过处理。");
  process.exit(0);
}

console.log("\nAPI p95 在预算内。");
