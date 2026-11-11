import { type FullConfig } from "@playwright/test";
import path from "path";
import fs from "fs";
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

  // 1.1 清空所有表 —— 动态枚举而不是维护一份硬编码清单。
  // 硬编码清单曾漏掉新增表，导致迁移里的 ALTER TABLE ... ADD COLUMN
  // 撞上残留表而报 "duplicate column name"。
  console.log("[E2E Setup] 正在清理旧测试数据...");
  db.exec("PRAGMA foreign_keys = OFF;");
  const existingTables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all() as Array<{ name: string }>;
  for (const { name } of existingTables) {
    try {
      db.exec(`DROP TABLE IF EXISTS "${name}"`);
    } catch {
      // 虚拟表/视图等删除失败时忽略，后续迁移会处理
    }
  }
  console.log(`[E2E Setup] 已删除 ${existingTables.length} 张旧表`);

  // 用**真实迁移**建表：避免 e2e 再维护一份手写 DDL（此前 port 缺失
  // source_key / questions_json / practice_mode 等列，导致 practice 写入直接失败）。
  const drizzleDir = path.resolve(process.cwd(), "drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta", "_journal.json"), "utf8"),
  ) as { entries: Array<{ tag: string }> };

  // 注意：种子数据阶段保持 foreign_keys=OFF（历史种子行含占位外键），
  // 在 setup 结束时再打开，避免种子阶段直接 FOREIGN KEY constraint failed。
  for (const entry of journal.entries) {
    const file = path.join(drizzleDir, `${entry.tag}.sql`);
    if (!fs.existsSync(file)) continue;
    const sql = fs.readFileSync(file, "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const stmt = statement.trim();
      if (stmt) db.exec(stmt);
    }
  }
  console.log(
    `[E2E Setup] 已按真实迁移建表（${journal.entries.length} 个迁移文件）`,
  );

  // 向量表不在 drizzle 迁移里，单独建
  try {
    db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS content_vec USING vec0(embedding float[1024])`,
    );
  } catch (err) {
    console.warn("[E2E Setup] content_vec 创建失败（RAG 用例可能受限）:", err);
  }

  // 打开智能复盘开关：该功能默认 false，e2e 需要覆盖完整复盘流程
  db.prepare(
    `INSERT OR REPLACE INTO system_settings (user_id, key, value, updated_at)
     VALUES (0, 'ENABLE_INTELLIGENT_REVIEW', 'true', CURRENT_TIMESTAMP)`,
  ).run();

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
    // e2e 需要跑完整复盘/对话流程，配额给足且显式给出 review 上限
    // 键名与 UsageType 对齐（ai_chat / practice / review / rag / ...）；
    // 缺键会让 checkUsageQuota 读到 undefined，直接判"次数已用完"。
    '{"ai_chat":99999,"practice":99999,"review":99999,"rag":99999,"mnemonic":99999,"first_principles":99999}',
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

  // 关闭数据库连接（PRAGMA 是连接级的，关闭后无需还原）
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
