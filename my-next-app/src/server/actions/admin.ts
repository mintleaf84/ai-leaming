'use server';

import db from '@/lib/db';
import { Question, UserRole } from '@/lib/types';
import { z } from 'zod';
import { QuestionSchema } from '@/lib/schemas';
import { requireRole, getSession } from '@/lib/auth/auth';
import { hashPassword } from '@/lib/auth/password';
import { logAdminAction } from '@/lib/admin/audit';

// Schema for bulk import
const ImportSchema = z.array(QuestionSchema);

export async function getQuestionsAction(limit: number = 50, offset: number = 0) {
  await requireRole(['admin']);
  try {
    const stmt = db.prepare('SELECT * FROM questions ORDER BY id DESC LIMIT ? OFFSET ?');
    const questions = stmt.all(limit, offset) as Question[];

    // Parse options back to array if stored as string (SQLite limitation)
    const parsedQuestions = questions.map(q => ({
      ...q,
      options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
      tags: typeof q.tags === 'string' ? JSON.parse(q.tags) : q.tags
    }));

    const total = db.prepare('SELECT COUNT(*) as count FROM questions').get() as { count: number };

    return { questions: parsedQuestions, total: total.count };
  } catch (error) {
    console.error('Failed to fetch questions:', error);
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
    console.error('Import failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function deleteQuestionAction(id: number) {
  const user = await requireRole(['admin']);
  try {
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);

    // 记录操作日志
    logAdminAction(user.id, user.username, 'DELETE_QUESTION', 'question', id.toString());

    return { success: true };
  } catch (error) {
    return { success: false, error: 'Delete failed' };
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
};

export async function getUsersAction(limit: number = 20, offset: number = 0, query: string = ''): Promise<{ users: UserAdminView[], total: number }> {
  await requireRole(['admin']);
  try {
    let sql = 'SELECT id, username, role, created_at FROM users';
    const params: any[] = [];

    if (query) {
      sql += ' WHERE username LIKE ?';
      params.push(`%${query}%`);
    } else {
      // Prevent full table scan on simple listing by ordering
    }

    // Count total matches first
    const countSql = sql.replace('SELECT id, username, role, created_at', 'SELECT COUNT(*) as count');
    const total = (db.prepare(countSql).get(...params) as { count: number }).count;

    // Fetch page
    sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const users = db.prepare(sql).all(...params) as any[];

    return {
      users: users.map(u => ({
        ...u,
        is_admin: u.role === 'admin'
      })),
      total
    };
  } catch (error) {
    console.error('Failed to get users:', error);
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
    console.error('Failed to delete user:', error);
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
    console.error('Failed to reset password:', error);
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
    console.error('Failed to update role:', error);
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
    console.error('Failed to revoke session:', error);
    return { success: false, error: '强制下线失败' };
  }
}


