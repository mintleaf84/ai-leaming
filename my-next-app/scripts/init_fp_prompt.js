const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.resolve(process.cwd(), "data", "ai-learning.db");
console.log("Connecting to DB at:", dbPath);
const db = new Database(dbPath);

try {
  // 1. Ensure table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        template TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log("Table prompt_templates ensured.");

  // 2. Define the prompt content directly (copied from source to avoid import issues)
  const DEFAULT_FIRST_PRINCIPLES_PROMPT = `
    你是一位精通教育学 / 心理学常考点“底层逻辑”的命题专家。请用“第一性原理”的思维方式，剖析这道题目背后的本质。
    
    题目内容: "\${questionContent}"
    解析: "\${explanation}"
    正确答案: "\${correctAnswer}"
    用户错误答案(可选): "\${wrongAnswer}"
    
    请用一段简练的话（200字以内）通过现象看本质，指出这道题到底在考什么核心概念，以及为什么其他选项是错误的干扰项（如果适用）。
    不要重复解析，而是提供一个更高维度的视角，比如“这道题本质上是在考察X与Y的边界...”。
    
    请直接输出分析内容，不需要任何格式包装。
`;

  // 3. Upsert the prompt
  const stmt = db.prepare(`
    INSERT INTO prompt_templates (key, template) 
    VALUES ('first_principles', ?)
    ON CONFLICT(key) DO UPDATE SET 
        template = excluded.template,
        updated_at = CURRENT_TIMESTAMP
    WHERE template != excluded.template
  `);

  const info = stmt.run(DEFAULT_FIRST_PRINCIPLES_PROMPT);
  console.log("Operation result:", info);
  console.log('Prompt "first_principles" initialized successfully.');
} catch (error) {
  console.error("Error initializing prompt:", error);
} finally {
  db.close();
}
