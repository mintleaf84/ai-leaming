/**
 * 批量向量化题目脚本
 * 将题库中的题目内容批量导入向量库
 *
 * 使用方法:
 *   npx tsx scripts/vectorize-questions.ts
 *   npx tsx scripts/vectorize-questions.ts --dry-run  // 预览不写入
 *   npx tsx scripts/vectorize-questions.ts --limit 100 // 只处理前100条
 */

import { drizzleDb, drizzleSchema } from "../src/lib/db";
import { eq, sql, desc } from "drizzle-orm";
import { ragService } from "../src/lib/ai/rag";

interface Args {
  dryRun: boolean;
  limit: number;
  batchSize: number;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes("--dry-run"),
    limit: parseInt(
      args.find((a) => a.startsWith("--limit"))?.split("=")[1] || "1000",
    ),
    batchSize: parseInt(
      args.find((a) => a.startsWith("--batch"))?.split("=")[1] || "10",
    ),
  };
}

async function vectorizeQuestions() {
  const args = parseArgs();

  console.log("=".repeat(50));
  console.log("题目向量批量导入脚本");
  console.log("=".repeat(50));
  console.log(`模式: ${args.dryRun ? "预览 (不写入)" : "实际写入"}`);
  console.log(`处理数量: ${args.limit}`);
  console.log(`批次大小: ${args.batchSize}`);
  console.log("=".repeat(50));

  // 1. 检查向量库表是否存在
  try {
    await drizzleDb.run(sql`SELECT vec_version()`);
    console.log("✓ sqlite-vec 扩展已加载");
  } catch {
    console.error("✗ sqlite-vec 扩展未加载，请先配置");
    process.exit(1);
  }

  // 2. 检查 content_chunks 表是否存在，不存在则创建
  const tableExists = await drizzleDb
    .select({ count: sql<number>`count(*)` })
    .from(sql`sqlite_master`)
    .where(sql`type='table' AND name='content_chunks'`)
    .get();

  if (!tableExists || Number(tableExists.count) === 0) {
    const { embeddingDimensions } = await import("../src/lib/ai/client").then(
      (m) => m.getAiConfig(),
    );
    const dim = embeddingDimensions || 1024;

    await drizzleDb.run(sql`
      CREATE TABLE IF NOT EXISTS content_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        metadata TEXT
      );
      CREATE VIRTUAL TABLE content_vec USING vec0(
        embedding float[${dim}]
      );
    `);
    console.log("✓ 已创建向量表 (content_chunks, content_vec)");
  } else {
    console.log("✓ 向量表已存在");
  }

  // 3. 获取需要向量化的题目
  const questions = await drizzleDb
    .select({
      id: drizzleSchema.questions.id,
      content: drizzleSchema.questions.content,
      explanation: drizzleSchema.questions.explanation,
      tags: drizzleSchema.questions.tags,
      dimension: drizzleSchema.questions.dimension,
    })
    .from(drizzleSchema.questions)
    .where(sql`${drizzleSchema.questions.content} IS NOT NULL`)
    .limit(args.limit)
    .all();

  console.log(`\n待处理题目: ${questions.length} 道`);

  if (questions.length === 0) {
    console.log("没有需要向量化的题目");
    return;
  }

  // 4. 获取已向量化的题目 ID
  const existingIds = await drizzleDb.all<{ id: number }>(sql`
    SELECT id FROM content_chunks WHERE json_extract(metadata, '$.source_type') = 'question'
  `);
  const existingIdSet = new Set(existingIds.map((r) => r.id));
  const newQuestions = questions.filter((q) => !existingIdSet.has(q.id));

  console.log(`已有向量数据: ${existingIds.length} 道`);
  console.log(`新增向量数据: ${newQuestions.length} 道`);

  if (args.dryRun) {
    console.log("\n--- 预览前5条 ---");
    newQuestions.slice(0, 5).forEach((q, i) => {
      console.log(`${i + 1}. [${q.id}] ${q.content?.substring(0, 50)}...`);
    });
    console.log(`\n共 ${newQuestions.length} 条待写入（预览模式不写入）`);
    return;
  }

  if (newQuestions.length === 0) {
    console.log("\n所有题目已向量化，无需处理");
    return;
  }

  // 5. 批量写入向量
  console.log("\n开始向量化...");
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < newQuestions.length; i += args.batchSize) {
    const batch = newQuestions.slice(i, i + args.batchSize);

    await Promise.allSettled(
      batch.map(async (q) => {
        try {
          const content = q.content || "";
          const metadata = {
            source_type: "question",
            question_id: q.id,
            tags: q.tags ? JSON.parse(q.tags) : [],
            dimension: q.dimension,
            explanation: q.explanation,
          };

          await ragService.addChunk(content, metadata);
          successCount++;
        } catch (error) {
          console.error(`向量化题目 ${q.id} 失败:`, error);
          failCount++;
        }
      }),
    );

    const progress = Math.min(i + args.batchSize, newQuestions.length);
    process.stdout.write(
      `\r进度: ${progress}/${newQuestions.length} (${Math.round((progress / newQuestions.length) * 100)}%)`,
    );
  }

  console.log("\n");
  console.log("=".repeat(50));
  console.log("完成!");
  console.log(`成功: ${successCount} 道`);
  console.log(`失败: ${failCount} 道`);
  console.log("=".repeat(50));
}

// 运行脚本
vectorizeQuestions().catch(console.error);
