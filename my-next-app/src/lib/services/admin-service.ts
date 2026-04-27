import { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, sql, count, desc, and, like, inArray } from 'drizzle-orm';
import logger from '@/lib/logger';
import { UserRole, Question, Dimension } from '@/types';
import { hashPassword } from '@/lib/auth/password';

export interface AdminStats {
    users: number;
    questions: number;
    practices: number;
    activeAi: number;
}

export interface QuestionFilters {
    search?: string;
    tag?: string;
    dimension?: Dimension;
}

export const adminService = {
    /**
     * 获取管理后台概览统计
     */
    async getStats(): Promise<AdminStats> {
        try {
            const [userRes, questionRes, practiceRes, aiRes] = await Promise.all([
                drizzleDb.select({ count: count() }).from(drizzleSchema.users).get(),
                drizzleDb.select({ count: count() }).from(drizzleSchema.questions).get(),
                drizzleDb.select({ count: count() }).from(drizzleSchema.practice_logs).get(),
                drizzleDb.select({ count: count() }).from(drizzleSchema.ai_configs)
                    .where(eq(drizzleSchema.ai_configs.is_active, true)).get()
            ]);

            return {
                users: userRes?.count || 0,
                questions: questionRes?.count || 0,
                practices: practiceRes?.count || 0,
                activeAi: aiRes?.count || 0,
            };
        } catch (error) {
            logger.error({ err: error }, '[AdminService] Failed to get stats');
            return { users: 0, questions: 0, practices: 0, activeAi: 0 };
        }
    },

    /**
     * 获取用户列表 (支持搜索及订阅信息)
     */
    async getUsers(limit: number = 20, offset: number = 0, query: string = '') {
        const whereClause = query ? like(drizzleSchema.users.username, `%${query}%`) : undefined;

        const [items, totalRes] = await Promise.all([
            drizzleDb.select({
                id: drizzleSchema.users.id,
                username: drizzleSchema.users.username,
                role: drizzleSchema.users.role,
                created_at: drizzleSchema.users.created_at,
                token_version: drizzleSchema.users.token_version,
                plan_id: drizzleSchema.user_subscriptions.plan_id,
                plan_name: drizzleSchema.subscription_plans.name,
                subscription_status: drizzleSchema.user_subscriptions.status,
                expires_at: drizzleSchema.user_subscriptions.expires_at,
            })
            .from(drizzleSchema.users)
            .leftJoin(drizzleSchema.user_subscriptions, eq(drizzleSchema.users.id, drizzleSchema.user_subscriptions.user_id))
            .leftJoin(drizzleSchema.subscription_plans, eq(drizzleSchema.user_subscriptions.plan_id, drizzleSchema.subscription_plans.id))
            .where(whereClause)
            .limit(limit)
            .offset(offset)
            .orderBy(desc(drizzleSchema.users.id)),
            
            drizzleDb.select({ count: count() })
                .from(drizzleSchema.users)
                .where(whereClause)
                .get()
        ]);

        return {
            items: items.map(u => ({
                ...u,
                is_admin: u.role === 'admin',
                plan_id: u.plan_id || 'free',
                plan_name: u.plan_name || '免费版'
            })),
            total: totalRes?.count || 0
        };
    },

    /**
     * 获取题目列表 (支持过滤)
     */
    async getQuestions(limit: number = 50, offset: number = 0, filters?: QuestionFilters) {
        const whereClauses = [];
        if (filters?.search) {
            whereClauses.push(like(drizzleSchema.questions.content, `%${filters.search}%`));
        }
        if (filters?.tag) {
            whereClauses.push(like(drizzleSchema.questions.tags, `%${filters.tag}%`));
        }
        if (filters?.dimension) {
            whereClauses.push(eq(drizzleSchema.questions.dimension, filters.dimension));
        }

        const finalWhere = whereClauses.length > 0 ? and(...whereClauses) : undefined;

        const [items, totalRes] = await Promise.all([
            drizzleDb.select().from(drizzleSchema.questions)
                .where(finalWhere)
                .limit(limit)
                .offset(offset)
                .orderBy(desc(drizzleSchema.questions.id)),
            drizzleDb.select({ count: count() }).from(drizzleSchema.questions)
                .where(finalWhere)
                .get()
        ]);

        // 解析 JSON 字段
        const parsedItems = items.map(q => ({
            ...q,
            options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
            tags: typeof q.tags === 'string' ? JSON.parse(q.tags) : q.tags
        }));

        return {
            items: parsedItems as Question[],
            total: totalRes?.count || 0
        };
    },

    /**
     * 批量导入题目
     */
    async importQuestions(questions: any[]) {
        return await drizzleDb.transaction(async (tx) => {
            const values = questions.map(q => ({
                content: q.content,
                options: JSON.stringify(q.options),
                answer: q.answer,
                explanation: q.explanation,
                tags: JSON.stringify(q.tags),
                dimension: q.dimension,
                type: q.type || 'single',
                created_at: sql`CURRENT_TIMESTAMP`
            }));

            // SQLite 批量插入限制，如果数量巨大可能需要分片，但对于常规导入一般没问题
            await tx.insert(drizzleSchema.questions).values(values);
            return values.length;
        });
    },

    /**
     * 删除题目
     */
    async deleteQuestion(id: number) {
        await drizzleDb.delete(drizzleSchema.questions)
            .where(eq(drizzleSchema.questions.id, id));
        return true;
    },

    /**
     * 批量删除题目
     */
    async batchDeleteQuestions(ids: number[]) {
        if (ids.length === 0) return 0;
        const result = await drizzleDb.delete(drizzleSchema.questions)
            .where(inArray(drizzleSchema.questions.id, ids));
        // Drizzle-orm-better-sqlite3 的 delete 返回的是 RunResult 对象 (由 better-sqlite3 返回)
        return (result as any).rowsAffected || ids.length;
    },

    /**
     * 更新题目
     */
    async updateQuestion(id: number, data: any) {
        const updateData: any = { ...data };
        if (data.options) updateData.options = JSON.stringify(data.options);
        if (data.tags) updateData.tags = JSON.stringify(data.tags);

        await drizzleDb.update(drizzleSchema.questions)
            .set(updateData)
            .where(eq(drizzleSchema.questions.id, id));
        return true;
    },

    /**
     * 获取单个题目 (用于更新前的校验)
     */
    async getQuestionById(id: number): Promise<Question | null> {
        const res = await drizzleDb.select().from(drizzleSchema.questions)
            .where(eq(drizzleSchema.questions.id, id))
            .get();
        
        if (!res) return null;

        return {
            ...res,
            options: typeof res.options === 'string' ? JSON.parse(res.options) : res.options,
            tags: typeof res.tags === 'string' ? JSON.parse(res.tags) : res.tags
        } as Question;
    },

    /**
     * 重置用户密码
     */
    async resetPassword(userId: number, newPassword: string) {
        const passwordHash = await hashPassword(newPassword);
        await drizzleDb.update(drizzleSchema.users)
            .set({ password_hash: passwordHash })
            .where(eq(drizzleSchema.users.id, userId));
        return true;
    },

    /**
     * 更新用户角色
     */
    async updateUserRole(userId: number, role: UserRole) {
        // 禁止修改超级管理员 (假设 ID 为 1)
        if (userId === 1) throw new Error('Cannot change super admin role');

        await drizzleDb.update(drizzleSchema.users)
            .set({ role: role as any })
            .where(eq(drizzleSchema.users.id, userId));
        return true;
    },

    /**
     * 强制用户下线 (通过增加 token_version)
     */
    async revokeUserSessions(userId: number) {
        await drizzleDb.update(drizzleSchema.users)
            .set({ 
                token_version: sql`${drizzleSchema.users.token_version} + 1` 
            })
            .where(eq(drizzleSchema.users.id, userId));
        return true;
    },

    /**
     * 删除用户
     */
    async deleteUser(userId: number) {
        if (userId === 1) throw new Error('Cannot delete super admin');
        
        await drizzleDb.delete(drizzleSchema.users)
            .where(eq(drizzleSchema.users.id, userId));
        return true;
    },

    /**
     * 获取全局活动流水 (管理员)
     */
    async getActivityLogs(limit: number = 50, offset: number = 0, filters?: { userId?: number; isCorrect?: boolean; search?: string }) {
        const whereConditions = [];
        if (filters?.userId) whereConditions.push(eq(drizzleSchema.practice_logs.user_id, filters.userId));
        if (filters?.isCorrect !== undefined) whereConditions.push(eq(drizzleSchema.practice_logs.is_correct, filters.isCorrect));
        if (filters?.search) {
            whereConditions.push(
                sql`(${drizzleSchema.users.username} LIKE ${`%${filters.search}%`} OR ${drizzleSchema.questions.content} LIKE ${`%${filters.search}%`})`
            );
        }

        const where = whereConditions.length > 0 ? and(...whereConditions) : undefined;

        const [totalRes, logs] = await Promise.all([
            drizzleDb.select({ count: count() })
                .from(drizzleSchema.practice_logs)
                .leftJoin(drizzleSchema.users, eq(drizzleSchema.practice_logs.user_id, drizzleSchema.users.id))
                .leftJoin(drizzleSchema.questions, eq(drizzleSchema.practice_logs.question_id, drizzleSchema.questions.id))
                .where(where).get(),
            
            drizzleDb.select({
                id: drizzleSchema.practice_logs.id,
                user_id: drizzleSchema.practice_logs.user_id,
                username: drizzleSchema.users.username,
                question_id: drizzleSchema.practice_logs.question_id,
                question_content: drizzleSchema.questions.content,
                dimension: drizzleSchema.questions.dimension,
                user_answer: drizzleSchema.practice_logs.user_answer,
                is_correct: drizzleSchema.practice_logs.is_correct,
                duration_ms: drizzleSchema.practice_logs.duration_ms,
                timestamp: drizzleSchema.practice_logs.timestamp
            })
            .from(drizzleSchema.practice_logs)
            .leftJoin(drizzleSchema.users, eq(drizzleSchema.practice_logs.user_id, drizzleSchema.users.id))
            .leftJoin(drizzleSchema.questions, eq(drizzleSchema.practice_logs.question_id, drizzleSchema.questions.id))
            .where(where)
            .orderBy(desc(drizzleSchema.practice_logs.timestamp))
            .limit(limit)
            .offset(offset)
        ]);

        return {
            logs: logs.map(l => ({ ...l, is_correct: Boolean(l.is_correct) })),
            total: totalRes?.count || 0
        };
    },

    /**
     * 获取全站活动统计 (今日)
     */
    async getActivityStats() {
        const todayPredicate = sql`date(${drizzleSchema.practice_logs.timestamp}, 'localtime') = date('now', 'localtime')`;
        const aiTodayPredicate = sql`date(${drizzleSchema.api_call_logs.created_at}, 'localtime') = date('now', 'localtime')`;

        const [practiceRes, statsRes, aiRes] = await Promise.all([
            drizzleDb.select({ count: count() })
                .from(drizzleSchema.practice_logs)
                .where(todayPredicate).get(),
            
            drizzleDb.select({
                accuracy: sql<number>`(SUM(CASE WHEN ${drizzleSchema.practice_logs.is_correct} = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*))`,
                avgDuration: sql<number>`AVG(${drizzleSchema.practice_logs.duration_ms})`
            })
            .from(drizzleSchema.practice_logs)
            .where(todayPredicate).get(),

            drizzleDb.select({
                count: count(),
                tokens: sql<number>`SUM(${drizzleSchema.api_call_logs.input_tokens} + ${drizzleSchema.api_call_logs.output_tokens})`
            })
            .from(drizzleSchema.api_call_logs)
            .where(and(aiTodayPredicate, eq(drizzleSchema.api_call_logs.success, 1))).get()
        ]);

        return {
            todayCount: practiceRes?.count || 0,
            accuracyRate: Math.round(statsRes?.accuracy || 0),
            avgDurationMs: Math.round(statsRes?.avgDuration || 0),
            aiCallsToday: aiRes?.count || 0,
            aiTokensToday: Number(aiRes?.tokens) || 0
        };
    }
};
