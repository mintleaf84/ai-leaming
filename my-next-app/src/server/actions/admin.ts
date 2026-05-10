'use server';

import { z } from 'zod';
import { adminAction } from '@/lib/safe-action';
import { adminService } from '@/lib/services/admin-service';
import { logAdminAction } from '@/lib/admin/audit';
import { QuestionSchema } from '@/lib/schemas';
import {
  QuestionFiltersSchema,
  QuestionUpdateSchema,
  UserQuerySchema,
  RoleUpdateSchema
} from '@/lib/validations/admin';
import { questionFeedbackService } from '@/lib/services/question-feedback-service';

/**
 * 获取题目列表（支持分页与过滤）
 */
export const getQuestionsAction = adminAction
  .inputSchema(z.object({
    limit: z.number().default(50),
    offset: z.number().default(0),
    filters: QuestionFiltersSchema,
  }))
  .action(async ({ parsedInput: input }) => {
    const { items, total } = await adminService.getQuestions(input.limit, input.offset, input.filters);
    return { success: true, questions: items, total };
  });

/**
 * 批量导入题目
 */
export const importQuestionsAction = adminAction
  .inputSchema(z.array(QuestionSchema).max(1000, '单次导入不能超过 1000 题'))
  .action(async ({ parsedInput: input, ctx }) => {
    const { user } = ctx;
    const count = await adminService.importQuestions(input);

    // 记录操作日志
    await logAdminAction(user.id, user.username, 'CREATE_QUESTION', 'question', null, { count });

    return { count };
  });

/**
 * 删除单个题目
 */
export const deleteQuestionAction = adminAction
  .inputSchema(z.number())
  .action(async ({ parsedInput: id, ctx }) => {
    const { user } = ctx;
    await adminService.deleteQuestion(id);

    // 记录操作日志
    await logAdminAction(user.id, user.username, 'DELETE_QUESTION', 'question', id.toString());

    return { success: true };
  });

/**
 * 更新题目内容
 */
export const updateQuestionAction = adminAction
  .inputSchema(QuestionUpdateSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const { id, data } = input;
    const { user } = ctx;
    
    const currentQ = await adminService.getQuestionById(id);
    if (!currentQ) {
      throw new Error('题目不存在');
    }

    // 校验答案合法性 (针对多选题)
    const finalType = data.type || currentQ.type;
    const finalOptions = data.options || currentQ.options;
    const finalAnswer = data.answer || currentQ.answer;

    if (finalType === 'multi' && finalAnswer) {
      try {
        const answers = JSON.parse(finalAnswer);
        if (Array.isArray(answers)) {
          const invalid = answers.find(a => !finalOptions.includes(a));
          if (invalid) {
            throw new Error(`正确答案必须是选项之一或有效的选项标号: ${invalid}`);
          }
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.message.includes('正确答案')) throw e;
        // 忽略 JSON 解析错误，可能是单选格式
      }
    }

    await adminService.updateQuestion(id, data);

    // 记录操作日志
    await logAdminAction(user.id, user.username, 'UPDATE_QUESTION', 'question', id.toString(), data as Record<string, unknown>);

    return { success: true };
  });

/**
 * 批量删除题目
 */
export const batchDeleteQuestionsAction = adminAction
  .inputSchema(z.array(z.number()))
  .action(async ({ parsedInput: ids, ctx }) => {
    const { user } = ctx;
    if (ids.length === 0) return { success: true, deletedCount: 0 };

    const deletedCount = await adminService.batchDeleteQuestions(ids);

    // 记录操作日志
    await logAdminAction(user.id, user.username, 'BATCH_DELETE_QUESTION', 'question', null, { ids, count: deletedCount });

    return { success: true, deletedCount };
  });

/**
 * 获取用户列表
 */
export const getUsersAction = adminAction
  .inputSchema(UserQuerySchema)
  .action(async ({ parsedInput: input }) => {
    const { items, total } = await adminService.getUsers(input.limit, input.offset, input.query);
    return { users: items, total };
  });

/**
 * 删除用户
 */
export const deleteUserAction = adminAction
  .inputSchema(z.number())
  .action(async ({ parsedInput: id, ctx }) => {
    const { user } = ctx;
    await adminService.deleteUser(id);

    // 记录操作日志
    await logAdminAction(user.id, user.username, 'DELETE_USER', 'user', id.toString());

    return { success: true };
  });

/**
 * 重置用户密码
 */
export const resetUserPasswordAction = adminAction
  .inputSchema(z.object({
    id: z.number(),
    newPassword: z.string().min(6),
  }))
  .action(async ({ parsedInput: input, ctx }) => {
    const { id, newPassword } = input;
    const { user } = ctx;
    await adminService.resetPassword(id, newPassword);

    // 记录操作日志
    await logAdminAction(user.id, user.username, 'RESET_PASSWORD', 'user', id.toString());

    return { success: true };
  });

/**
 * 更新用户角色
 */
export const updateUserRoleAction = adminAction
  .inputSchema(RoleUpdateSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const { id, role } = input;
    const { user } = ctx;
    await adminService.updateUserRole(id, role);

    // 记录操作日志
    await logAdminAction(user.id, user.username, 'CHANGE_ROLE', 'user', id.toString(), { role });

    return { success: true };
  });

/**
 * 强制用户下线（重置 Session）
 */
export const revokeUserSessionAction = adminAction
  .inputSchema(z.number())
  .action(async ({ parsedInput: id, ctx }) => {
    const { user } = ctx;
    await adminService.revokeUserSessions(id);

    await logAdminAction(user.id, user.username, 'REVOKE_SESSION', 'user', id.toString());

    return { success: true };
  });

/**
 * 获取管理后台概览统计数据
 */
export const getAdminStatsAction = adminAction
  .action(async () => {
    return await adminService.getStats();
  });

/**
 * 获取反馈列表
 */
export const getFeedbackListAction = adminAction
  .inputSchema(z.object({
    limit: z.number().default(20),
    offset: z.number().default(0),
    status: z.enum(['pending', 'resolved', 'dismissed']).optional(),
    feedback_type: z.enum(['wrong_answer', 'wrong_content', 'wrong_explanation', 'other']).optional(),
  }))
  .action(async ({ parsedInput: input }) => {
    const result = await questionFeedbackService.list(input);
    return result;
  });

/**
 * 标记反馈为已解决
 */
export const resolveFeedbackAction = adminAction
  .inputSchema(z.number())
  .action(async ({ parsedInput: id, ctx }) => {
    const { user } = ctx;
    await questionFeedbackService.resolve(id, user.id);
    await logAdminAction(user.id, user.username, 'RESOLVE_FEEDBACK', 'feedback', id.toString());
    return { success: true };
  });

/**
 * 忽略反馈
 */
export const dismissFeedbackAction = adminAction
  .inputSchema(z.number())
  .action(async ({ parsedInput: id, ctx }) => {
    const { user } = ctx;
    await questionFeedbackService.dismiss(id, user.id);
    await logAdminAction(user.id, user.username, 'DISMISS_FEEDBACK', 'feedback', id.toString());
    return { success: true };
  });

/**
 * 获取反馈状态计数
 */
export const getFeedbackCountsAction = adminAction
  .action(async () => {
    return await questionFeedbackService.getStatusCounts();
  });
