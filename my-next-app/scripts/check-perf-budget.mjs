#!/usr/bin/env node
/**
 * 性能预算门禁（docs/performance.md T-05 / T-06）
 *
 * 治的是「靠人记得」：规范里写了"禁止死 import、禁止塞大图"，但没有红灯，
 * 于是 /knowledge 的死 import 把 remark+kaTeX 拉进首包、public 里躺了 1.3MB
 * 零引用死图，都没人拦得住。这个脚本把两类预算变成 exit 1。
 *
 * 两类检查：
 *   1) 路由 JS 体积：读 .next/app-build-manifest.json，按路由去重 chunk 后
 *      **现场 gzip** 求字节数，与 perf-baseline.json 比对 ——
 *      超过绝对阈值（默认 180KB）或环比涨 5% 即失败。
 *   2) public/ 单文件体积：> 100KB 且不在白名单即失败。
 *
 * 生成基线：node scripts/check-perf-budget.mjs --update
 * 只想看当前数值：node scripts/check-perf-budget.mjs --dry
 *
 * 为什么用 gzip 现场算而不是读构建产物里的数字：
 *   Next 的 route 表给的是解析后大小，和用户实际下载量差 3~4 倍，
 *   预算按传输量定才有意义。
 *
 * 为什么缺 manifest 时不静默通过：
 *   静默通过会让"没构建"看起来像"没超预算"。这里明确 warn 并以 0 退出，
 *   同时在输出里写明"未校验"，让 CI 日志能看出来。
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const update = args.includes("--update");
const dry = args.includes("--dry");

function argValue(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const root = path.resolve(import.meta.dirname, "..");
const manifestPath =
  argValue("--manifest") ?? path.join(root, ".next", "app-build-manifest.json");
const publicDir = argValue("--public-dir") ?? path.join(root, "public");
const baselinePath = argValue("--baseline") ?? path.join(root, "perf-baseline.json");

/** 单路由 first-load JS 上限（gzip 后） */
const ROUTE_LIMIT_BYTES = 180 * 1024;
/** 环比允许涨幅 */
const ROUTE_GROWTH_RATIO = 1.05;
/** public 单文件上限 */
const PUBLIC_FILE_LIMIT = 100 * 1024;
/** public 白名单（前缀匹配）。每条都要写清"为什么允许它超 100KB"。 */
const PUBLIC_ALLOW = [
  // next/font 生成的 woff2（variable 字重，单文件已是最优形态）
  /^fonts\//,
  // 用户上传的教材图片与书籍扫描件，体积不可控
  /^uploads\//,
  /^books\//,
  // 品牌 logo：被 login/register/AppSidebar/Navbar 四处引用，256KB 偏大，
  // 但压缩属于视觉决策（会掉清晰度），留给设计侧处理，不在这里静默压缩。
  /^logo\.png$/,
  // PWA 图标：manifest.ts 与 layout.tsx 的 apple-touch-icon 引用。
  // 两张 256KB 且字节完全相同（192 实际是 512 的副本），属于待优化项，
  // 同样不在门禁里自动处理。
  /^icons\//,
  // 运行时按需 fetch 的静态数据（KeypointTree 拉 /data/keypoints.json）。
  // JSON 文本在 HTTP 层会被 gzip 压到 1/5，与图片不同性质，因此放行。
  /^data\//,
];

const failures = [];
const warnings = [];

function kb(n) {
  return `${(n / 1024).toFixed(1)}KB`;
}

/** 递归列出目录下所有文件（相对路径） */
function walk(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p));
  }
  return out;
}

// ---------- 1. 路由 JS 体积 ----------
/**
 * 采信来源的取法（按优先级）：
 *
 *   1. `.next/server/app/**\/page_client-reference-manifest.js` 的 `entryJSFiles`
 *      —— webpack 构建下这是 Next 自己算 First Load JS 的同一份数据，
 *      能给出**按路由**的 chunk 清单；
 *   2. 找不到上面的清单时退化为**全站 JS 总量**（`.next/static/chunks/**\/*.js`
 *      + `.next/static/css/**\/*.css`）—— Turbopack 构建（Next 16 默认）不产出
 *      `app-build-manifest.json`，也不在终端打印尺寸列，此时按路由无法取数，
 *      但"总量环比"仍能抓住死 import / 依赖膨胀这类回归；
 *   3. 两者都取不到（未构建）→ 明确报"未校验"，不静默通过。
 *
 * 预算永远按 gzip 后的字节算：构建产物里的数字是解析后大小，
 * 与用户实际下载量差 3~4 倍。
 */
function gzipSize(file) {
  return zlib.gzipSync(fs.readFileSync(file), { level: 9 }).length;
}

function walkNext(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkNext(p, out);
    else out.push(p);
  }
  return out;
}

function routeFromManifestPath(file, nextDir) {
  const rel = path.relative(nextDir, file).split(path.sep).join("/");
  // server/app/<segments>/page_client-reference-manifest.js  →  /<segments>
  const m = rel.match(/^(?:server\/)?app\/(.*)\/page_client-reference-manifest\.js$/);
  if (!m) return null;
  const segs = m[1]
    .split("/")
    .filter((seg) => !/^\(.+\)$/.test(seg)); // 去掉 route group 括号段
  return "/" + segs.join("/");
}

function routeSizesFromClientManifests(nextDir) {
  const manifests = walkNext(path.join(nextDir, "server", "app")).filter((f) =>
    f.endsWith("page_client-reference-manifest.js"),
  );
  if (manifests.length === 0) return null;

  const sizes = {};
  for (const file of manifests) {
    const route = routeFromManifestPath(file, nextDir) ?? file;
    let mod;
    try {
      // 构建产物是 CJS；用 createRequire 读它，比正则解析可靠
      mod = require(file);
    } catch {
      continue;
    }
    const entryMap = mod?.entryJSFiles ?? {};
    const files = new Set();
    for (const list of Object.values(entryMap)) {
      for (const rel of list ?? []) files.add(rel);
    }
    if (files.size === 0) continue;
    let total = 0;
    for (const rel of files) {
      const abs = path.join(nextDir, rel);
      if (fs.existsSync(abs)) total += gzipSize(abs);
    }
    if (total > 0) sizes[route] = total;
  }
  return Object.keys(sizes).length > 0 ? sizes : null;
}

function totalAssetsSize(nextDir) {
  const files = [
    ...walkNext(path.join(nextDir, "static", "chunks")),
    ...walkNext(path.join(nextDir, "static", "css")),
  ].filter((f) => f.endsWith(".js") || f.endsWith(".css"));
  if (files.length === 0) return null;
  let total = 0;
  for (const f of files) total += gzipSize(f);
  return { total, files: files.length };
}

function collectSizes() {
  const nextDir = path.dirname(manifestPath);
  if (!fs.existsSync(nextDir)) {
    warnings.push(
      `未找到 ${path.relative(root, nextDir)}（未构建？）—— JS 预算**未校验**`,
    );
    return null;
  }

  const perRoute = routeSizesFromClientManifests(nextDir);
  if (perRoute) {
    return { mode: "route", sizes: perRoute };
  }

  const total = totalAssetsSize(nextDir);
  if (total) {
    warnings.push(
      `未找到 per-route 的 client-reference-manifest（Turbopack 构建不产出
         app-build-manifest.json），已退化为**全站 JS 总量**预算：` +
        `${total.files} 个文件、gzip ${kb(total.total)}`,
    );
    return { mode: "total", sizes: { __total__: total.total } };
  }

  warnings.push(
    `未找到任何可度量的 JS 产物（${path.relative(root, nextDir)} 下既无 client-reference-manifest 也无 static/chunks）—— JS 预算**未校验**`,
  );
  return null;
}

const collected = collectSizes();
const sizes = collected?.sizes ?? null;
const mode = collected?.mode ?? null;
let baseline = {};
if (fs.existsSync(baselinePath)) {
  baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
}
const baselineRoutes = baseline.routes ?? {};

// 口径漂移检查：基线是 route 模式，这次只量到总量（或反过来），
// 说明"按路由 180KB"这条判据已经失效 —— 必须报出来，不能安静降级。
if (mode && baseline.mode && baseline.mode !== mode) {
  failures.push(
    `体积预算的测量口径变了：基线是 ${baseline.mode}，本次是 ${mode}。` +
      `两种口径不可比，请先用 npm run perf:baseline 在新口径下重建基线，并在 PR 里说明原因。`,
  );
}

if (sizes) {
  const rows = [];
  for (const [route, bytes] of Object.entries(sizes).sort(
    (a, b) => b[1] - a[1],
  )) {
    const prev = baselineRoutes[route];
    const growth = prev ? bytes / prev : 0;
    const overLimit = mode === "route" && bytes > ROUTE_LIMIT_BYTES;
    const overGrowth = prev ? growth > ROUTE_GROWTH_RATIO : false;
    rows.push({ route, bytes, prev, growth, overLimit, overGrowth });
    if (overLimit) {
      failures.push(
        `路由 JS 超预算：${route} = ${kb(bytes)} > ${kb(ROUTE_LIMIT_BYTES)}`,
      );
    }
    if (overGrowth) {
      failures.push(
        `JS 环比上涨：${route} ${kb(prev)} → ${kb(bytes)}（+${(
          (growth - 1) *
          100
        ).toFixed(1)}%，上限 +5%）`,
      );
    }
  }

  console.log(
    `\nJS 体积（gzip，${mode === "route" ? "按路由 first-load" : "全站总量"}）：`,
  );
  for (const r of rows) {
    const delta = r.prev
      ? ` (${r.growth >= 1 ? "+" : ""}${((r.growth - 1) * 100).toFixed(1)}%)`
      : " (新)";
    console.log(
      `  ${r.overLimit || r.overGrowth ? "✗" : "✓"} ${String(r.route).padEnd(28)} ${kb(r.bytes).padStart(9)}${delta}`,
    );
  }

  if (update) {
    baseline.routes = Object.fromEntries(
      Object.entries(sizes).sort((a, b) => a[0].localeCompare(b[0])),
    );
    baseline.mode = mode;
  }
}

// ---------- 2. public 大文件 ----------
const publicFiles = walk(publicDir)
  .map((rel) => ({
    rel: rel.split(path.sep).join("/"),
    bytes: fs.statSync(path.join(publicDir, rel)).size,
  }))
  .sort((a, b) => b.bytes - a.bytes);

const publicViolations = publicFiles.filter(
  (f) => f.bytes > PUBLIC_FILE_LIMIT && !PUBLIC_ALLOW.some((re) => re.test(f.rel)),
);

console.log("\npublic/ 大文件（> 100KB）：");
if (publicFiles.filter((f) => f.bytes > PUBLIC_FILE_LIMIT).length === 0) {
  console.log("  （无）");
}
for (const f of publicFiles.filter((f) => f.bytes > PUBLIC_FILE_LIMIT)) {
  const allowed = !publicViolations.some((v) => v.rel === f.rel);
  console.log(
    `  ${allowed ? "✓ 白名单" : "✗ 超限"} ${f.rel.padEnd(36)} ${kb(f.bytes)}`,
  );
}
for (const f of publicViolations) {
  failures.push(
    `public 文件超预算且不在白名单：${f.rel} = ${kb(f.bytes)} > ${kb(PUBLIC_FILE_LIMIT)}（删掉或显式加入 PUBLIC_ALLOW）`,
  );
}

if (update) {
  baseline.publicAllow = PUBLIC_ALLOW.map((re) => re.source);
  baseline.updatedAt = new Date().toISOString();
  fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + "\n");
  console.log(`\n基线已写入 ${path.relative(root, baselinePath)}`);
}

for (const w of warnings) console.warn(`\n[warn] ${w}`);

if (failures.length > 0) {
  if (dry) {
    console.log("\n(--dry) 存在超预算项，未以非零码退出：");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(0);
  }
  console.error("\n性能预算未通过：");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("\n性能预算通过。");
