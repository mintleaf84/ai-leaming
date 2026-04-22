'use server';
import logger from '@/lib/logger';
import { Question, UserRole } from '@/types';
import { z } from 'zod';
import { getErrorMessage } from '@/lib/utils/error';
import { QuestionSchema } from '@/lib/schemas';
import { requireRole } from '@/lib/auth/auth';
import { logAdminAction } from '@/lib/admin/audit';
import { adminService, type QuestionFilters } from '@/lib/services/admin-service';

// Schema for bulk import
const ImportSchema = z.array(QuestionSchema);

export async function getQuestionsAction(
  limit: number = 50,
  offset: number = 0,
  filters?: QuestionFilters
) {
  await requireRole(['admin']);
  try {
    const { items, total } = await adminService.getQuestions(limit, offset, filters);
    return { questions: items, total };
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch questions');
    throw new Error('Failed to fetch questions');
  }
}

export async function importQuestionsAction(jsonData: unknown) {
  const user = await requireRole(['admin']);
  try {
    const parsedData = ImportSchema.parse(jsonData);
    const count = await adminService.importQuestions(parsedData);

    // 记录操作日志
    logAdminAction(user.id, user.username, 'CREATE_QUESTION', 'question', null, { count });

    return { success: true, count };
  } catch (error) {
    logger.error({ err: error }, 'Import failed');
    return { success: false, error: getErrorMessage(error, 'Unknown error') };
  }
}

export async function deleteQuestionAction(id: number) {
  const user = await requireRole(['admin']);
  try {
    await adminService.deleteQuestion(id);

    // 记录操作日志
    logAdminAction(user.id, user.username, 'DELETE_QUESTION', 'question', id.toString());

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Delete question failed');
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
    const currentQ = await adminService.getQuestionById(id);
    if (!currentQ) {
      return { success: false, error: '题目不存在' };
    }

    // 合并数据用于校验
    const merged = {
      content: data.content ?? currentQ.content,
      options: data.options ?? currentQ.options,
      answer: data.answer ?? currentQ.answer,
      explanation: data.explanation ?? currentQ.explanation,
      tags: data.tags ?? currentQ.tags,
      dimension: data.dimension ?? currentQ.dimension,
      type: data.type ?? currentQ.type ?? 'single'
    };

    const validation = QuestionSchema.safeParse(merged);
    if (!validation.success) {
      return { success: false, error: validation.error.issues[0].message };
    }

    await adminService.updateQuestion(id, data);

    // 记录操作日志
    logAdminAction(user.id, user.username, 'UPDATE_QUESTION', 'question', id.toString(), data as any);

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Update question failed');
    return { success: false, error: '更新失败' };
  }
}

export async function batchDeleteQuestionsAction(ids: number[]) {
  const user = await requireRole(['admin']);
  try {
    if (ids.length === 0) return { success: true, deletedCount: 0 };

    const deletedCount = await adminService.batchDeleteQuestions(ids);

    // 记录操作日志
    logAdminAction(user.id, user.username, 'BATCH_DELETE_QUESTION', 'question', null, { ids, count: deletedCount });

    return { success: true, deletedCount };
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

export async function getUsersAction(limit: number = 20, offset: number = 0, query: string = '') {
  await requireRole(['admin']);
  try {
    const { items, total } = await adminService.getUsers(limit, offset, query);
    return { users: items as unknown as UserAdminView[], total };
  } catch (error) {
    logger.error({ err: error }, 'Failed to get users');
    return { users: [], total: 0 };
  }
}

export async function deleteUserAction(id: number) {
  const user = await requireRole(['admin']);
  try {
    await adminService.deleteUser(id);

    // 记录操作日志
    logAdminAction(user.id, user.username, 'DELETE_USER', 'user', id.toString());

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete user');
    return { success: false, error: getErrorMessage(error, 'Delete failed') };
  }
}

export async function resetUserPasswordAction(id: number, newPassword: string) {
  const user = await requireRole(['admin']);
  try {
    await adminService.resetPassword(id, newPassword);

    // 记录操作日志
    logAdminAction(user.id, user.username, 'RESET_PASSWORD', 'user', id.toString());

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Failed to reset password');
    return { success: false, error: '重置失败' };
  }
}

export async function updateUserRoleAction(id: number, role: UserRole) {
  const user = await requireRole(['admin']);
  try {
    await adminService.updateUserRole(id, role);

    // 记录操作日志
    logAdminAction(user.id, user.username, 'CHANGE_ROLE', 'user', id.toString(), { role });

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Failed to update role');
    return { success: false, error: getErrorMessage(error, '更新角色失败') };
  }
}

export async function revokeUserSessionAction(id: number) {
  const user = await requireRole(['admin']);
  try {
    await adminService.revokeUserSessions(id);

    logAdminAction(user.id, user.username, 'REVOKE_SESSION', 'user', id.toString());

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
    return await adminService.getStats();
}
