import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';

// 1. Mock DB 模块
// 注意：vi.mock 会被提升，所以不能引用外部变量。
// 我们在工厂函数内部创建实例，或者让它返回一个新的。
// 为了在测试中访问同一个实例，我们可以在导入时作为一个单例获取。
vi.mock('@/li@/lib/db', () => {
    return { default: new Database(':memory:') };
});

// 2. 导入 Mock 后的模块
import db from '@/li@/lib/db';
import {
    createSession,
    saveMessage,
    getSessionMessages,
    listSessions,
    deleteSession,
    updateSessionTitle
} from '@/lib/services/chat';

describe('ChatService', () => {
    // 3. 初始化数据库表结构
    beforeEach(() => {
        // 清空旧数据（如果是复用实例）或重新建表
        // 由于我们使用的是同一个 :memory: 实例（模块缓存），我们需要重置表
        db.exec(`
      DROP TABLE IF EXISTS chat_messages;
      DROP TABLE IF EXISTS chat_sessions;
      
      CREATE TABLE chat_sessions(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '新对话',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    message_count INTEGER DEFAULT 0
);

      CREATE TABLE chat_messages(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);
`);
    });

    describe('createSession', () => {
        it('should create a new session with default title', () => {
            const id = createSession();
            expect(id).toBeGreaterThan(0);

            const session = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(id) as any;
            expect(session).toBeDefined();
            expect(session.title).toBe('新对话');
            expect(session.message_count).toBe(0);
        });

        it('should create a session with custom title', () => {
            const id = createSession('Test Title');
            const session = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(id) as any;
            expect(session.title).toBe('Test Title');
        });
    });

    describe('saveMessage', () => {
        it('should save a message and update session stats', () => {
            const sessionId = createSession();
            const msgId = saveMessage(sessionId, 'user', 'Hello');

            expect(msgId).toBeGreaterThan(0);

            // Verify message
            const msg = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(msgId) as any;
            expect(msg.content).toBe('Hello');
            expect(msg.role).toBe('user');
            expect(msg.session_id).toBe(sessionId);

            // Verify session update
            const session = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(sessionId) as any;
            expect(session.message_count).toBe(1);
        });
    });

    describe('getSessionMessages', () => {
        it('should get all messages for a session ordered by time', () => {
            const sessionId = createSession();
            saveMessage(sessionId, 'user', '1');
            saveMessage(sessionId, 'assistant', '2');

            const msgs = getSessionMessages(sessionId);
            expect(msgs).toHaveLength(2);
            expect(msgs[0].content).toBe('1');
            expect(msgs[1].content).toBe('2');
        });
    });

    describe('deleteSession', () => {
        it('should delete session and cascading messages', () => {
            const sessionId = createSession();
            saveMessage(sessionId, 'user', 'msg');

            deleteSession(sessionId);

            const session = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(sessionId);
            expect(session).toBeUndefined();

            const msgs = db.prepare('SELECT * FROM chat_messages WHERE session_id = ?').all(sessionId);
            expect(msgs).toHaveLength(0);
        });
    });
});
