/**
 * 修复已导入的填空题内容
 * 将 <input> 标签替换为下划线占位符（_____）
 *
 * 使用方法：
 * npx tsx scripts/fix-fill-blank-content.ts
 */

import { drizzleDb } from "../src/lib/db";

async function fixFillBlankContent() {
  console.log("🔍 开始修复填空题内容...");

  try {
    // 查询所有填空题
    const questions = drizzleDb
      .prepare(
        `
            SELECT id, content, content_html, type 
            FROM questions 
            WHERE type = 'fill_blank'
        `,
      )
      .all() as Array<{
      id: number;
      content: string;
      content_html: string;
      type: string;
    }>;

    console.log(`📊 找到 ${questions.length} 道填空题`);

    let updated = 0;
    let skipped = 0;

    for (const q of questions) {
      // 如果内容已经包含下划线占位符，跳过
      if (q.content.includes("_____")) {
        skipped++;
        continue;
      }

      // 如果 content_html 存在且包含 input 标签，进行修复
      if (q.content_html && q.content_html.includes("<input")) {
        // 将 input 标签替换为下划线
        const newContent = q.content_html
          .replace(/<input[^>]*\/?>/gi, "_____")
          .replace(/<[^>]*>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .trim();

        // 更新数据库
        drizzleDb
          .prepare(
            `
                    UPDATE questions 
                    SET content = ? 
                    WHERE id = ?
                `,
          )
          .run(newContent, q.id);

        updated++;
        console.log(`✅ 修复题目 #${q.id}`);
      } else {
        // 没有 HTML 内容，尝试从现有 content 中修复
        // 如果 content 中没有明显的空白标记，添加占位符提示
        if (!q.content.includes("_____") && !q.content.includes("___")) {
          // 无法自动修复，记录日志
          console.log(`⚠️  题目 #${q.id} 无法自动修复，可能需要手动处理`);
        }
        skipped++;
      }
    }

    console.log("\n📈 修复完成统计:");
    console.log(`   - 总题目数：${questions.length}`);
    console.log(`   - 已修复：${updated}`);
    console.log(`   - 已跳过：${skipped}`);
  } catch (error) {
    console.error("❌ 修复过程中出错:", error);
    throw error;
  }
}

// 执行修复
fixFillBlankContent()
  .then(() => {
    console.log("✅ 所有修复完成");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ 修复失败:", error);
    process.exit(1);
  });
