#!/usr/bin/env node
/**
 * 并发串行化测量（服务端性能 S3，docs/perf-measure.md）
 *
 * 目的：验证「一个重请求会不会把同时到达的轻请求一起拖住」。
 * Next.js 服务端只有一条事件循环，`better-sqlite3` 是**同步**驱动 —— 重活（大查询、
 * 批写）在执行期间会把循环占死，同一进程里的轻请求只能排队。这个脚本把这件事变成
 * 两个数字：轻接口在「无重活」与「重活并行」两种状态下的 p50/p95/p99。
 *
 * 用法：
 *   # 默认：重活 = 打一个需要登录的 HTTP 端点（题库列表 100 条）
 *   node scripts/measure-concurrency.mjs --base-url http://localhost:3000 \
 *        --duration 20 --concurrency 4 --cookie "$BENCH_COOKIE"
 *
 *   # 重活 = 直接对同一个 SQLite 文件批写（不依赖登录态，只测文件锁/IO 争用）
 *   node scripts/measure-concurrency.mjs --base-url http://localhost:3000 \
 *        --duration 20 --concurrency 4 --heavy-sql --db-file data/app.db
 *
 * 输出：轻接口的 基线（--baseline-seconds 秒，只有轻请求）与 并行期（--duration 秒）
 * 两行 p50/p95/p99，以及放大倍数。
 *
 * 判据（docs/perf-measure.md）：轻接口 p95 从 ~20ms 跳到秒级，即确认重活把轻请求
 * 串行化了；只涨到几十毫秒属于正常排队，不算问题。
 *
 * 注意：
 *   * `--heavy-sql` 会往 `--db-file` 指向的库里建一张 `perf_probe` 表并写数据，
 *     结束时自动 DROP（加 `--keep-probe-table` 可保留）。**默认不要指向生产库**，
 *     除非你清楚这一点。
 *   * 没有登录态时重活那条腿会全是 401/403，脚本会明确报「重活未真正执行」，
 *     不会把这种情况当成"没有串行化"。
 */
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const hasFlag = (name) => args.includes(name);

const baseUrl = argValue("--base-url", "http://localhost:3000").replace(
  /\/$/,
  "",
);
const durationSec = Number(argValue("--duration", "20"));
const lightConcurrency = Number(argValue("--concurrency", "1"));
const heavyConcurrency = Number(argValue("--heavy-concurrency", "1"));
const baselineSec = Number(argValue("--baseline-seconds", "3"));
const lightPath = argValue("--light-path", "/api/meta");
const lightIntervalMs = Number(argValue("--light-interval", "0"));

const heavyPath = argValue("--heavy-path", "/api/v1/questions?limit=100");
const heavyMethod = argValue("--heavy-method", "GET").toUpperCase();
const heavyBody = argValue("--heavy-body", "");
const cookie = argValue("--cookie", process.env.BENCH_COOKIE ?? "");
const sqlMode = hasFlag("--heavy-sql");
const keepProbeTable = hasFlag("--keep-probe-table");
const dbFile = argValue(
  "--db-file",
  path.resolve(process.cwd(), "data", process.env.DB_FILENAME || "app.db"),
);
const sqlBatch = Number(argValue("--sql-batch", "200"));

if (!Number.isFinite(durationSec) || durationSec <= 0) {
  console.error("--duration 必须是正数（秒）");
  process.exit(2);
}
if (!Number.isFinite(lightConcurrency) || lightConcurrency < 1) {
  console.error("--concurrency 必须是 ≥1 的整数（轻请求并发数）");
  process.exit(2);
}

// 子进程模式：只做同步批写，最后输出一行 JSON 汇总（见 runSqlHeavy 的说明）
if (hasFlag("--sql-worker-child")) {
  await sqlChildMain();
  process.exit(0);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

/**
 * 一个端点的采样器。
 * 4xx 与 5xx 分开计数：401/403 说明"重活没真正跑起来"（缺登录态），
 * 而 5xx 说明服务端已经扛不住 —— 两者都不能混进 p95 里当成功样本。
 */
function createSampler() {
  const latencies = [];
  let ok = 0;
  let rejected = 0;
  let failed = 0;

  return {
    record(ms, status) {
      if (status >= 200 && status < 400) {
        latencies.push(ms);
        ok++;
      } else if (status === 401 || status === 403) {
        rejected++;
      } else {
        failed++;
      }
    },
    recordError() {
      failed++;
    },
    summary() {
      latencies.sort((a, b) => a - b);
      return {
        n: latencies.length,
        ok,
        rejected,
        failed,
        p50: percentile(latencies, 0.5),
        p95: percentile(latencies, 0.95),
        p99: percentile(latencies, 0.99),
      };
    },
  };
}

async function hitLight() {
  const t0 = performance.now();
  try {
    const res = await fetch(`${baseUrl}${lightPath}`, {
      headers: cookie ? { cookie } : {},
    });
    await res.arrayBuffer(); // 计时必须包含响应体：只测首字节会漏掉序列化成本
    return { ms: performance.now() - t0, status: res.status };
  } catch {
    return { ms: performance.now() - t0, status: 0 };
  }
}

async function runLightLoad(seconds, sampler) {
  const deadline = Date.now() + seconds * 1000;
  const worker = async () => {
    while (Date.now() < deadline) {
      const { ms, status } = await hitLight();
      if (status === 0) sampler.recordError();
      else sampler.record(ms, status);
      if (lightIntervalMs > 0) {
        await new Promise((r) => setTimeout(r, lightIntervalMs));
      }
    }
  };
  await Promise.all(
    Array.from({ length: lightConcurrency }, () => worker()),
  );
}

/** 重活：HTTP 模式 —— 反复打同一个端点 */
function createHttpHeavyWorker(sampler) {
  const url = `${baseUrl}${heavyPath}`;
  const headers = {
    ...(cookie ? { cookie } : {}),
    ...(heavyBody ? { "content-type": "application/json" } : {}),
  };
  return async (deadline) => {
    while (Date.now() < deadline) {
      const t0 = performance.now();
      try {
        const res = await fetch(url, {
          method: heavyMethod,
          headers,
          ...(heavyBody ? { body: heavyBody } : {}),
        });
        await res.arrayBuffer();
        sampler.record(performance.now() - t0, res.status);
      } catch {
        sampler.recordError();
      }
    }
  };
}

/**
 * 重活：本地 SQL 批写模式。
 * 服务端用的是同步驱动，同进程内的批写会把事件循环占住；这个模式从**另一个进程**
 * 打同一个库文件，量到的是文件锁 + fsync 争用这一层（比 HTTP 模式轻，但不需要登录态）。
 *
 * 为什么必须另起进程：`better-sqlite3` 是同步 API，在本进程里批写会把**测量器自己**
 * 的事件循环也占住 —— 轻请求的延迟就变成"脚本自己堵自己"，量出来的 p95 全是假象
 * （实测会稳定等于整个测量时长）。所以这里 spawn 一个子进程跑批写，父进程只做 HTTP 采样。
 */
async function runSqlHeavy(deadline) {
  const { spawn } = await import("node:child_process");
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(import.meta.url),
      "--sql-worker-child",
      "--db-file",
      dbFile,
      "--sql-batch",
      String(sqlBatch),
      "--until",
      String(deadline),
      ...(keepProbeTable ? ["--keep-probe-table"] : []),
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  let out = "";
  let err = "";
  child.stdout.on("data", (chunk) => (out += chunk));
  child.stderr.on("data", (chunk) => (err += chunk));

  const exitCode = await new Promise((resolve) =>
    child.on("close", resolve),
  );

  const lastLine = out.trim().split("\n").pop() ?? "";
  let summary = null;
  try {
    summary = JSON.parse(lastLine);
  } catch {
    // 子进程没吐出汇总行：下面按失败处理，不猜数字
  }
  if (exitCode !== 0 || !summary) {
    console.error(
      `重活子进程失败（exit=${exitCode}）：${err.trim() || "无 stderr"}`,
    );
    return { n: 0, ok: 0, rejected: 0, failed: 1, p50: 0, p95: 0, p99: 0 };
  }
  return {
    n: summary.n,
    ok: summary.n,
    rejected: 0,
    failed: summary.errors,
    p50: summary.p50,
    p95: summary.p95,
    p99: summary.p99,
  };
}

/** 子进程：同步批写直到 deadline，最后一行输出 JSON 汇总 */
async function sqlChildMain() {
  const require = createRequire(import.meta.url);
  const Database = require("better-sqlite3");
  const until = Number(argValue("--until", String(Date.now())));
  const db = new Database(dbFile);
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS perf_probe (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const insert = db.prepare("INSERT INTO perf_probe (payload) VALUES (?)");
  const payload = "x".repeat(200);
  const batch = db.transaction((n) => {
    for (let i = 0; i < n; i++) insert.run(payload);
  });

  const latencies = [];
  let errors = 0;
  while (Date.now() < until) {
    const t0 = performance.now();
    try {
      batch(sqlBatch);
      latencies.push(performance.now() - t0);
    } catch {
      errors++;
    }
  }

  if (!keepProbeTable) db.exec("DROP TABLE IF EXISTS perf_probe");
  db.close();

  latencies.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      n: latencies.length,
      errors,
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
    }),
  );
}

function formatLine(label, s) {
  return `${label.padEnd(18)} p50 ${s.p50.toFixed(1).padStart(8)}ms  p95 ${s.p95
    .toFixed(1)
    .padStart(8)}ms  p99 ${s.p99.toFixed(1).padStart(8)}ms  n=${s.n}${
    s.rejected ? `  401/403=${s.rejected}` : ""
  }${s.failed ? `  failed=${s.failed}` : ""}`;
}

async function main() {
  console.log(
    `目标 ${baseUrl}｜轻接口 ${lightPath} × ${lightConcurrency}｜重活 ${
      sqlMode ? `本地 SQL 批写 ${dbFile}` : `${heavyMethod} ${heavyPath}`
    } × ${heavyConcurrency}`,
  );

  // 0. 连通性 + 预热（排除 DNS/TCP 首次成本）
  const warm = await hitLight();
  if (warm.status === 0) {
    console.error(`轻接口不可达：${baseUrl}${lightPath}`);
    process.exit(1);
  }

  // 1. 基线：只有轻请求
  const baseline = createSampler();
  console.log(`\n[1/2] 基线：${baselineSec}s 内只有轻请求…`);
  await runLightLoad(baselineSec, baseline);
  const base = baseline.summary();

  // 2. 并行：重活 + 轻请求
  const light = createSampler();
  const heavy = createSampler();
  const heavyWorker = sqlMode ? null : createHttpHeavyWorker(heavy);

  console.log(
    `[2/2] 并行：${durationSec}s 内 ${heavyConcurrency} 条重活 + ${lightConcurrency} 条轻请求轮询…\n`,
  );
  const deadline = Date.now() + durationSec * 1000;

  let heavyStats;
  if (sqlMode) {
    const [, sqlSummary] = await Promise.all([
      runLightLoad(durationSec, light),
      runSqlHeavy(deadline),
    ]);
    heavyStats = sqlSummary;
  } else {
    await Promise.all([
      runLightLoad(durationSec, light),
      ...Array.from({ length: heavyConcurrency }, () => heavyWorker(deadline)),
    ]);
    heavyStats = heavy.summary();
  }

  const under = light.summary();

  console.log(formatLine("轻接口 基线", base));
  console.log(formatLine("轻接口 重活并行期", under));
  console.log(formatLine("重活", heavyStats));

  if (heavyStats.n === 0) {
    console.log(
      `\n⚠ 重活一条都没成功执行（401/403=${heavyStats.rejected}，failed=${heavyStats.failed}）。`,
    );
    console.log(
      "  缺登录态时请传 --cookie，或改用 --heavy-sql 走本地批写；此结果不能用来判断串行化。",
    );
    process.exit(1);
  }

  const ratio = base.p95 > 0 ? under.p95 / base.p95 : Infinity;
  console.log(
    `\n轻接口 p95 放大：${base.p95.toFixed(1)}ms → ${under.p95.toFixed(1)}ms（×${ratio.toFixed(1)}）`,
  );
  if (under.p95 >= 1000) {
    console.log(
      "判据：p95 已到秒级 → 重活把轻请求串行化了（见 docs/perf-measure.md 的结论段）。",
    );
  } else if (ratio >= 10) {
    console.log(
      "判据：p95 放大 ≥10× 但仍在百毫秒级 → 有排队，尚未到「秒级卡死」，继续观察。",
    );
  } else {
    console.log("判据：p95 未明显放大 → 本次重活没有把事件循环占死。");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
