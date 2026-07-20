/**
 * 回溯更新掌握度脚本
 * 根据历史练习记录重新计算所有知识点的掌握度
 */

import { db } from "../src/lib/db";
import { masteryService } from "../src/lib/services/mastery";

async function recalculateMastery() {
  console.log("🔄 开始回溯更新掌握度...\n");

  // 1. 清空现有掌握度数据
  console.log("1. 清空现有掌握度数据...");
  db.exec("DELETE FROM user_mastery");
  console.log("   ✅ 已清空 user_mastery 表\n");

  // 2. 获取所有练习记录（按时间排序）
  console.log("2. 获取所有练习记录...");
  const logs = db
    .prepare(
      `
    SELECT 
      l.user_id,
      l.question_id,
      l.is_correct,
      q.tags,
      q.dimension
    FROM practice_logs l
    JOIN questions q ON l.question_id = q.id
    ORDER BY l.timestamp ASC
  `,
    )
    .all() as any[];

  console.log(`   找到 ${logs.length} 条练习记录\n`);

  // 3. 逐条更新掌握度
  console.log("3. 逐条更新掌握度...");
  let processed = 0;
  let updated = 0;

  for (const log of logs) {
    processed++;

    // 解析 tags
    let tags: string[] = [];
    try {
      tags = JSON.parse(log.tags || "[]");
    } catch {
      tags = [];
    }

    if (tags.length === 0) continue;

    // 更新每个知识点的掌握度
    for (const tag of tags) {
      masteryService.updateMastery(
        log.user_id,
        tag,
        log.dimension || "knowledge",
        !!log.is_correct,
      );
      updated++;
    }

    // 每100条打印一次进度
    if (processed % 100 === 0) {
      console.log(`   已处理 ${processed}/${logs.length} 条记录...`);
    }
  }

  console.log(
    `   ✅ 完成！共处理 ${processed} 条记录，更新 ${updated} 次掌握度\n`,
  );

  // 4. 打印统计
  console.log("4. 掌握度统计:");
  const mastery = db
    .prepare(
      `
    SELECT tag_name, score, correct_count, total_count
    FROM user_mastery 
    WHERE user_id = 1
    ORDER BY score DESC
    LIMIT 10
  `,
    )
    .all() as any[];

  console.log("\n   前10个知识点掌握度:");
  console.log("   ─────────────────────────────────────");
  for (const m of mastery) {
    const bar =
      "█".repeat(Math.round(m.score / 10)) +
      "░".repeat(10 - Math.round(m.score / 10));
    console.log(
      `   ${bar} ${m.score.toFixed(1)}% - ${m.tag_name} (${m.correct_count}/${m.total_count})`,
    );
  }

  console.log("\n✅ 回溯更新完成！");
}

recalculateMastery().catch(console.error);
