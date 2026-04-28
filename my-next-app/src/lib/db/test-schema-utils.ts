import Database from 'better-sqlite3';

/**
 * 仅供集成测试使用的基础表结构定义。
 * 它反映了数据库的核心字段，用于测试复杂的原生 SQL 逻辑。
 * 注意：必须与 src/lib/db/drizzle-schema.ts 保持关键字段同步。
 */
export const TEST_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'student',
        token_version INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        options TEXT,
        answer TEXT,
        explanation TEXT,
        tags TEXT,
        dimension TEXT,
        type TEXT DEFAULT 'single',
        source TEXT,
        correct_ratio REAL,
        most_wrong_answer TEXT,
        material TEXT,
        material_html TEXT,
        ai_mnemonic TEXT,
        external_id TEXT UNIQUE,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS practice_sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        session_name TEXT,
        total_questions INTEGER DEFAULT 0,
        correct_count INTEGER DEFAULT 0,
        review_count INTEGER DEFAULT 0,
        questions_json TEXT,
        practice_mode TEXT,
        is_demo INTEGER DEFAULT 0,
        analysis_report TEXT,
        total_duration_ms INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS practice_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT REFERENCES practice_sessions(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        question_id INTEGER NOT NULL REFERENCES questions(id),
        user_answer TEXT,
        is_correct INTEGER NOT NULL,
        is_monitored_correct INTEGER DEFAULT 0,
        duration_ms INTEGER,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_mastery (
        user_id INTEGER NOT NULL REFERENCES users(id),
        tag_name TEXT NOT NULL,
        score REAL DEFAULT 0,
        correct_count INTEGER DEFAULT 0,
        total_count INTEGER DEFAULT 0,
        history TEXT,
        last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, tag_name)
    );

    CREATE TABLE IF NOT EXISTS observation_zone (
        user_id INTEGER NOT NULL REFERENCES users(id),
        tag_name TEXT NOT NULL,
        reason TEXT,
        status TEXT DEFAULT 'active',
        entered_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, tag_name)
    );

    CREATE TABLE IF NOT EXISTS question_srs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        question_id INTEGER NOT NULL REFERENCES questions(id),
        stability REAL NOT NULL DEFAULT 0,
        difficulty REAL NOT NULL DEFAULT 0,
        elapsed_days INTEGER NOT NULL DEFAULT 0,
        scheduled_days INTEGER NOT NULL DEFAULT 0,
        reps INTEGER NOT NULL DEFAULT 0,
        lapses INTEGER NOT NULL DEFAULT 0,
        state INTEGER NOT NULL DEFAULT 0,
        last_review TEXT,
        due_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS system_settings (
        user_id INTEGER NOT NULL REFERENCES users(id),
        key TEXT NOT NULL,
        value TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, key)
    );

    CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_string TEXT UNIQUE NOT NULL,
        description TEXT DEFAULT '',
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS session_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES practice_sessions(id),
        question_id INTEGER NOT NULL,
        review_data TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
`;

export function createTestTables(db: Database.Database) {
    db.exec(TEST_SCHEMA_SQL);
}
