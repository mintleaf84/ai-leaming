import { drizzleDb } from './index';
import { addColumnIfNotExists } from './utils-drizzle';
import { sql } from 'drizzle-orm';

/**
 * 运行所有数据库迁移 (Drizzle 版本)
 */
export async function runMigrations() {
    console.log('[DB] Running legacy migrations via Drizzle...');

    // users 表
    await addColumnIfNotExists('users', 'role', "TEXT CHECK(role IN ('admin', 'student')) DEFAULT 'student'");
    await addColumnIfNotExists('users', 'token_version', 'INTEGER DEFAULT 0');

    // questions 表
    await addColumnIfNotExists('questions', 'external_id', 'TEXT');
    await addColumnIfNotExists('questions', 'source', 'TEXT');
    await addColumnIfNotExists('questions', 'correct_ratio', 'REAL');
    await addColumnIfNotExists('questions', 'most_wrong_answer', 'TEXT');
    await addColumnIfNotExists('questions', 'material', 'TEXT');        // 材料内容（纯文本）
    await addColumnIfNotExists('questions', 'material_html', 'TEXT');   // 材料内容（HTML）

    try {
        // 修复：必须是 UNIQUE INDEX，否则 Drizzle 的 onConflictDoUpdate 会报错
        await drizzleDb.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS questions_external_id_unique ON questions(external_id)`);
    } catch { /* ignore */ }

    // practice_sessions 表
    await addColumnIfNotExists('practice_sessions', 'user_id', 'INTEGER NOT NULL DEFAULT 1');
    await addColumnIfNotExists('practice_sessions', 'practice_mode', 'TEXT');
    await addColumnIfNotExists('practice_sessions', 'questions_json', 'TEXT');
    await addColumnIfNotExists('practice_sessions', 'session_name', 'TEXT');  // 会话名称
    await addColumnIfNotExists('practice_sessions', 'analysis_report', 'TEXT'); // AI 深度分析报告

    // practice_logs 表
    await addColumnIfNotExists('practice_logs', 'user_id', 'INTEGER NOT NULL DEFAULT 1');

    // chat_sessions 表
    await addColumnIfNotExists('chat_sessions', 'user_id', 'INTEGER NOT NULL DEFAULT 1');

    // knowledge_cards 表
    await addColumnIfNotExists('knowledge_cards', 'user_id', 'INTEGER NOT NULL DEFAULT 1');

    // ai_configs 表
    try {
        await addColumnIfNotExists('ai_configs', 'model_rerank', 'TEXT');
        await addColumnIfNotExists('ai_configs', 'model_knowledge', 'TEXT');
    } catch { /* ignore */ }

    // chat_messages 表
    try {
        await addColumnIfNotExists('chat_messages', 'is_favorite', 'INTEGER DEFAULT 0');
    } catch { /* ignore */ }

    // user_mastery 添加计数字段（准确率算法）
    await addColumnIfNotExists('user_mastery', 'correct_count', 'INTEGER DEFAULT 0');
    await addColumnIfNotExists('user_mastery', 'total_count', 'INTEGER DEFAULT 0');

    // user_mastery 多用户迁移
    await migrateTableForMultiUser('user_mastery', 'user_id');

    // observation_zone 多用户迁移
    await migrateTableForMultiUser('observation_zone', 'user_id');

    // system_settings 多用户迁移
    await migrateTableForMultiUser('system_settings', 'user_id');

    // 设置用户1为管理员
    try {
        await drizzleDb.run(sql`UPDATE users SET role = 'admin' WHERE id = 1`);
    } catch { /* ignore */ }

    // 创建索引
    try {
        await drizzleDb.run(sql`CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at)`);
        await drizzleDb.run(sql`CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC)`);
        await drizzleDb.run(sql`CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id)`);
        await drizzleDb.run(sql`CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at DESC)`);
        await drizzleDb.run(sql`CREATE INDEX IF NOT EXISTS idx_admin_logs_user ON admin_logs(user_id)`);
        await drizzleDb.run(sql`CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON admin_logs(action)`);
        await drizzleDb.run(sql`CREATE INDEX IF NOT EXISTS idx_api_logs_created ON api_call_logs(created_at DESC)`);
        await drizzleDb.run(sql`CREATE INDEX IF NOT EXISTS idx_api_logs_user_created ON api_call_logs(user_id, created_at DESC)`);
        await drizzleDb.run(sql`CREATE INDEX IF NOT EXISTS idx_api_logs_model ON api_call_logs(model)`);
        await drizzleDb.run(sql`CREATE INDEX IF NOT EXISTS idx_api_logs_date ON api_call_logs(date(created_at))`);
        await drizzleDb.run(sql`CREATE INDEX IF NOT EXISTS idx_practice_logs_user_ts ON practice_logs(user_id, timestamp DESC)`);
        await drizzleDb.run(sql`CREATE INDEX IF NOT EXISTS idx_practice_logs_correct ON practice_logs(is_correct)`);
        await drizzleDb.run(sql`CREATE INDEX IF NOT EXISTS idx_practice_logs_question ON practice_logs(question_id)`);
        await drizzleDb.run(sql`CREATE INDEX IF NOT EXISTS idx_practice_logs_user_correct ON practice_logs(user_id, is_correct)`);
        await drizzleDb.run(sql`CREATE INDEX IF NOT EXISTS idx_practice_sessions_user_ts ON practice_sessions(user_id, created_at DESC)`);
        await drizzleDb.run(sql`CREATE INDEX IF NOT EXISTS idx_mastered_questions_user ON mastered_questions(user_id)`);
        await drizzleDb.run(sql`CREATE INDEX IF NOT EXISTS idx_mastered_questions_user_q ON mastered_questions(user_id, question_id)`);
        await drizzleDb.run(sql`CREATE INDEX IF NOT EXISTS idx_knowledge_cards_category ON knowledge_cards(category)`);
        await drizzleDb.run(sql`CREATE INDEX IF NOT EXISTS idx_knowledge_cards_created ON knowledge_cards(created_at DESC)`);
        await drizzleDb.run(sql`CREATE INDEX IF NOT EXISTS idx_knowledge_cards_user ON knowledge_cards(user_id)`);
        await drizzleDb.run(sql`CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date ON daily_usage(user_id, usage_date)`);
        await drizzleDb.run(sql`CREATE INDEX IF NOT EXISTS idx_payment_records_user ON payment_records(user_id)`);
        await drizzleDb.run(sql`CREATE INDEX IF NOT EXISTS idx_payment_records_order ON payment_records(order_no)`);
    } catch { /* ignore */ }

    console.log('[DB] Migrations completed');
}

async function migrateTableForMultiUser(tableName: string, columnName: string) {
    try {
        const columns = await drizzleDb.all<any>(sql`PRAGMA table_info(${sql.raw(tableName)})`);
        const exists = columns.some((c: any) => c.name === columnName);
        if (columns.length && !exists) {
            console.log(`[DB Migration] Table ${tableName} needs multi-user migration (skipped - requires manual intervention)`);
        }
    } catch { /* ignore */ }
}
