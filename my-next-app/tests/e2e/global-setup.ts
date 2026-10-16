import { type FullConfig } from "@playwright/test";
import path from "path";
import _fs from "fs";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";

/**
 * E2E 测试全局设置
 * 职责：初始化测试数据库并插入种子数据
 */

// 测试用户凭证（供测试文件使用）
export const TEST_USER = {
  username: "testuser",
  password: "test123456",
  role: "student",
};

export const TEST_ADMIN = {
  username: "testadmin",
  password: "admin123456",
  role: "admin",
};

async function globalSetup(_config: FullConfig) {
  console.log("[E2E Setup] 开始初始化测试环境...");

  const dbPath = path.resolve(process.cwd(), "data", "test-e2e.db");

  // 1. 尝试初始化数据库连接
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  // 1.0 加载向量扩展 (以支持虚拟表)
  try {
    const platform = process.platform;
    const arch = process.arch;
    let binaryName = "vec0.so";
    let packageName = "sqlite-vec-linux-x64";
    if (platform === "win32") {
      binaryName = "vec0.dll";
      packageName =
        arch === "x64" ? "sqlite-vec-windows-x64" : `sqlite-vec-win32-${arch}`;
    } else if (platform === "darwin") {
      binaryName = "vec0.dylib";
      packageName = `sqlite-vec-darwin-${arch}`;
    }
    const loadablePath = path.resolve(
      process.cwd(),
      "node_modules",
      packageName,
      binaryName,
    );
    console.log(`[E2E Setup] 正在加载向量扩展: ${loadablePath}`);
    db.loadExtension(loadablePath);
    console.log("[E2E Setup] ✅ sqlite-vec 扩展加载成功");
  } catch (err) {
    console.warn("[E2E Setup] ⚠️ 向量扩展加载失败，RAG 测试可能受限:", err);
  }

  // 1.1 清理旧数据（代替 fs.unlinkSync，以兼容 Windows 锁定情况）
  console.log("[E2E Setup] 正在清理旧测试数据...");
  const tables = [
    "users",
    "notes",
    "note_tags",
    "note_tag_relations",
    "questions",
    "practice_sessions",
    "practice_logs",
    "ai_configs",
    "ai_model_routes",
    "chat_sessions",
    "chat_messages",
    "user_mastery",
    "subscription_plans",
    "user_subscriptions",
    "prompt_templates",
    "system_settings",
    "daily_usage",
    "knowledge_cards",
    "content_chunks",
    "content_vec",
  ];

  db.transaction(() => {
    for (const table of tables) {
      try {
        db.prepare(`DROP TABLE IF EXISTS ${table}`).run();
      } catch (_e) {
        // 忽略错误
      }
    }
  })();
  console.log("[E2E Setup] 旧表已删除");

  // 创建表结构（简化版本，包含关键表）
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin', 'student')) DEFAULT 'student',
      token_version INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      options TEXT,
      answer TEXT,
      explanation TEXT,
      tags TEXT,
      dimension TEXT CHECK(dimension IN ('knowledge', 'understanding', 'application')),
      type TEXT,
      ai_mnemonic TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_mastery (
      user_id INTEGER NOT NULL DEFAULT 1,
      tag_name TEXT NOT NULL,
      score REAL DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      total_count INTEGER DEFAULT 0,
      history TEXT,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, tag_name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS practice_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL DEFAULT 1,
      session_name TEXT,
      total_questions INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      review_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS practice_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      user_id INTEGER NOT NULL DEFAULT 1,
      question_id INTEGER NOT NULL,
      user_answer TEXT,
      is_correct BOOLEAN NOT NULL,
      is_monitored_correct BOOLEAN DEFAULT 0,
      duration_ms INTEGER,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(question_id) REFERENCES questions(id),
      FOREIGN KEY(session_id) REFERENCES practice_sessions(id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS session_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      question_id INTEGER NOT NULL,
      review_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(session_id) REFERENCES practice_sessions(id)
    );

    CREATE TABLE IF NOT EXISTS observation_zone (
      user_id INTEGER NOT NULL DEFAULT 1,
      tag_name TEXT NOT NULL,
      reason TEXT,
      entered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT CHECK(status IN ('active', 'recovering', 'graduated')) DEFAULT 'active',
      PRIMARY KEY (user_id, tag_name),
      FOREIGN KEY(user_id, tag_name) REFERENCES user_mastery(user_id, tag_name) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      user_id INTEGER NOT NULL DEFAULT 1,
      key TEXT NOT NULL,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      api_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      model_economy TEXT,
      model_premium TEXT,
      model_embedding TEXT,
      embedding_dimensions INTEGER,
      model_rerank TEXT,
      model_knowledge TEXT,
      is_active BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS prompt_templates (
      key TEXT PRIMARY KEY,
      template TEXT NOT NULL,
      description TEXT,
      variables TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ai_model_routes (
      feature TEXT PRIMARY KEY,
      config_id INTEGER,
      model_name TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (config_id) REFERENCES ai_configs(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 1,
      title TEXT NOT NULL DEFAULT '新对话',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      message_count INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      is_favorite INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS knowledge_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 1,
      session_id INTEGER,
      title TEXT NOT NULL,
      category TEXT,
      tags TEXT,
      front TEXT,
      back TEXT,
      key_points TEXT,
      source_content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS api_call_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      config_id INTEGER,
      model TEXT NOT NULL,
      endpoint TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      duration_ms INTEGER,
      success INTEGER DEFAULT 1,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subscription_plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tier TEXT NOT NULL,
      price_monthly INTEGER DEFAULT 0,
      limits TEXT NOT NULL,
      features TEXT,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      plan_id TEXT NOT NULL DEFAULT 'free',
      status TEXT CHECK(status IN ('active', 'expired', 'cancelled')) DEFAULT 'active',
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
    );

    CREATE TABLE IF NOT EXISTS daily_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      usage_date DATE NOT NULL,
      usage_type TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      UNIQUE(user_id, usage_date, usage_type),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payment_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      order_no TEXT UNIQUE NOT NULL,
      payment_no TEXT,
      plan_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      payment_method TEXT,
      status TEXT CHECK(status IN ('pending', 'paid', 'failed', 'refunded')) DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      paid_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mastered_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      mastered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      note TEXT,
      UNIQUE(user_id, question_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_string TEXT UNIQUE NOT NULL,
      description TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS content_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      metadata TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS content_vec USING vec0(
      embedding float[1024]
    );
  `);

  // 3. 插入种子数据
  console.log("[E2E Setup] 插入种子数据...");

  // 3.1 创建测试用户（使用 INSERT OR REPLACE 确保幂等）
  const userPasswordHash = bcrypt.hashSync(TEST_USER.password, 10);
  const adminPasswordHash = bcrypt.hashSync(TEST_ADMIN.password, 10);

  db.prepare(
    `
    INSERT OR REPLACE INTO users (id, username, password_hash, role, token_version) VALUES (?, ?, ?, ?, ?)
  `,
  ).run(1, TEST_USER.username, userPasswordHash, TEST_USER.role, 0);

  db.prepare(
    `
    INSERT OR REPLACE INTO users (id, username, password_hash, role, token_version) VALUES (?, ?, ?, ?, ?)
  `,
  ).run(2, TEST_ADMIN.username, adminPasswordHash, TEST_ADMIN.role, 0);

  console.log("[E2E Setup] 已创建测试用户: testuser, testadmin");

  // 3.2 创建测试题目（10道）
  const testQuestions = [
    {
      content: "测试题1：下列哪项是正确的？",
      options: '["A. 选项一", "B. 选项二", "C. 选项三", "D. 选项四"]',
      answer: "A",
      tags: '["测试知识点"]',
      dimension: "knowledge",
      type: "single",
    },
    {
      content: "测试题2：请选择正确答案。",
      options: '["A. 正确", "B. 错误", "C. 不确定", "D. 以上都不对"]',
      answer: "A",
      tags: '["教育学"]',
      dimension: "understanding",
      type: "single",
    },
    {
      content: "测试题3：关于测试的说法，正确的是？",
      options:
        '["A. 测试很重要", "B. 测试不重要", "C. 测试可有可无", "D. 不知道"]',
      answer: "A",
      tags: '["心理学"]',
      dimension: "application",
      type: "single",
    },
    {
      content: "测试题4：E2E测试的作用是什么？",
      options:
        '["A. 验证用户流程", "B. 提高性能", "C. 减少代码", "D. 美化界面"]',
      answer: "A",
      tags: '["软件测试"]',
      dimension: "knowledge",
      type: "single",
    },
    {
      content: "测试题5：Mock数据的作用是？",
      options:
        '["A. 替代真实API", "B. 提高网速", "C. 压缩文件", "D. 加密数据"]',
      answer: "A",
      tags: '["测试知识点"]',
      dimension: "understanding",
      type: "single",
    },
    {
      content: "测试题6：Playwright是什么？",
      options: '["A. 数据库", "B. E2E测试框架", "C. 编程语言", "D. 操作系统"]',
      answer: "B",
      tags: '["软件测试"]',
      dimension: "knowledge",
      type: "single",
    },
    {
      content: "测试题7：什么是单元测试？",
      options:
        '["A. 测试单个函数", "B. 测试整个系统", "C. 测试用户界面", "D. 测试网络"]',
      answer: "A",
      tags: '["软件测试"]',
      dimension: "understanding",
      type: "single",
    },
    {
      content: "测试题8：CI/CD代表什么？",
      options:
        '["A. 持续集成/持续部署", "B. 代码检查", "C. 版本控制", "D. 数据库管理"]',
      answer: "A",
      tags: '["DevOps"]',
      dimension: "knowledge",
      type: "single",
    },
    {
      content: "测试题9：Git是什么工具？",
      options: '["A. 版本控制", "B. 文本编辑器", "C. 浏览器", "D. 数据库"]',
      answer: "A",
      tags: '["版本控制"]',
      dimension: "knowledge",
      type: "single",
    },
    {
      content: "测试题10：API是什么的缩写？",
      options:
        '["A. Application Programming Interface", "B. Apple Product Inc", "C. Advanced Protocol Integration", "D. 以上都不对"]',
      answer: "A",
      tags: '["编程基础"]',
      dimension: "knowledge",
      type: "single",
    },
  ];

  const insertQuestion = db.prepare(`
    INSERT OR IGNORE INTO questions (content, options, answer, explanation, tags, dimension, type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  testQuestions.forEach((q, i) => {
    insertQuestion.run(
      q.content,
      q.options,
      q.answer,
      `这是测试题${i + 1}的解析。`,
      q.tags,
      q.dimension,
      q.type,
    );
  });

  console.log("[E2E Setup] 已创建 10 道测试题目");

  // 3.3 创建 AI 配置（Mock 配置）
  db.prepare(
    `
    INSERT OR IGNORE INTO ai_configs (name, api_url, api_key, model_economy, model_premium, model_embedding, model_rerank, model_knowledge, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    "测试AI配置",
    "https://mock-api.test.com/v1",
    "sk-test-mock-key",
    "gpt-3.5-turbo",
    "gpt-4",
    "text-embedding-3-small",
    "bge-reranker-v2-m3",
    "gpt-4o",
    1,
  );

  console.log("[E2E Setup] 已创建 AI 配置");

  // 3.3.1 创建 AI 模型路由
  db.prepare(
    `
    INSERT OR REPLACE INTO ai_model_routes (feature, config_id, model_name)
    VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)
  `,
  ).run(
    "ai_chat",
    1,
    "gpt-3.5-turbo",
    "embedding",
    1,
    "text-embedding-3-small",
    "rerank",
    1,
    "bge-reranker-v2-m3",
  );
  console.log("[E2E Setup] 已创建 AI 模型路由");

  // 3.4 创建订阅计划
  db.prepare(
    `
    INSERT OR REPLACE INTO subscription_plans (id, name, tier, price_monthly, limits, features, is_active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    "free",
    "免费版",
    "free",
    0,
    '{"daily_chat":10,"daily_practice":20}',
    '["基础练习","AI问答"]',
    1,
    0,
  );

  console.log("[E2E Setup] 已创建订阅计划");

  // 3.5 为测试用户创建订阅
  db.prepare(
    `
    INSERT OR IGNORE INTO user_subscriptions (user_id, plan_id, status)
    VALUES (?, ?, ?)
  `,
  ).run(1, "free", "active");

  db.prepare(
    `
    INSERT OR IGNORE INTO user_subscriptions (user_id, plan_id, status)
    VALUES (?, ?, ?)
  `,
  ).run(2, "free", "active");

  console.log("[E2E Setup] 已为用户创建订阅");

  // 3.6 初始化系统设置
  db.prepare(
    `
    INSERT OR IGNORE INTO system_settings (user_id, key, value)
    VALUES (1, ?, ?)
  `,
  ).run("demo_mode_enabled", "false");

  console.log("[E2E Setup] 已初始化演示模式开关");

  // 关闭数据库连接
  db.close();

  console.log("[E2E Setup] ✅ 测试环境初始化完成！");
  console.log(
    `[E2E Setup] 测试用户: ${TEST_USER.username} / ${TEST_USER.password}`,
  );
  console.log(
    `[E2E Setup] 管理员: ${TEST_ADMIN.username} / ${TEST_ADMIN.password}`,
  );
}

export default globalSetup;
