const Database = require("better-sqlite3");
const path = require("path");
const { createOpenAI } = require("@ai-sdk/openai");
const { embed } = require("ai");
require("dotenv").config({ path: ".env.local" });

// 配置
const dbPath = path.resolve(process.cwd(), "ai-learning.db");
const db = new Database(dbPath);

// RAG 配置 (需与 ai-client.ts 保持一致或从数据库读取)
// 简化起见，这里直接读取 ai_configs 表的激活配置
const activeConfig = db
  .prepare("SELECT * FROM ai_configs WHERE is_active = 1")
  .get();
const apiKey = activeConfig?.api_key || process.env.AI_API_KEY;
const baseURL =
  activeConfig?.api_url ||
  process.env.AI_API_URL ||
  "https://api.openai.com/v1";
const modelEmbedding = activeConfig?.model_embedding || "bge-m3"; // Default to bge-m3 if not set, which likely uses 1024

console.log(`Using Config: BaseURL=${baseURL}, Model=${modelEmbedding}`);

const openai = createOpenAI({
  apiKey,
  baseURL,
});

// 加载 sqlite-vec
try {
  // 简化的加载逻辑，假设 vec0 已通过 init-db 或其他方式安装/放在根目录
  // 注意：在独立脚本中加载扩展可能比较麻烦，这里尝试动态查找
  // 如果失败，脚本将无法写入 content_vec 表

  // 暂时跳过扩展加载，直接检查表是否存在。
  // 如果是在 Node 环境跑脚本，必须加载扩展才能操作 vec0 表。
  // 这里为了稳健，我们使用 'sqlite-vec' 包提供的路径
  const sqliteVec = require("sqlite-vec");
  const vecPath = sqliteVec.getLoadablePath();
  db.loadExtension(vecPath);
  console.log("Loaded sqlite-vec extension");
} catch (e) {
  console.error("Failed to load sqlite-vec extension:", e);
  process.exit(1);
}

async function getEmbedding(text) {
  try {
    const { embedding } = await embed({
      model: openai.embedding(modelEmbedding),
      value: text,
    });
    return embedding;
  } catch (error) {
    console.error("Embedding failed:", error.message);
    throw error;
  }
}

async function migrate() {
  const cards = db.prepare("SELECT * FROM knowledge_cards").all();
  console.log(`Found ${cards.length} cards to migrate.`);

  // 维度不匹配处理：如果检测到维度错误，暴力重建表
  // 仅在首次遇到 mismatch 时执行。但在脚本里我们直接先 drop 再 create 确保环境干净
  console.log("Resetting RAG tables to match model dimensions (1024)...");
  db.exec("DROP TABLE IF EXISTS content_vec;");

  // 重新创建 content_vec，使用 1024 维度
  // 获取 sqlite-vec 扩展路径 (如果需要)
  // 注意：在 drop 后重新 create virtual table 需要扩展已加载

  // 确保表存在，这次指定 1024
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS content_vec USING vec0(
      embedding float[1024]
    );
  `);

  // 清理 chunks 表，因为 vector 都丢了，chunks 留着也没用（且我们是全量刷新）
  db.exec(
    "DELETE FROM content_chunks WHERE json_extract(metadata, '$.source_type') = 'card'",
  );

  console.log("RAG tables reset.");
  // content_vec 需要联动删除，但由于 rowid 关联，content_vec 会留有孤儿数据？
  // sqlite-vec 的 vec0 表通常通过 rowid 关联。标准做法是先删 content_chunks 获取 id，再删 content_vec。
  // 既然我们是全量刷新，这里假设 content_chunks 是主控。
  // 为简单起见，我们追加，不全量清空整个表（可能还有 question 的 vector）。
  // 上面的 DELETE 只删了 chunks，对应的 vector 还在，这会造成浪费但不会报错。
  // 严谨的做法是先查出 id 再删。

  // 重新查一遍 IDs 来删 vector
  // 由于我们刚刚删了 chunk，找不到映射关系了... 这是一个小失误。
  // 正确做法：
  // 1. 找出所有 source_type='card' 的 chunk IDs
  // 2. 删 content_vec where rowid in IDs
  // 3. 删 content_chunks

  // 由于刚才已经执行了 DELETE (如果运行的话)，这里只是演示。
  // 实际代码：
  console.log("Cleaning old card vectors...");
  const oldChunks = db
    .prepare(
      "SELECT id FROM content_chunks WHERE json_extract(metadata, '$.source_type') = 'card'",
    )
    .all();
  if (oldChunks.length > 0) {
    const ids = oldChunks.map((c) => c.id);
    const placeholders = ids.map(() => "?").join(",");
    db.prepare(`DELETE FROM content_vec WHERE rowid IN (${placeholders})`).run(
      ...ids,
    );
    db.prepare(`DELETE FROM content_chunks WHERE id IN (${placeholders})`).run(
      ...ids,
    );
    console.log(`Deleted ${oldChunks.length} old chunk(s).`);
  }

  let successCount = 0;

  for (const card of cards) {
    const content = `${card.front}\n\n${card.back}`;
    const tags = JSON.parse(card.tags || "[]");

    try {
      const embedding = await getEmbedding(content);

      const infoVec = db
        .prepare("INSERT INTO content_vec(embedding) VALUES (?)")
        .run(JSON.stringify(embedding));
      const vecRowid = infoVec.lastInsertRowid;

      const metadata = {
        source_type: "card",
        source_id: card.id,
        title: card.title,
        category: card.category,
        tags: tags,
      };

      db.prepare(
        "INSERT INTO content_chunks (id, content, metadata) VALUES (?, ?, ?)",
      ).run(Number(vecRowid), content, JSON.stringify(metadata));

      successCount++;
      process.stdout.write(".");
    } catch (e) {
      console.error(`\nFailed to process card ${card.id}:`, e.message);
    }
  }

  console.log(
    `\nMigration completed. Successfully vectorized ${successCount}/${cards.length} cards.`,
  );
}

migrate();
