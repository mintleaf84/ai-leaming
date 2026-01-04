import Database from 'better-sqlite3';

/**
 * 添加表字段（如果不存在）
 */
export function addColumnIfNotExists(
    db: Database.Database,
    tableName: string,
    columnName: string,
    columnDef: string
) {
    const info = db.prepare(`PRAGMA table_info(${tableName})`).all() as any[];
    if (!info.find(c => c.name === columnName)) {
        console.log(`[DB Migration] Adding ${columnName} to ${tableName}...`);
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
        if (columnName === 'user_id') {
            db.prepare(`UPDATE ${tableName} SET user_id = 1 WHERE user_id IS NULL`).run();
        }
    }
}

/**
 * 获取系统设置
 */
export function getSetting(db: Database.Database, key: string): string | null {
    try {
        const row = db.prepare('SELECT value FROM system_settings WHERE user_id = 1 AND key = ?').get(key) as { value: string } | undefined;
        return row?.value ?? null;
    } catch {
        return null;
    }
}

/**
 * 设置系统设置
 */
export function setSetting(db: Database.Database, key: string, value: string) {
    db.prepare(`
    INSERT INTO system_settings (user_id, key, value, updated_at)
    VALUES (1, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
  `).run(key, value, value);
}
