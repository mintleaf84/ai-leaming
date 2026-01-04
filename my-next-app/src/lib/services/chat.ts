import db from '@/lib/db';

/**
 * 聊天会话管理服务
 * 负责会话和消息的 CRUD 操作
 */

export interface ChatSession {
  id: number;
  user_id: number;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ChatMessage {
  id: number;
  session_id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  is_favorite: number; // 0 or 1
  created_at: string;
}

export interface SearchResult {
  messageId: number;
  sessionId: number;
  sessionTitle: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  created_at: string;
}

/**
 * 创建新会话
 */
export function createSession(userId: number, title: string = '新对话'): number {
  const result = db.prepare(`
    INSERT INTO chat_sessions (user_id, title, created_at, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(userId, title);

  return result.lastInsertRowid as number;
}

/**
 * 保存单条消息
 */
export function saveMessage(
  userId: number,
  sessionId: number,
  role: 'user' | 'assistant' | 'system',
  content: string
): number {
  // 检查权限
  const session = db.prepare('SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?').get(sessionId, userId);
  if (!session) throw new Error('Unauthorized or session not found');

  // 保存消息
  const result = db.prepare(`
    INSERT INTO chat_messages (session_id, role, content, created_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  `).run(sessionId, role, content);

  // 更新会话的最后活跃时间和消息计数
  db.prepare(`
    UPDATE chat_sessions 
    SET updated_at = CURRENT_TIMESTAMP,
        message_count = message_count + 1
    WHERE id = ? AND user_id = ?
  `).run(sessionId, userId);

  return result.lastInsertRowid as number;
}

/**
 * 获取会话的所有消息
 */
export function getSessionMessages(userId: number, sessionId: number): ChatMessage[] {
  return db.prepare(`
    SELECT m.id, m.session_id, m.role, m.content, m.is_favorite, m.created_at
    FROM chat_messages m
    JOIN chat_sessions s ON m.session_id = s.id
    WHERE m.session_id = ? AND s.user_id = ?
    ORDER BY m.created_at ASC
  `).all(sessionId, userId) as ChatMessage[];
}

/**
 * 获取会话列表（按更新时间倒序）
 */
export function listSessions(userId: number, limit: number = 50): ChatSession[] {
  return db.prepare(`
    SELECT id, title, created_at, updated_at, message_count
    FROM chat_sessions
    WHERE user_id = ?
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(userId, limit) as ChatSession[];
}

/**
 * 获取单个会话详情
 */
export function getSession(userId: number, sessionId: number): ChatSession | null {
  const session = db.prepare(`
    SELECT id, title, created_at, updated_at, message_count
    FROM chat_sessions
    WHERE id = ? AND user_id = ?
  `).get(sessionId, userId) as ChatSession | undefined;

  return session || null;
}

/**
 * 删除会话（级联删除消息）
 */
export function deleteSession(userId: number, sessionId: number): void {
  db.prepare('DELETE FROM chat_sessions WHERE id = ? AND user_id = ?').run(sessionId, userId);
}

/**
 * 更新会话标题
 */
export function updateSessionTitle(userId: number, sessionId: number, title: string): void {
  db.prepare(`
    UPDATE chat_sessions 
    SET title = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(title, sessionId, userId);
}

/**
 * 获取会话的最新 N 条消息（用于生成标题等场景）
 */
export function getRecentMessages(userId: number, sessionId: number, limit: number = 10): ChatMessage[] {
  return db.prepare(`
    SELECT m.id, m.session_id, m.role, m.content, m.is_favorite, m.created_at
    FROM chat_messages m
    JOIN chat_sessions s ON m.session_id = s.id
    WHERE m.session_id = ? AND s.user_id = ?
    ORDER BY m.created_at DESC
    LIMIT ?
  `).all(sessionId, userId, limit) as ChatMessage[];
}

/**
 * 切换消息收藏状态
 */
export function toggleMessageFavorite(userId: number, messageId: number, isFavorite: boolean): void {
  db.prepare(`
    UPDATE chat_messages
    SET is_favorite = ?
    WHERE id = ? AND session_id IN (SELECT id FROM chat_sessions WHERE user_id = ?)
  `).run(isFavorite ? 1 : 0, messageId, userId);
}

/**
 * 获取所有收藏的助手消息
 */
export function getFavoriteMessages(userId: number): ChatMessage[] {
  return db.prepare(`
    SELECT m.id, m.session_id, m.role, m.content, m.is_favorite, m.created_at
    FROM chat_messages m
    JOIN chat_sessions s ON m.session_id = s.id
    WHERE m.is_favorite = 1 AND m.role = 'assistant' AND s.user_id = ?
    ORDER BY m.created_at DESC
  `).all(userId) as ChatMessage[];
}

/**
 * 搜索聊天记录
 */
export function searchMessages(userId: number, query: string): SearchResult[] {
  return db.prepare(`
    SELECT
      m.id as messageId,
      m.session_id as sessionId,
      s.title as sessionTitle,
      m.content,
      m.role,
      m.created_at
    FROM chat_messages m
    JOIN chat_sessions s ON m.session_id = s.id
    WHERE m.content LIKE ? AND s.user_id = ?
    ORDER BY m.created_at DESC
    LIMIT 50
  `).all(`%${query}%`, userId) as SearchResult[];
}
