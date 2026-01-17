import Database from 'better-sqlite3';
import { addColumnIfNotExists } from './utils';

/**
 * 运行所有数据库迁移
 */
export function runMigrations(db: Database.Database) {
    console.log('[DB] Running migrations...');

    // users 表
    addColumnIfNotExists(db, 'users', 'role', "TEXT CHECK(role IN ('admin', 'student')) DEFAULT 'student'");

    // questions 表
    addColumnIfNotExists(db, 'questions', 'external_id', 'TEXT');
    addColumnIfNotExists(db, 'questions', 'source', 'TEXT');
    addColumnIfNotExists(db, 'questions', 'correct_ratio', 'REAL');
    addColumnIfNotExists(db, 'questions', 'most_wrong_answer', 'TEXT');

    try {
        db.exec('CREATE INDEX IF NOT EXISTS idx_questions_external_id ON questions(external_id)');
    } catch { /* ignore */ }

    // practice_sessions 表
    addColumnIfNotExists(db, 'practice_sessions', 'user_id', 'INTEGER NOT NULL DEFAULT 1');
    addColumnIfNotExists(db, 'practice_sessions', 'practice_mode', 'TEXT');
    addColumnIfNotExists(db, 'practice_sessions', 'questions_json', 'TEXT');
    addColumnIfNotExists(db, 'practice_sessions', 'session_name', 'TEXT');  // 会话名称
    addColumnIfNotExists(db, 'practice_sessions', 'analysis_report', 'TEXT'); // AI 深度分析报告

    // practice_logs 表
    addColumnIfNotExists(db, 'practice_logs', 'user_id', 'INTEGER NOT NULL DEFAULT 1');

    // chat_sessions 表
    addColumnIfNotExists(db, 'chat_sessions', 'user_id', 'INTEGER NOT NULL DEFAULT 1');

    // knowledge_cards 表
    addColumnIfNotExists(db, 'knowledge_cards', 'user_id', 'INTEGER NOT NULL DEFAULT 1');

    // ai_configs 表
    try {
        const columns = db.prepare("PRAGMA table_info(ai_configs)").all() as { name: string }[];
        if (!columns.some(col => col.name === 'model_rerank')) {
            db.exec(`ALTER TABLE ai_configs ADD COLUMN model_rerank TEXT`);
        }
        if (!columns.some(col => col.name === 'model_knowledge')) {
            db.exec(`ALTER TABLE ai_configs ADD COLUMN model_knowledge TEXT`);
        }
    } catch { /* ignore */ }

    // chat_messages 表
    try {
        const columns = db.prepare("PRAGMA table_info(chat_messages)").all() as { name: string }[];
        if (!columns.some(col => col.name === 'is_favorite')) {
            db.exec(`ALTER TABLE chat_messages ADD COLUMN is_favorite INTEGER DEFAULT 0`);
        }
    } catch { /* ignore */ }

    // user_mastery 添加计数字段（准确率算法）
    addColumnIfNotExists(db, 'user_mastery', 'correct_count', 'INTEGER DEFAULT 0');
    addColumnIfNotExists(db, 'user_mastery', 'total_count', 'INTEGER DEFAULT 0');

    // user_mastery 多用户迁移
    migrateTableForMultiUser(db, 'user_mastery', 'user_id');

    // observation_zone 多用户迁移
    migrateTableForMultiUser(db, 'observation_zone', 'user_id');

    // system_settings 多用户迁移
    migrateTableForMultiUser(db, 'system_settings', 'user_id');

    // 设置用户1为管理员
    try {
        db.prepare("UPDATE users SET role = 'admin' WHERE id = 1").run();
    } catch { /* ignore */ }

    // 创建索引
    try {
        db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_admin_logs_user ON admin_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON admin_logs(action);
      CREATE INDEX IF NOT EXISTS idx_api_logs_created ON api_call_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_api_logs_model ON api_call_logs(model);
      CREATE INDEX IF NOT EXISTS idx_api_logs_date ON api_call_logs(date(created_at));
      CREATE INDEX IF NOT EXISTS idx_knowledge_cards_category ON knowledge_cards(category);
      CREATE INDEX IF NOT EXISTS idx_knowledge_cards_created ON knowledge_cards(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_knowledge_cards_user ON knowledge_cards(user_id);
      CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date ON daily_usage(user_id, usage_date);
      CREATE INDEX IF NOT EXISTS idx_payment_records_user ON payment_records(user_id);
      CREATE INDEX IF NOT EXISTS idx_payment_records_order ON payment_records(order_no);
    `);
    } catch { /* ignore */ }

    console.log('[DB] Migrations completed');
}

function migrateTableForMultiUser(db: Database.Database, tableName: string, columnName: string) {
    try {
        const info = db.prepare(`PRAGMA table_info(${tableName})`).all() as any[];
        if (info.length && !info.some(c => c.name === columnName)) {
            console.log(`[DB Migration] Table ${tableName} needs multi-user migration (skipped - requires manual intervention)`);
        }
    } catch { /* ignore */ }
}
