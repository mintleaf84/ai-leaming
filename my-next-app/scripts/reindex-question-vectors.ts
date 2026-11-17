/**
 * 题库向量索引回填脚本（embedding 写入路径）。
 *
 * 背景：`vec-store.ts` 只是向量表的唯一入口，`admin-service` 只在**单题编辑**时
 * best-effort 写一条。存量题目、批量导入的题目都得靠这个脚本回填 —— 一次
 * embedding 就是一次 API 调用，所以必须限量分批，不能在请求路径里一把梭。
 *
 * 用法:
 *   npx tsx scripts/reindex-question-vectors.ts --limit 100 --dry-run
 *   npx tsx scripts/reindex-question-vectors.ts --limit 100
 *   npx tsx scripts/reindex-question-vectors.ts --limit 100 --offset 100
 *
 * 参数:
 *   --limit <n>   本次最多处理多少题（默认 50，上限 500）
 *   --offset <n>  从第几条开始，按 id 升序（默认 0）
 *   --dry-run     只统计待处理题数：不调 embedding、不写向量表
 */
import { count } from "drizzle-orm";
import {
  closeDb,
  closeDrizzle,
  drizzleDb,
  drizzleSchema,
  initDatabase,
} from "../src/lib/db";
import { isVectorAvailable } from "../src/lib/db/vec-store";
import {
  DEFAULT_REINDEX_LIMIT,
  MAX_REINDEX_LIMIT,
  reindexQuestions,
} from "../src/lib/services/question-vector-index";

interface Args {
  limit: number;
  offset: number;
  dryRun: boolean;
}

function readNumberArg(argv: string[], name: string): number | undefined {
  // 同时接受 `--limit 100` 与 `--limit=100`：手敲和复制粘贴都别踩格式
  const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) {
    const value = Number(inline.slice(`--${name}=`.length));
    return Number.isFinite(value) ? value : undefined;
  }
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = Number(argv[index + 1]);
  return Number.isFinite(value) ? value : undefined;
}

function parseArgs(argv: string[]): Args {
  const requestedLimit = readNumberArg(argv, "limit");
  const offset = readNumberArg(argv, "offset") ?? 0;

  let limit = requestedLimit === undefined ? DEFAULT_REINDEX_LIMIT : Math.trunc(requestedLimit);
  if (limit < 1) limit = DEFAULT_REINDEX_LIMIT;
  if (limit > MAX_REINDEX_LIMIT) {
    console.warn(
      `⚠️  --limit ${limit} 超过单次上限 ${MAX_REINDEX_LIMIT}，按 ${MAX_REINDEX_LIMIT} 处理（分批多跑几次）`,
    );
    limit = MAX_REINDEX_LIMIT;
  }

  return {
    limit,
    offset: Math.max(0, Math.trunc(offset)),
    dryRun: argv.includes("--dry-run"),
  };
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  console.log("=".repeat(56));
  console.log("题库向量索引回填");
  console.log("=".repeat(56));
  console.log(`模式     : ${args.dryRun ? "dry-run（不调 API、不写库）" : "实际写入"}`);
  console.log(`limit    : ${args.limit}`);
  console.log(`offset   : ${args.offset}`);
  console.log("=".repeat(56));

  await initDatabase();

  if (!isVectorAvailable()) {
    console.error(
      "✗ sqlite-vec 不可用（扩展没加载 / 向量表建不出来），回填无从谈起。请先修向量能力再跑。",
    );
    return 1;
  }

  const totalRow = await drizzleDb
    .select({ count: count() })
    .from(drizzleSchema.questions)
    .get();
  const total = Number(totalRow?.count ?? 0);
  console.log(`题库总数 : ${total}`);
  console.log("=".repeat(56));

  if (total === 0) {
    console.log("题库是空的，没有可索引的题目。");
    return 0;
  }
  if (args.offset >= total) {
    console.log(`offset=${args.offset} 已超出题库总数 ${total}，没有剩余题目。`);
    return 0;
  }

  const startedAt = Date.now();
  const result = await reindexQuestions({
    limit: args.limit,
    offset: args.offset,
    dryRun: args.dryRun,
    onProgress: (done, total) => {
      process.stdout.write(`\r进度: ${done}/${total}`);
    },
  });
  if (!args.dryRun && result.scanned > 0) process.stdout.write("\n");

  const elapsed = Date.now() - startedAt;
  const remaining = Math.max(0, total - args.offset - result.scanned);

  console.log("-".repeat(56));
  if (result.unavailable) {
    console.error("✗ 向量能力不可用，整批跳过");
    return 1;
  }
  console.log(`scanned  : ${result.scanned}`);
  console.log(`indexed  : ${result.indexed}`);
  console.log(`skipped  : ${result.skipped}`);
  console.log(`failed   : ${result.failed}`);
  console.log(`剩余     : ${remaining} 题（offset=${args.offset + result.scanned} 起）`);
  console.log(`耗时     : ${formatDuration(elapsed)}`);
  console.log("-".repeat(56));

  if (args.dryRun) {
    console.log(
      `dry-run：以上 ${result.scanned} 题为本次（offset=${args.offset}）会处理的题数，未发起任何 embedding 调用、未写向量表。`,
    );
    console.log(
      `去掉 --dry-run 即开始回填；超过 ${MAX_REINDEX_LIMIT} 题请用 --offset 分批。`,
    );
  } else {
    console.log(
      `下一步：用 searchSimilarQuestions 抽样 5 题，人工看召回是否合理（同文应召回自身，无关题不该挤进前 3）。`,
    );
    if (result.skipped > 0) {
      console.log(
        `注意：skipped=${result.skipped} 多为 embedding 降级或题面为空 —— 降级伪向量故意不入库，修好 AI 配置后重跑本页即可。`,
      );
    }
    if (remaining > 0) {
      console.log(
        `还有 ${remaining} 题没处理：用 --offset ${args.offset + result.scanned} 继续。`,
      );
    }
  }

  return result.failed > 0 ? 2 : 0;
}

main()
  .then(async (code) => {
    await closeDrizzle();
    closeDb();
    process.exitCode = code;
  })
  .catch(async (error) => {
    // audit-allow: 脚本入口，错误只能打到 stderr 并以非 0 退出，没有上层可抛
    console.error("✗ 回填失败:", error);
    await closeDrizzle();
    closeDb();
    process.exitCode = 1;
  });
