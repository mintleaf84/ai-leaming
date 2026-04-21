'use server';
import logger from '@/lib/logger';

import db from '@/lib/db';
import { Question, UserRole } from '@/types';
import { z } from 'zod';
import { getErrorMessage } from '@/lib/utils/error';
import { QuestionSchema } from '@/lib/schemas';
import { requireRole } from '@/lib/auth/auth';
import { hashPassword } from '@/lib/auth/password';
import { logAdminAction } from '@/lib/admin/audit';

// Schema for bulk import
const ImportSchema = z.array(QuestionSchema);

// 题目查询筛选参数
export interface QuestionFilters {
  search?: string;      // 关键词搜索
  tag?: string;         // 标签筛选
  dimension?: string;   // 维度筛选
}

export async function getQuestionsAction(
  limit: number = 50,
  offset: number = 0,
  filters?: QuestionFilters
) {
  await requireRole(['admin']);
  try {
    // 构建 WHERE 子句
    const conditions: string[] = [];
    const params: (string | number | null)[] = [];

    if (filters?.search) {
      conditions.push('content LIKE ?');
      params.push(`%${filters.search}%`);
    }
    if (filters?.tag) {
      conditions.push('tags LIKE ?');
      params.push(`%${filters.tag}%`);
    }
    if (filters?.dimension) {
      conditions.push('dimension = ?');
      params.push(filters.dimension);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 查询总数
    const countSql = `SELECT COUNT(*) as count FROM questions ${whereClause}`;
    const total = db.prepare(countSql).get(...params) as { count: number };

    // 查询数据
    const dataSql = `SELECT * FROM questions ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`;
    const questions = db.prepare(dataSql).all(...params, limit, offset) as Question[];

    // Parse options back to array if stored as string (SQLite limitation)
    const parsedQuestions = questions.map(q => ({
      ...q,
      options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
      tags: typeof q.tags === 'string' ? JSON.parse(q.tags) : q.tags
    }));

    return { questions: parsedQuestions, total: total.count };
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch questions');
    throw new Error('Failed to fetch questions');
  }
}

export async function importQuestionsAction(jsonData: unknown) {
  const user = await requireRole(['admin']);
  try {
    // Validate
    const parsedData = ImportSchema.parse(jsonData);

    const insert = db.prepare(`
      INSERT INTO questions (content, options, answer, explanation, tags, dimension, type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const insertMany = db.transaction((questions: z.infer<typeof QuestionSchema>[]) => {
      for (const q of questions) {
        insert.run(
          q.content,
          JSON.stringify(q.options),
          q.answer,
          q.explanation,
          JSON.stringify(q.tags),
          q.dimension,
          q.type || 'single'
        );
      }
    });

    insertMany(parsedData);

    // 记录操作日志
    logAdminAction(user.id, user.username, 'CREATE_QUESTION', 'question', null, { count: parsedData.length });

    return { success: true, count: parsedData.length };
  } catch (error) {
    logger.error({ err: error }, 'Import failed');
    return { success: false, error: getErrorMessage(error, 'Unknown error') };
  }
}

export async function deleteQuestionAction(id: number) {
  const user = await requireRole(['admin']);
  try {
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);

    // 记录操作日志
    logAdminAction(user.id, user.username, 'DELETE_QUESTION', 'question', id.toString());

    return { success: true };
  } catch (_error) {
    return { success: false, error: 'Delete failed' };
  }
}

// 题目更新参数
export interface QuestionUpdateData {
  content?: string;
  options?: string[];
  answer?: string;
  explanation?: string;
  tags?: string[];
  dimension?: string;
  type?: string;
}

export async function updateQuestionAction(id: number, data: QuestionUpdateData) {
  const user = await requireRole(['admin']);
  try {
    // 1. 获取现有题目进行合并校验
    const existing = db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as Question | undefined;
    if (!existing) {
      return { success: false, error: '题目不存在' };
    }

    // 解析 DB 中的 JSON 字符串字段
    const currentQ = {
      ...existing,
      options: typeof existing.options === 'string' ? JSON.parse(existing.options) : existing.options,
      tags: typeof existing.tags === 'string' ? JSON.parse(existing.tags) : existing.tags
    };

    // 合并数据
    const merged = {
      content: data.content ?? currentQ.content,
      options: data.options ?? currentQ.options,
      answer: data.answer ?? currentQ.answer,
      explanation: data.explanation ?? currentQ.explanation,
      tags: data.tags ?? currentQ.tags,
      dimension: data.dimension ?? currentQ.dimension,
      type: data.type ?? currentQ.type ?? 'single' // 兼容旧数据
    };

    // 2. 使用 Schema 校验
    const validation = QuestionSchema.safeParse(merged);
    if (!validation.success) {
      return { success: false, error: validation.error.issues[0].message };
    }

    // 3. 构建动态 UPDATE 语句
    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (data.content !== undefined) { updates.push('content = ?'); params.push(data.content); }
    if (data.options !== undefined) { updates.push('options = ?'); params.push(JSON.stringify(data.options)); }
    if (data.answer !== undefined) { updates.push('answer = ?'); params.push(data.answer); }
    if (data.explanation !== undefined) { updates.push('explanation = ?'); params.push(data.explanation); }
    if (data.tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(data.tags)); }
    if (data.dimension !== undefined) { updates.push('dimension = ?'); params.push(data.dimension); }
    if (data.type !== undefined) { updates.push('type = ?'); params.push(data.type); }

    if (updates.length === 0) {
      return { success: false, error: '没有要更新的字段' };
    }

    params.push(id);
    const sql = `UPDATE questions SET ${updates.join(', ')} WHERE id = ?`;
    db.prepare(sql).run(...params);

    // 记录操作日志
    logAdminAction(user.id, user.username, 'UPDATE_QUESTION', 'question', id.toString(), data as unknown as Record<string, unknown>);

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Update question failed');
    return { success: false, error: '更新失败' };
  }
}

export async function batchDeleteQuestionsAction(ids: number[]) {
  const user = await requireRole(['admin']);
  try {
    if (ids.length === 0) {
      return { success: true, deletedCount: 0 };
    }

    const placeholders = ids.map(() => '?').join(', ');
    const sql = `DELETE FROM questions WHERE id IN (${placeholders})`;
    const result = db.prepare(sql).run(...ids);

    // 记录操作日志
    logAdminAction(user.id, user.username, 'BATCH_DELETE_QUESTION', 'question', null, { ids, count: result.changes });

    return { success: true, deletedCount: result.changes };
  } catch (error) {
    logger.error({ err: error }, 'Batch delete failed');
    return { success: false, error: '批量删除失败', deletedCount: 0 };
  }
}

// --- User Management ---

// --- User Management ---
// ... (UserAdminView definition remains, but we can reuse it or redefine it)

export type UserAdminView = {
  id: number;
  username: string;
  role: string;
  created_at: string;
  is_admin: boolean;
  token_version?: number;
  plan_id?: string;
  plan_name?: string;
  subscription_status?: string;
  expires_at?: string;
};

export async function getUsersAction(limit: number = 20, offset: number = 0, query: string = ''): Promise<{ users: UserAdminView[], total: number }> {
  await requireRole(['admin']);
  try {
    // 基础 SELECT 语句，LEFT JOIN 订阅信息
    let sql = `
      SELECT 
        u.id, u.username, u.role, u.created_at,
        us.plan_id,
        sp.name as plan_name,
        us.status as subscription_status,
        us.expires_at
      FROM users u
      LEFT JOIN user_subscriptions us ON u.id = us.user_id
      LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
    `;
    const params: (string | number | null)[] = [];

    if (query) {
      sql += ' WHERE u.username LIKE ?';
      params.push(`%${query}%`);
    }

    // Count total matches first (简化版，不包含 JOIN)
    let countSql = 'SELECT COUNT(*) as count FROM users';
    if (query) {
      countSql += ' WHERE username LIKE ?';
    }
    const total = (db.prepare(countSql).get(...(query ? [`%${query}%`] : [])) as { count: number }).count;

    // Fetch page
    sql += ' ORDER BY u.id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const users = db.prepare(sql).all(...params) as UserAdminView[];

    return {
      users: users.map(u => ({
        ...u,
        is_admin: u.role === 'admin',
        plan_id: u.plan_id || 'free',
        plan_name: u.plan_name || '免费版'
      })),
      total
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to get users');
    return { users: [], total: 0 };
  }
}

export async function deleteUserAction(id: number) {
  const user = await requireRole(['admin']);
  if (id === 1) return { success: false, error: '不能删除超级管理员' };

  try {
    // 获取被删除用户的信息用于日志
    const targetUser = db.prepare('SELECT username FROM users WHERE id = ?').get(id) as { username: string } | undefined;

    db.prepare('DELETE FROM users WHERE id = ?').run(id);

    // 记录操作日志
    logAdminAction(user.id, user.username, 'DELETE_USER', 'user', id.toString(), {
      deleted_username: targetUser?.username
    });

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete user');
    return { success: false, error: 'Delete failed' };
  }
}

export async function resetUserPasswordAction(id: number, newPassword: string) {
  const user = await requireRole(['admin']);
  try {
    // 获取目标用户信息
    const targetUser = db.prepare('SELECT username FROM users WHERE id = ?').get(id) as { username: string } | undefined;

    const passwordHash = await hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);

    // 记录操作日志（不记录密码内容）
    logAdminAction(user.id, user.username, 'RESET_PASSWORD', 'user', id.toString(), {
      target_username: targetUser?.username
    });

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Failed to reset password');
    return { success: false, error: '重置失败' };
  }
}

export async function updateUserRoleAction(id: number, role: UserRole) {
  const user = await requireRole(['admin']);
  if (id === 1) return { success: false, error: '不能更改超级管理员的角色' };

  try {
    // 获取目标用户信息
    const targetUser = db.prepare('SELECT username, role as old_role FROM users WHERE id = ?').get(id) as { username: string; old_role: string } | undefined;

    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);

    // 记录操作日志
    logAdminAction(user.id, user.username, 'CHANGE_ROLE', 'user', id.toString(), {
      target_username: targetUser?.username,
      old_role: targetUser?.old_role,
      new_role: role
    });

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Failed to update role');
    return { success: false, error: '更新角色失败' };
  }
}

export async function revokeUserSessionAction(id: number) {
  const user = await requireRole(['admin']);
  try {
    const targetUser = db.prepare('SELECT username, token_version FROM users WHERE id = ?').get(id) as { username: string; token_version: number } | undefined;

    // Increment token_version to invalidate all existing sessions
    const newVersion = (targetUser?.token_version || 0) + 1;
    db.prepare('UPDATE users SET token_version = ? WHERE id = ?').run(newVersion, id);

    logAdminAction(user.id, user.username, 'REVOKE_SESSION', 'user', id.toString(), {
      target_username: targetUser?.username,
      new_version: newVersion
    });

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Failed to revoke session');
    return { success: false, error: '强制下线失败' };
  }
}



/** 管理后台统计数据 */
export interface AdminStats {
    users: number;
    questions: number;
    practices: number;
    activeAi: number;
}

/**
 * 获取管理后台概览统计数据
 * 从 admin/page.tsx 提取，避免在 Server Component 内使用内联 'use server'
 */
export async function getAdminStatsAction(): Promise<AdminStats> {
    await requireRole(['admin']);
    try {
        const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
        const questionCount = db.prepare('SELECT COUNT(*) as count FROM questions').get() as { count: number };
        const practiceCount = db.prepare('SELECT COUNT(*) as count FROM practice_logs').get() as { count: number };
        const aiConfigCount = db.prepare('SELECT COUNT(*) as count FROM ai_configs WHERE is_active = 1').get() as { count: number };

        return {
            users: userCount.count,
            questions: questionCount.count,
            practices: practiceCount.count,
            activeAi: aiConfigCount.count,
        };
    } catch (error: any) {
        logger.error({ err: error }, '无法获取后台统计信息');
        return { users: 0, questions: 0, practices: 0, activeAi: 0 };
    }
}
