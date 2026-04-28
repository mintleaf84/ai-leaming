import { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, and, desc, sql, like } from 'drizzle-orm';

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
export async function createSession(userId: number, title: string = '新对话'): Promise<number> {
  const result = await drizzleDb.insert(drizzleSchema.chat_sessions).values({
    user_id: userId,
    title,
  });

  return Number(result.lastInsertRowid);
}

/**
 * 保存单条消息
 */
export async function saveMessage(
  userId: number,
  sessionId: number,
  role: 'user' | 'assistant' | 'system',
  content: string
): Promise<number> {
  // 检查权限
  const session = await drizzleDb.query.chat_sessions.findFirst({
    where: and(
      eq(drizzleSchema.chat_sessions.id, sessionId),
      eq(drizzleSchema.chat_sessions.user_id, userId)
    ),
    columns: { id: true }
  });
  
  if (!session) throw new Error('Unauthorized or session not found');

  // 保存消息
  const result = await drizzleDb.insert(drizzleSchema.chat_messages).values({
    session_id: sessionId,
    role,
    content,
  });

  // 更新会话的最后活跃时间和消息计数
  await drizzleDb.update(drizzleSchema.chat_sessions)
    .set({ 
      updated_at: sql`CURRENT_TIMESTAMP`,
      message_count: sql`${drizzleSchema.chat_sessions.message_count} + 1`
    })
    .where(and(
      eq(drizzleSchema.chat_sessions.id, sessionId),
      eq(drizzleSchema.chat_sessions.user_id, userId)
    ));

  return Number(result.lastInsertRowid);
}

/**
 * 获取会话的所有消息
 */
export async function getSessionMessages(userId: number, sessionId: number): Promise<ChatMessage[]> {
  return await drizzleDb.select({
    id: drizzleSchema.chat_messages.id,
    session_id: drizzleSchema.chat_messages.session_id,
    role: drizzleSchema.chat_messages.role,
    content: drizzleSchema.chat_messages.content,
    is_favorite: drizzleSchema.chat_messages.is_favorite,
    created_at: drizzleSchema.chat_messages.created_at
  })
  .from(drizzleSchema.chat_messages)
  .innerJoin(drizzleSchema.chat_sessions, eq(drizzleSchema.chat_messages.session_id, drizzleSchema.chat_sessions.id))
  .where(and(
    eq(drizzleSchema.chat_messages.session_id, sessionId),
    eq(drizzleSchema.chat_sessions.user_id, userId)
  ))
  .orderBy(drizzleSchema.chat_messages.created_at)
  .all() as ChatMessage[];
}

/**
 * 获取会话列表（按更新时间倒序）
 */
export async function listSessions(userId: number, limit: number = 50): Promise<ChatSession[]> {
  return await drizzleDb.query.chat_sessions.findMany({
    where: eq(drizzleSchema.chat_sessions.user_id, userId),
    orderBy: [desc(drizzleSchema.chat_sessions.updated_at)],
    limit
  }) as ChatSession[];
}

/**
 * 获取单个会话详情
 */
export async function getSession(userId: number, sessionId: number): Promise<ChatSession | null> {
  const session = await drizzleDb.query.chat_sessions.findFirst({
    where: and(
      eq(drizzleSchema.chat_sessions.id, sessionId),
      eq(drizzleSchema.chat_sessions.user_id, userId)
    )
  });

  return session as ChatSession || null;
}

/**
 * 删除会话（级联删除消息）
 */
export async function deleteSession(userId: number, sessionId: number): Promise<void> {
  await drizzleDb.delete(drizzleSchema.chat_sessions)
    .where(and(
      eq(drizzleSchema.chat_sessions.id, sessionId),
      eq(drizzleSchema.chat_sessions.user_id, userId)
    ));
}

/**
 * 更新会话标题
 */
export async function updateSessionTitle(userId: number, sessionId: number, title: string): Promise<void> {
  await drizzleDb.update(drizzleSchema.chat_sessions)
    .set({ 
      title, 
      updated_at: sql`CURRENT_TIMESTAMP` 
    })
    .where(and(
      eq(drizzleSchema.chat_sessions.id, sessionId),
      eq(drizzleSchema.chat_sessions.user_id, userId)
    ));
}

/**
 * 获取会话的最新 N 条消息（用于生成标题等场景）
 */
export async function getRecentMessages(userId: number, sessionId: number, limit: number = 10): Promise<ChatMessage[]> {
  return await drizzleDb.select({
    id: drizzleSchema.chat_messages.id,
    session_id: drizzleSchema.chat_messages.session_id,
    role: drizzleSchema.chat_messages.role,
    content: drizzleSchema.chat_messages.content,
    is_favorite: drizzleSchema.chat_messages.is_favorite,
    created_at: drizzleSchema.chat_messages.created_at
  })
  .from(drizzleSchema.chat_messages)
  .innerJoin(drizzleSchema.chat_sessions, eq(drizzleSchema.chat_messages.session_id, drizzleSchema.chat_sessions.id))
  .where(and(
    eq(drizzleSchema.chat_messages.session_id, sessionId),
    eq(drizzleSchema.chat_sessions.user_id, userId)
  ))
  .orderBy(desc(drizzleSchema.chat_messages.created_at))
  .limit(limit)
  .all() as ChatMessage[];
}

/**
 * 切换消息收藏状态
 */
export async function toggleMessageFavorite(userId: number, messageId: number, isFavorite: boolean): Promise<void> {
  const subquery = drizzleDb.select({ id: drizzleSchema.chat_sessions.id })
    .from(drizzleSchema.chat_sessions)
    .where(eq(drizzleSchema.chat_sessions.user_id, userId));

  await drizzleDb.update(drizzleSchema.chat_messages)
    .set({ is_favorite: isFavorite ? 1 : 0 })
    .where(and(
      eq(drizzleSchema.chat_messages.id, messageId),
      sql`${drizzleSchema.chat_messages.session_id} IN ${subquery}`
    ));
}

/**
 * 获取所有收藏的助手消息
 */
export async function getFavoriteMessages(userId: number): Promise<ChatMessage[]> {
  return await drizzleDb.select({
    id: drizzleSchema.chat_messages.id,
    session_id: drizzleSchema.chat_messages.session_id,
    role: drizzleSchema.chat_messages.role,
    content: drizzleSchema.chat_messages.content,
    is_favorite: drizzleSchema.chat_messages.is_favorite,
    created_at: drizzleSchema.chat_messages.created_at
  })
  .from(drizzleSchema.chat_messages)
  .innerJoin(drizzleSchema.chat_sessions, eq(drizzleSchema.chat_messages.session_id, drizzleSchema.chat_sessions.id))
  .where(and(
    eq(drizzleSchema.chat_messages.is_favorite, 1),
    eq(drizzleSchema.chat_messages.role, 'assistant'),
    eq(drizzleSchema.chat_sessions.user_id, userId)
  ))
  .orderBy(desc(drizzleSchema.chat_messages.created_at))
  .all() as ChatMessage[];
}

/**
 * 搜索聊天记录
 */
export async function searchMessages(userId: number, query: string): Promise<SearchResult[]> {
  const result = await drizzleDb.select({
    messageId: drizzleSchema.chat_messages.id,
    sessionId: drizzleSchema.chat_messages.session_id,
    sessionTitle: drizzleSchema.chat_sessions.title,
    content: drizzleSchema.chat_messages.content,
    role: drizzleSchema.chat_messages.role,
    created_at: drizzleSchema.chat_messages.created_at
  })
  .from(drizzleSchema.chat_messages)
  .innerJoin(drizzleSchema.chat_sessions, eq(drizzleSchema.chat_messages.session_id, drizzleSchema.chat_sessions.id))
  .where(and(
    like(drizzleSchema.chat_messages.content, `%${query}%`),
    eq(drizzleSchema.chat_sessions.user_id, userId)
  ))
  .orderBy(desc(drizzleSchema.chat_messages.created_at))
  .limit(50)
  .all();

  return result as SearchResult[];
}
