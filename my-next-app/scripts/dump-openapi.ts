/**
 * OpenAPI 契约快照工具。
 *
 * 为什么需要它：Flutter（mobile_app）与 Next.js 各自手写客户端代码，
 * 历史上出现过 7 处「一端改了字段名、另一端不知道」的漂移。
 * 这里把 `GET /api/openapi.json` 的输出固化成 docs/openapi.json，
 * 任何一端改了契约都会在 CI 的 `contract:check` 里暴露。
 *
 * 用法：
 *   npx tsx scripts/dump-openapi.ts           # 写入快照
 *   npx tsx scripts/dump-openapi.ts --check   # 与快照对比，不一致退出 1
 *
 * 注意：这里直接导入 Hono app 取文档，不启 HTTP 服务，
 * 因此本机（CentOS 7 / glibc 2.17）也能跑，不必等 CI。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const snapshotPath = resolve(here, "../../docs/openapi.json");
const checkMode = process.argv.includes("--check");

/** 递归排序对象键：避免「只是键顺序变了」被当成契约变更。 */
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [
          key,
          normalize((value as Record<string, unknown>)[key]),
        ]),
    );
  }
  return value;
}

function reportDiff(current: string, next: string) {
  console.error(
    [
      "OpenAPI 契约与快照不一致。",
      "如果是你有意修改接口：运行 npx tsx scripts/dump-openapi.ts 并提交 docs/openapi.json。",
      "如果不是：说明有路由改了字段却没同步给客户端，请先确认再改快照。",
      "",
      "差异（快照 → 当前，最多 40 处）：",
    ].join("\n"),
  );
  const a = current.split("\n");
  const b = next.split("\n");
  let shown = 0;
  for (let i = 0; i < Math.max(a.length, b.length) && shown < 40; i++) {
    if (a[i] !== b[i]) {
      console.error(`  L${i + 1}  - ${a[i] ?? "<无>"}`);
      console.error(`  L${i + 1}  + ${b[i] ?? "<无>"}`);
      shown++;
    }
  }
  if (shown === 0) console.error("  （仅行尾/空白差异）");
}

async function main() {
  // 导入 app 会连锁加载 @/env 与各 route 模块；给必要变量兜底，
  // 避免在没配 .env 的机器上因环境校验直接抛错。
  process.env.JWT_SECRET ||= "openapi-dump-placeholder";
  process.env.AI_API_KEY ||= "openapi-dump-placeholder";
  process.env.BACKUP_ENCRYPTION_KEY ||= "openapi-dump-placeholder";

  const { app } = await import("../src/lib/api/app");

  const document = app.getOpenAPIDocument({
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "AI Learning Mobile API",
      description: "API for AI Learning Mobile App",
    },
  });

  const serialized = JSON.stringify(normalize(document), null, 2) + "\n";

  if (!checkMode) {
    mkdirSync(dirname(snapshotPath), { recursive: true });
    writeFileSync(snapshotPath, serialized, "utf8");
    console.log(`OpenAPI 快照已写入 ${snapshotPath}`);
    // 显式退出：@libsql 的原生客户端会留下句柄，进程不主动退出会一直挂着
    // （本地实测 --check 成功路径会卡到超时）。
    process.exit(0);
  }

  let current: string;
  try {
    current = readFileSync(snapshotPath, "utf8");
  } catch {
    console.error(
      `缺少契约快照 ${snapshotPath}\n请先运行 npx tsx scripts/dump-openapi.ts 并提交结果。`,
    );
    process.exit(1);
  }

  // 语义比较而非逐字节比较：仓库的 autofix.ci 会用 prettier 重排 docs/*.json，
  // 逐字节比较会因为「只是格式化变了」误报。
  let normalized: string;
  try {
    normalized = JSON.stringify(normalize(JSON.parse(current)), null, 2) + "\n";
  } catch {
    console.error(
      `契约快照 ${snapshotPath} 不是合法 JSON，请重新生成。`,
    );
    process.exit(1);
  }

  if (normalized !== serialized) {
    reportDiff(normalized, serialized);
    process.exit(1);
  }

  console.log("OpenAPI 契约与快照一致。");
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("生成 OpenAPI 快照失败：", error);
  process.exit(1);
});
