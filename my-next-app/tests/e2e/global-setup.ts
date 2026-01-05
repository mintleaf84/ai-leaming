import { type FullConfig } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

/**
 * E2E 测试全局设置
 * 职责：初始化测试数据库并插入种子数据
 */

// 测试用户凭证（供测试文件使用）
export const TEST_USER = {
  username: 'testuser',
  password: 'test123456',
  role: 'student'
};

export const TEST_ADMIN = {
  username: 'testadmin',
  password: 'admin123456',
  role: 'admin'
};

async function globalSetup(config: FullConfig) {
  console.log('[E2E Setup] 开始初始化测试环境...');

  const dbPath = path.resolve(process.cwd(), 'data', 'test-e2e.db');

  // 1. 清理旧数据库
  try {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      console.log('[E2E Setup] 已删除旧测试数据库');
    }
    ['-wal', '-shm'].forEach(suffix => {
      const file = dbPath + suffix;
      if (fs.existsSync(file)) fs.unlinkSync(file);
    });
  } catch (error) {
    console.warn('[E2E Setup] 清理旧数据库失败（可能正在使用）');
  }

  // 2. 创建新数据库并初始化表结构
  console.log('[E2E Setup] 创建数据库并初始化表结构...');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // 创建表结构（简化版本，包含关键表）
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin', 'student')) DEFAULT 'student',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS practice_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL DEFAULT 1,
      session_name TEXT,
      total_questions INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      review_count INTEGER DEFAULT 0,
      questions_json TEXT,
      practice_mode TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS practice_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      user_id INTEGER NOT NULL DEFAULT 1,
      question_id INTEGER NOT NULL,
      user_answer TEXT,
      is_correct BOOLEAN NOT NULL,
      duration_ms INTEGER,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ai_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      api_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      model_economy TEXT,
      model_premium TEXT,
      is_active BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 1,
      title TEXT NOT NULL DEFAULT '新对话',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      message_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      is_favorite INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_mastery (
      user_id INTEGER NOT NULL DEFAULT 1,
      tag_name TEXT NOT NULL,
      score REAL DEFAULT 0,
      history TEXT,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, tag_name)
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS prompt_templates (
      key TEXT PRIMARY KEY,
      template TEXT NOT NULL,
      description TEXT,
      variables TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      usage_date DATE NOT NULL,
      usage_type TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      UNIQUE(user_id, usage_date, usage_type)
    );
  `);

  // 3. 插入种子数据
  console.log('[E2E Setup] 插入种子数据...');

  // 3.1 创建测试用户
  const userPasswordHash = bcrypt.hashSync(TEST_USER.password, 10);
  const adminPasswordHash = bcrypt.hashSync(TEST_ADMIN.password, 10);

  db.prepare(`
    INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)
  `).run(TEST_USER.username, userPasswordHash, TEST_USER.role);

  db.prepare(`
    INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)
  `).run(TEST_ADMIN.username, adminPasswordHash, TEST_ADMIN.role);

  console.log('[E2E Setup] 已创建测试用户: testuser, testadmin');

  // 3.2 创建测试题目（10道）
  const testQuestions = [
    { content: '测试题1：下列哪项是正确的？', options: '["A. 选项一", "B. 选项二", "C. 选项三", "D. 选项四"]', answer: 'A', tags: '["测试知识点"]', dimension: 'knowledge', type: 'single' },
    { content: '测试题2：请选择正确答案。', options: '["A. 正确", "B. 错误", "C. 不确定", "D. 以上都不对"]', answer: 'A', tags: '["教育学"]', dimension: 'understanding', type: 'single' },
    { content: '测试题3：关于测试的说法，正确的是？', options: '["A. 测试很重要", "B. 测试不重要", "C. 测试可有可无", "D. 不知道"]', answer: 'A', tags: '["心理学"]', dimension: 'application', type: 'single' },
    { content: '测试题4：E2E测试的作用是什么？', options: '["A. 验证用户流程", "B. 提高性能", "C. 减少代码", "D. 美化界面"]', answer: 'A', tags: '["软件测试"]', dimension: 'knowledge', type: 'single' },
    { content: '测试题5：Mock数据的作用是？', options: '["A. 替代真实API", "B. 提高网速", "C. 压缩文件", "D. 加密数据"]', answer: 'A', tags: '["测试知识点"]', dimension: 'understanding', type: 'single' },
    { content: '测试题6：Playwright是什么？', options: '["A. 数据库", "B. E2E测试框架", "C. 编程语言", "D. 操作系统"]', answer: 'B', tags: '["软件测试"]', dimension: 'knowledge', type: 'single' },
    { content: '测试题7：什么是单元测试？', options: '["A. 测试单个函数", "B. 测试整个系统", "C. 测试用户界面", "D. 测试网络"]', answer: 'A', tags: '["软件测试"]', dimension: 'understanding', type: 'single' },
    { content: '测试题8：CI/CD代表什么？', options: '["A. 持续集成/持续部署", "B. 代码检查", "C. 版本控制", "D. 数据库管理"]', answer: 'A', tags: '["DevOps"]', dimension: 'knowledge', type: 'single' },
    { content: '测试题9：Git是什么工具？', options: '["A. 版本控制", "B. 文本编辑器", "C. 浏览器", "D. 数据库"]', answer: 'A', tags: '["版本控制"]', dimension: 'knowledge', type: 'single' },
    { content: '测试题10：API是什么的缩写？', options: '["A. Application Programming Interface", "B. Apple Product Inc", "C. Advanced Protocol Integration", "D. 以上都不对"]', answer: 'A', tags: '["编程基础"]', dimension: 'knowledge', type: 'single' },
  ];

  const insertQuestion = db.prepare(`
    INSERT INTO questions (content, options, answer, explanation, tags, dimension, type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  testQuestions.forEach((q, i) => {
    insertQuestion.run(q.content, q.options, q.answer, `这是测试题${i + 1}的解析。`, q.tags, q.dimension, q.type);
  });

  console.log('[E2E Setup] 已创建 10 道测试题目');

  // 3.3 创建 AI 配置（Mock 配置）
  db.prepare(`
    INSERT INTO ai_configs (name, api_url, api_key, model_economy, model_premium, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('测试AI配置', 'https://mock-api.test.com/v1', 'sk-test-mock-key', 'gpt-3.5-turbo', 'gpt-4', 1);

  console.log('[E2E Setup] 已创建 AI 配置');

  // 3.4 创建订阅计划
  db.prepare(`
    INSERT OR REPLACE INTO subscription_plans (id, name, tier, price_monthly, limits, features, is_active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('free', '免费版', 'free', 0, '{"daily_chat":10,"daily_practice":20}', '["基础练习","AI问答"]', 1, 0);

  console.log('[E2E Setup] 已创建订阅计划');

  // 3.5 为测试用户创建订阅
  db.prepare(`
    INSERT INTO user_subscriptions (user_id, plan_id, status)
    VALUES (?, ?, ?)
  `).run(1, 'free', 'active');

  db.prepare(`
    INSERT INTO user_subscriptions (user_id, plan_id, status)
    VALUES (?, ?, ?)
  `).run(2, 'free', 'active');

  console.log('[E2E Setup] 已为用户创建订阅');

  // 关闭数据库连接
  db.close();

  console.log('[E2E Setup] ✅ 测试环境初始化完成！');
  console.log(`[E2E Setup] 测试用户: ${TEST_USER.username} / ${TEST_USER.password}`);
  console.log(`[E2E Setup] 管理员: ${TEST_ADMIN.username} / ${TEST_ADMIN.password}`);
}

export default globalSetup;
