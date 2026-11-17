import { drizzleDb, drizzleSchema } from "@/lib/db";
import { eq, sql, count, desc, and, like, inArray } from "drizzle-orm";
import logger from "@/lib/logger";
import { UserRole, Question, Dimension } from "@/types";
import { hashPassword } from "@/lib/auth/password";
import { affectedRows } from "@/lib/db/affected-rows";
import { buildAdminExternalId } from "@/lib/services/question-idempotency";
import { indexQuestion } from "@/lib/services/question-vector-index";

/**
 * 哪些字段参与 embedding 文本（见 `question-vector-index.ts` 的
 * `buildQuestionEmbeddingText`）：题干 + 选项 + 答案。
 *
 * 只有它们变了才需要重算向量；解析/标签/维度/题型是展示属性，改它们不该花一次
 * embedding 网络调用。
 */
const EMBEDDING_TEXT_FIELDS = ["content", "options", "answer"] as const;

function touchesEmbeddingText(data: Record<string, unknown>): boolean {
  return EMBEDDING_TEXT_FIELDS.some((field) => data[field] !== undefined);
}

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
        drizzleDb
          .select({ count: count() })
          .from(drizzleSchema.questions)
          .get(),
        drizzleDb
          .select({ count: count() })
          .from(drizzleSchema.practice_logs)
          .get(),
        drizzleDb
          .select({ count: count() })
          .from(drizzleSchema.ai_configs)
          .where(eq(drizzleSchema.ai_configs.is_active, true))
          .get(),
      ]);

      return {
        users: userRes?.count || 0,
        questions: questionRes?.count || 0,
        practices: practiceRes?.count || 0,
        activeAi: aiRes?.count || 0,
      };
    } catch (error) {
      logger.error({ err: error }, "[AdminService] Failed to get stats");
      return { users: 0, questions: 0, practices: 0, activeAi: 0 };
    }
  },

  /**
   * 获取用户列表 (支持搜索及订阅信息)
   */
  async getUsers(limit: number = 20, offset: number = 0, query: string = "") {
    const whereClause = query
      ? like(drizzleSchema.users.username, `%${query}%`)
      : undefined;

    const [items, totalRes] = await Promise.all([
      drizzleDb
        .select({
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
        .leftJoin(
          drizzleSchema.user_subscriptions,
          eq(drizzleSchema.users.id, drizzleSchema.user_subscriptions.user_id),
        )
        .leftJoin(
          drizzleSchema.subscription_plans,
          eq(
            drizzleSchema.user_subscriptions.plan_id,
            drizzleSchema.subscription_plans.id,
          ),
        )
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(drizzleSchema.users.id)),

      drizzleDb
        .select({ count: count() })
        .from(drizzleSchema.users)
        .where(whereClause)
        .get(),
    ]);

    return {
      items: items.map((u) => ({
        ...u,
        is_admin: u.role === "admin",
        plan_id: u.plan_id || "free",
        plan_name: u.plan_name || "免费版",
      })),
      total: totalRes?.count || 0,
    };
  },

  /**
   * 获取题目列表 (支持过滤)
   */
  async getQuestions(
    limit: number = 50,
    offset: number = 0,
    filters?: QuestionFilters,
  ) {
    const whereClauses = [];
    if (filters?.search) {
      whereClauses.push(
        like(drizzleSchema.questions.content, `%${filters.search}%`),
      );
    }
    if (filters?.tag) {
      whereClauses.push(like(drizzleSchema.questions.tags, `%${filters.tag}%`));
    }
    if (filters?.dimension) {
      whereClauses.push(
        eq(drizzleSchema.questions.dimension, filters.dimension),
      );
    }

    const finalWhere =
      whereClauses.length > 0 ? and(...whereClauses) : undefined;

    const [items, totalRes] = await Promise.all([
      drizzleDb
        .select()
        .from(drizzleSchema.questions)
        .where(finalWhere)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(drizzleSchema.questions.id)),
      drizzleDb
        .select({ count: count() })
        .from(drizzleSchema.questions)
        .where(finalWhere)
        .get(),
    ]);

    // 解析 JSON 字段
    const parsedItems = items.map((q) => ({
      ...q,
      options:
        typeof q.options === "string" ? JSON.parse(q.options) : q.options,
      tags: typeof q.tags === "string" ? JSON.parse(q.tags) : q.tags,
    }));

    return {
      items: parsedItems as Question[],
      total: totalRes?.count || 0,
    };
  },

  /**
   * 批量导入题目
   *
   * 幂等：管理端手工导入没有上游作业 ID，用「题干 + 选项 + 答案」的内容指纹当
   * `external_id`（`admin:` 前缀，见 `question-idempotency.ts`，与 PDF 导入共用
   * 同一份实现）。于是同一批内的重复题只落一条，整批重复导入 0 新增。
   * 返回**真正新插入**的行数（已存在的按跳过处理，不计入）。
   */
  async importQuestions(questions: Record<string, unknown>[]) {
    // 1. 批内去重：完全相同的题（同一个键）只保留第一份
    const pending = new Map<string, Record<string, unknown>>();
    for (const q of questions) {
      const externalId = buildAdminExternalId(q);
      if (!pending.has(externalId)) pending.set(externalId, q);
    }

    const candidateIds = [...pending.keys()];

    // 2. 先查已存在的键，只插入新增的（这样才能区分「新增」与「已存在」）
    const existing =
      candidateIds.length > 0
        ? await drizzleDb
            .select({ external_id: drizzleSchema.questions.external_id })
            .from(drizzleSchema.questions)
            .where(inArray(drizzleSchema.questions.external_id, candidateIds))
        : [];
    const existingIds = new Set(
      existing
        .map((row) => row.external_id)
        .filter((v): v is string => typeof v === "string"),
    );

    const values = [...pending.entries()]
      .filter(([externalId]) => !existingIds.has(externalId))
      .map(([externalId, q]) => ({
        external_id: externalId,
        content: q.content as string,
        options: JSON.stringify(q.options),
        answer: q.answer as string,
        explanation: q.explanation as string,
        tags: JSON.stringify(q.tags),
        dimension: q.dimension as "knowledge" | "understanding" | "application",
        type: (q.type || "single") as "single" | "multi" | "truefalse",
        created_at: sql`CURRENT_TIMESTAMP`,
      }));

    if (values.length === 0) return 0;

    // 3. onConflictDoNothing 兜住「预检后另一个请求先提交」的并发窗口：
    //    此时该键不返回行，计数自然不虚增，也不会因唯一索引整批失败。
    const inserted = await drizzleDb
      .insert(drizzleSchema.questions)
      .values(values)
      .onConflictDoNothing({ target: drizzleSchema.questions.external_id })
      .returning({ id: drizzleSchema.questions.id });

    return inserted.length;
  },

  /**
   * 删除题目：返回真正删掉的行数（0 = 题目不存在）
   */
  async deleteQuestion(id: number) {
    const result = await drizzleDb
      .delete(drizzleSchema.questions)
      .where(eq(drizzleSchema.questions.id, id));
    // `??` 而不是 `||`：0 是合法结果（没有任何行被删掉）
    return affectedRows(result) ?? 1;
  },

  /**
   * 批量删除题目
   */
  async batchDeleteQuestions(ids: number[]) {
    if (ids.length === 0) return 0;
    const result = await drizzleDb
      .delete(drizzleSchema.questions)
      .where(inArray(drizzleSchema.questions.id, ids));
    // Drizzle-orm-better-sqlite3 的 delete 返回的是 RunResult 对象 (由 better-sqlite3 返回)。
    // 注意用 `??` 而不是 `||`：rowsAffected 为 0 是合法结果（一行都没删掉），
    // 用 `||` 会把它当成"取不到"并回退成 ids.length，把"没删"报成"全删"。
    return affectedRows(result) ?? ids.length;
  },

  /**
   * 更新题目
   *
   * 题干/选项/答案变了就必须重算向量（它们正是 embedding 文本的三个组成字段，
   * 见 `question-vector-index.ts`）；只改解析/标签/维度时不必花一次网络调用。
   * 索引是 best-effort：失败只记日志，绝不让保存失败 —— 向量是派生数据，
   * 漏掉的题由 `scripts/reindex-question-vectors.ts` 补齐。
   */
  async updateQuestion(id: number, data: Record<string, unknown>) {
    const updateData: Record<string, unknown> = { ...data };
    if (data.options) updateData.options = JSON.stringify(data.options);
    if (data.tags) updateData.tags = JSON.stringify(data.tags);

    await drizzleDb
      .update(drizzleSchema.questions)
      .set(updateData)
      .where(eq(drizzleSchema.questions.id, id));

    if (touchesEmbeddingText(data)) {
      // 不 await：embedding 是一次网络调用，管理端保存不该被它拖住
      void indexQuestion(id).catch((error: unknown) => {
        logger.warn(
          { err: error, questionId: id },
          "[AdminService] 题目向量重建失败，保存已生效；可用重索引脚本补齐",
        );
      });
    }

    return true;
  },

  /**
   * 获取单个题目 (用于更新前的校验)
   */
  async getQuestionById(id: number): Promise<Question | null> {
    const res = await drizzleDb
      .select()
      .from(drizzleSchema.questions)
      .where(eq(drizzleSchema.questions.id, id))
      .get();

    if (!res) return null;

    return {
      ...res,
      options:
        typeof res.options === "string" ? JSON.parse(res.options) : res.options,
      tags: typeof res.tags === "string" ? JSON.parse(res.tags) : res.tags,
    } as Question;
  },

  /**
   * 重置用户密码
   */
  async resetPassword(userId: number, newPassword: string) {
    const passwordHash = await hashPassword(newPassword);
    await drizzleDb
      .update(drizzleSchema.users)
      .set({ password_hash: passwordHash })
      .where(eq(drizzleSchema.users.id, userId));
    return true;
  },

  /**
   * 更新用户角色
   */
  async updateUserRole(userId: number, role: UserRole) {
    // 禁止修改超级管理员 (假设 ID 为 1)
    if (userId === 1) throw new Error("Cannot change super admin role");

    await drizzleDb
      .update(drizzleSchema.users)
      .set({ role: role as "admin" | "student" | "teacher" })
      .where(eq(drizzleSchema.users.id, userId));
    return true;
  },

  /**
   * 强制用户下线 (通过增加 token_version)
   */
  async revokeUserSessions(userId: number) {
    await drizzleDb
      .update(drizzleSchema.users)
      .set({
        token_version: sql`${drizzleSchema.users.token_version} + 1`,
      })
      .where(eq(drizzleSchema.users.id, userId));
    return true;
  },

  /**
   * 删除用户
   */
  async deleteUser(userId: number) {
    if (userId === 1) throw new Error("Cannot delete super admin");

    await drizzleDb
      .delete(drizzleSchema.users)
      .where(eq(drizzleSchema.users.id, userId));
    return true;
  },

  /**
   * 获取全局活动流水 (管理员)
   */
  async getActivityLogs(
    limit: number = 50,
    offset: number = 0,
    filters?: { userId?: number; isCorrect?: boolean; search?: string },
  ) {
    const whereConditions = [];
    if (filters?.userId)
      whereConditions.push(
        eq(drizzleSchema.practice_logs.user_id, filters.userId),
      );
    if (filters?.isCorrect !== undefined)
      whereConditions.push(
        eq(drizzleSchema.practice_logs.is_correct, filters.isCorrect),
      );
    if (filters?.search) {
      whereConditions.push(
        sql`(${drizzleSchema.users.username} LIKE ${`%${filters.search}%`} OR ${drizzleSchema.questions.content} LIKE ${`%${filters.search}%`})`,
      );
    }

    const where =
      whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const [totalRes, logs] = await Promise.all([
      drizzleDb
        .select({ count: count() })
        .from(drizzleSchema.practice_logs)
        .leftJoin(
          drizzleSchema.users,
          eq(drizzleSchema.practice_logs.user_id, drizzleSchema.users.id),
        )
        .leftJoin(
          drizzleSchema.questions,
          eq(
            drizzleSchema.practice_logs.question_id,
            drizzleSchema.questions.id,
          ),
        )
        .where(where)
        .get(),

      drizzleDb
        .select({
          id: drizzleSchema.practice_logs.id,
          user_id: drizzleSchema.practice_logs.user_id,
          username: drizzleSchema.users.username,
          question_id: drizzleSchema.practice_logs.question_id,
          question_content: drizzleSchema.questions.content,
          dimension: drizzleSchema.questions.dimension,
          user_answer: drizzleSchema.practice_logs.user_answer,
          is_correct: drizzleSchema.practice_logs.is_correct,
          duration_ms: drizzleSchema.practice_logs.duration_ms,
          timestamp: drizzleSchema.practice_logs.timestamp,
        })
        .from(drizzleSchema.practice_logs)
        .leftJoin(
          drizzleSchema.users,
          eq(drizzleSchema.practice_logs.user_id, drizzleSchema.users.id),
        )
        .leftJoin(
          drizzleSchema.questions,
          eq(
            drizzleSchema.practice_logs.question_id,
            drizzleSchema.questions.id,
          ),
        )
        .where(where)
        .orderBy(desc(drizzleSchema.practice_logs.timestamp))
        .limit(limit)
        .offset(offset),
    ]);

    return {
      logs: logs.map((l) => ({ ...l, is_correct: Boolean(l.is_correct) })),
      total: totalRes?.count || 0,
    };
  },

  /**
   * 获取全站活动统计 (今日)
   */
  async getActivityStats() {
    const todayPredicate = sql`date(${drizzleSchema.practice_logs.timestamp}, 'localtime') = date('now', 'localtime')`;
    const aiTodayPredicate = sql`date(${drizzleSchema.api_call_logs.created_at}, 'localtime') = date('now', 'localtime')`;

    const [practiceRes, statsRes, aiRes] = await Promise.all([
      drizzleDb
        .select({ count: count() })
        .from(drizzleSchema.practice_logs)
        .where(todayPredicate)
        .get(),

      drizzleDb
        .select({
          accuracy: sql<number>`(SUM(CASE WHEN ${drizzleSchema.practice_logs.is_correct} = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*))`,
          avgDuration: sql<number>`AVG(${drizzleSchema.practice_logs.duration_ms})`,
        })
        .from(drizzleSchema.practice_logs)
        .where(todayPredicate)
        .get(),

      drizzleDb
        .select({
          count: count(),
          tokens: sql<number>`SUM(${drizzleSchema.api_call_logs.input_tokens} + ${drizzleSchema.api_call_logs.output_tokens})`,
        })
        .from(drizzleSchema.api_call_logs)
        .where(
          and(aiTodayPredicate, eq(drizzleSchema.api_call_logs.success, 1)),
        )
        .get(),
    ]);

    return {
      todayCount: practiceRes?.count || 0,
      accuracyRate: Math.round(statsRes?.accuracy || 0),
      avgDurationMs: Math.round(statsRes?.avgDuration || 0),
      aiCallsToday: aiRes?.count || 0,
      aiTokensToday: Number(aiRes?.tokens) || 0,
    };
  },
};
