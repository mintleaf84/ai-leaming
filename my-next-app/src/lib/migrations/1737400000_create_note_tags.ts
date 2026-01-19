import type { Database } from 'better-sqlite3';

export const version = 1737400000;

export function up(db: Database) {
    // 创建标签表
    db.exec(`
        CREATE TABLE IF NOT EXISTS note_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            color TEXT DEFAULT '#6b7280',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, name),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    // 创建笔记-标签关联表
    db.exec(`
        CREATE TABLE IF NOT EXISTS note_tag_relations (
            note_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (note_id, tag_id),
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES note_tags(id) ON DELETE CASCADE
        );
    `);

    // 创建索引以优化查询
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_note_tags_user ON note_tags(user_id);
        CREATE INDEX IF NOT EXISTS idx_note_tag_relations_note ON note_tag_relations(note_id);
        CREATE INDEX IF NOT EXISTS idx_note_tag_relations_tag ON note_tag_relations(tag_id);
    `);

    console.log('[Migration] Created note_tags and note_tag_relations tables');
}

export function down(db: Database) {
    db.exec('DROP TABLE IF EXISTS note_tag_relations');
    db.exec('DROP TABLE IF EXISTS note_tags');
    console.log('[Migration] Dropped note_tags and note_tag_relations tables');
}
