// Ensure env vars have fallbacks before importing app modules
process.env.AI_API_KEY = process.env.AI_API_KEY || "dedupe-placeholder";
process.env.JWT_SECRET = process.env.JWT_SECRET || "dedupe-placeholder";

/**
 * 一次性清理：兜底题重复 + content_hash 回填（P1-1 存量）。
 *
 * 背景：线上库 2026-11-14 快照有 84 条兜底题（type/source 均为空），其中 80 条与真实题
 * 题干逐字相同；30 组「答案冲突」是兜底副本把多选答案截成首项所致。
 *
 * 用法（**先 dry-run，看报告再 apply**）：
 *   npx tsx scripts/dedupe-fallback-questions.ts            # 只统计
 *   npx tsx scripts/dedupe-fallback-questions.ts --apply    # 实际写库
 *
 * 前置：先备份（VACUUM INTO，不要 cp——WAL 模式下 cp 可能不一致），并在低峰执行。
 */
async function main() {
  const apply = process.argv.includes("--apply");
  const { initDatabase } = await import("../src/lib/db");
  await initDatabase();
  const { dedupeFallbackQuestions } =
    await import("../src/lib/services/question-dedupe-cleanup");

  console.log(apply ? "⚠️  APPLY 模式：将写库" : "🔍 DRY-RUN：只统计，不写库");
  const report = await dedupeFallbackQuestions({ dryRun: !apply });
  console.log(JSON.stringify(report, null, 2));

  if (!apply) {
    console.log(
      "\n确认无误后重跑并加 --apply。执行前请已完成备份（VACUUM INTO）。",
    );
  } else {
    console.log("\n✅ 已完成。建议立即用体检 SQL 复核：重复组应为 0。");
  }
}

main().catch((error) => {
  console.error("❌ 清理失败，数据库未变更（事务外失败需人工核对）");
  console.error(error);
  process.exit(1);
});
