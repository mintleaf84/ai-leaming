import { drizzleDb, drizzleSchema, closeDb, reinitDb } from "@/lib/db";
import { resolveDbFilePath, findMissingCoreTables } from "@/lib/db/db-file";
import { eq, sql, count, desc, and, like, inArray } from "drizzle-orm";
import fs from "fs";
import path from "path";
import logger from "@/lib/logger";
import { UserRole, Question, Dimension } from "@/types";
import { hashPassword } from "@/lib/auth/password";
import { affectedRows } from "@/lib/db/affected-rows";
import { buildAdminExternalId } from "@/lib/services/question-idempotency";
import { indexQuestion } from "@/lib/services/question-vector-index";
import { regradeQuestionLogs } from "@/lib/services/question-regrade";
import { withTransaction } from "@/lib/db/executor";
import { touchesEmbeddingText } from "@/lib/services/question-index-policy";
import { coerceJsonColumn, safeParseJson } from "@/lib/utils/json";
import { getErrorMessage } from "@/lib/utils/error";
import { logAdminAction } from "@/lib/admin/audit";
import { dedupeFallbackQuestions } from "@/lib/services/question-dedupe-cleanup";

/**
 * 哪些字段参与 embedding 文本（见 `question-vector-index.ts` 的
 * `buildQuestionEmbeddingText`）：题干 + 选项 + 答案。
 *
 * 只有它们变了才需要重算向量；解析/标签/维度/题型是展示属性，改它们不该花一次
 * embedding 网络调用。
 */
// 判定逻辑抽到 question-index-policy：外部 API 改题也要用同一份实现，
// 两处各写一遍迟早会分叉（见该文件注释）

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

/**
 * 导出用的过滤条件。`tag` 与 `QuestionFilters.tag` **不是同一口径**：
 * 导出要「标签数组里存在某个标签」（`json_each` 精确匹配），列表页是 `LIKE` 包含。
 */
export interface QuestionExportFilters {
  search?: string;
  tag?: string;
  dimension?: string;
}

/** 审计日志要的操作者（`requireRole` 的返回值里只用到这两项） */
export interface AdminActor {
  id: number;
  username: string;
}

/**
 * 数据库恢复的结果。
 *
 * 用判别联合而不是直接把 `c.json()` 塞进 service：路由只做「结果 → HTTP」的映射，
 * 状态码与错误文案仍由这里给定（契约快照要求两者都不变）。
 */
export type RestoreDatabaseResult =
  | { ok: true; backupCreated: string }
  | { ok: false; status: 400 | 500; error: string; backup?: string };

/** 兜底题清理的结果（`report` 的类型随 `dedupeFallbackQuestions` 走，避免抄一遍字段） */
export type DedupeRunResult =
  | {
      ok: true;
      report: Awaited<ReturnType<typeof dedupeFallbackQuestions>>;
      backupPath?: string;
    }
  | { ok: false; status: 500; error: string };

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
      options: coerceJsonColumn<unknown[]>(q.options, []),
      tags: coerceJsonColumn<unknown[]>(q.tags, []),
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

    // 答案/选项/题型变更会改变历史判分：与改题同事务回刷（P0-1，见 question-regrade.ts）。
    // 题型决定判分走单选还是多选/填空分支（例如 single 误标改 multi 后，
    // ["C","A"] 与 ["A","C"] 应从错变对），必须一起触发。
    // 只改解析/标签/维度不触发——它们不参与判分。
    const needsRegrade =
      data.answer !== undefined ||
      data.options !== undefined ||
      data.type !== undefined;
    await withTransaction(async (exec) => {
      await exec
        .update(drizzleSchema.questions)
        .set(updateData)
        .where(eq(drizzleSchema.questions.id, id));
      if (needsRegrade) await regradeQuestionLogs(id, exec);
    });

    if (touchesEmbeddingText(data)) {
      // 不 await：embedding 是一次网络调用，管理端保存不该被它拖住。
      // pruneOnSkip: 内容已变却拿不到新向量时删掉旧向量 —— 旧向量描述的是旧题干，
      // 留着会让相似题检索按已不存在的内容召回（取舍详见 IndexQuestionOptions）。
      void indexQuestion(id, { pruneOnSkip: true }).catch((error: unknown) => {
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
      options: coerceJsonColumn<unknown[]>(res.options, []),
      tags: coerceJsonColumn<unknown[]>(res.tags, []),
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

    // 删任务态与删用户必须原子：先删成功、后删失败会让"用户还在但任务没了"，
    // 且无法回滚（OCR 原文是用户重传的唯一副本）
    await withTransaction(async (exec) => {
      // 显式清理 PDF 导入任务态：连接没开 `PRAGMA foreign_keys`，声明的
      // ON DELETE CASCADE 不会触发，OCR 原文与分块文本会作为孤儿行留在库里
      await exec
        .delete(drizzleSchema.pdf_import_tasks)
        .where(eq(drizzleSchema.pdf_import_tasks.user_id, userId));

      await exec
        .delete(drizzleSchema.users)
        .where(eq(drizzleSchema.users.id, userId));
    });
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

  // ==================== 系统 / 演示模式 / 备份恢复 ====================
  // 这些编排原先直接写在 routes/admin.ts 里（白名单条目），下层到 service 后
  // 路由只剩鉴权、参数校验与响应映射；进程级副作用（关/重开连接）只在这里调用。

  /**
   * 读取演示模式开关（`system_settings` 中 user_id=0 的全局行）
   */
  async getDemoModeStatus(): Promise<boolean> {
    try {
      const row = await drizzleDb.query.system_settings.findFirst({
        where: and(
          eq(drizzleSchema.system_settings.key, "demo_mode_enabled"),
          eq(drizzleSchema.system_settings.user_id, 0),
        ),
      });
      return row?.value === "true";
    } catch (err) {
      // audit-allow: 读不到开关按关闭处理（与历史行为一致），已记结构化日志
      logger.warn({ err }, "读取演示模式开关失败，按关闭处理");
      return false;
    }
  },

  /**
   * 写入演示模式开关（upsert 到 user_id=0 的全局行）
   */
  async setDemoMode(enabled: boolean): Promise<void> {
    await drizzleDb
      .insert(drizzleSchema.system_settings)
      .values({
        user_id: 0,
        key: "demo_mode_enabled",
        value: String(enabled),
      })
      .onConflictDoUpdate({
        target: [
          drizzleSchema.system_settings.user_id,
          drizzleSchema.system_settings.key,
        ],
        set: { value: String(enabled), updated_at: sql`CURRENT_TIMESTAMP` },
      });
  },

  /**
   * 重置演示数据集：先删演示会话的练习日志，再删演示会话（子查询，避免 N+1）
   */
  async resetDemoSession(): Promise<void> {
    await drizzleDb.run(sql`
            DELETE FROM practice_logs WHERE session_id IN (SELECT id FROM practice_sessions WHERE is_demo = 1)
        `);
    await drizzleDb
      .delete(drizzleSchema.practice_sessions)
      .where(eq(sql`is_demo`, 1));
  },

  /**
   * 数据库文件大小（字节）。读不到按 0 回退——这只是系统状态里的展示元信息，
   * 不该让整张状态卡失败。
   */
  async getDatabaseFileSize(): Promise<number> {
    const dbPath = resolveDbFilePath();
    try {
      return fs.statSync(dbPath).size;
    } catch (err) {
      // audit-allow: 可选元信息，失败按 0 返回；debug 级留痕便于排查
      logger.debug({ err, dbPath }, "读取数据库文件大小失败，使用 0");
      return 0;
    }
  },

  /**
   * 备份/恢复操作历史（`admin_logs` 最近 50 条 BACKUP/RESTORE 记录）
   */
  async getBackupHistory() {
    const rows = await drizzleDb
      .select({
        id: drizzleSchema.admin_logs.id,
        action: drizzleSchema.admin_logs.action,
        username: drizzleSchema.admin_logs.username,
        details: drizzleSchema.admin_logs.details,
        created_at: drizzleSchema.admin_logs.created_at,
      })
      .from(drizzleSchema.admin_logs)
      .where(
        sql`${drizzleSchema.admin_logs.action} IN ('BACKUP_DATABASE', 'RESTORE_DATABASE')`,
      )
      .orderBy(desc(drizzleSchema.admin_logs.created_at))
      .limit(50);

    return rows.map((row) => {
      // details 是历史 JSON 快照；脏数据回退为空对象（复用统一的安全解析）
      const details =
        safeParseJson<Record<string, unknown> | null>(row.details, null) ?? {};
      return {
        id: row.id,
        action: row.action,
        username: row.username,
        filename: (details.filename as string) || null,
        backupCreated: (details.backupCreated as string) || null,
        created_at: row.created_at,
      };
    });
  },

  /**
   * 导出题库：返回原始行，CSV 拼装/转义留在路由层（展示职责）。
   * 注意 `tag` 用 `json_each` 精确匹配数组元素，与列表页的 `LIKE` 口径不同。
   */
  async listQuestionsForExport(filters: QuestionExportFilters = {}) {
    let query = drizzleDb.select().from(drizzleSchema.questions);
    const conditions = [];

    if (filters.search)
      conditions.push(
        like(drizzleSchema.questions.content, `%${filters.search}%`),
      );
    if (filters.tag)
      conditions.push(
        sql`EXISTS (SELECT 1 FROM json_each(${drizzleSchema.questions.tags}) WHERE value = ${filters.tag})`,
      );
    if (filters.dimension)
      conditions.push(
        eq(drizzleSchema.questions.dimension, filters.dimension as Dimension),
      );

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as unknown as typeof query;
    }

    return await query.orderBy(desc(drizzleSchema.questions.id)).all();
  },

  /**
   * 生成一致的数据库快照（`VACUUM INTO`），返回文件名与字节内容。
   *
   * `VACUUM INTO` 只能落盘，而响应体需要 Buffer，所以写到 `temp_backups/`
   * 再读回内存并删除。失败返回 `null`，由路由映射为 500（文案仍是 "Backup failed"）。
   */
  async createBackupSnapshot(
    actor: AdminActor,
  ): Promise<{ filename: string; data: Buffer<ArrayBuffer> } | null> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `ai-learning-backup-${timestamp}.db`;
    const tempDir = path.resolve(process.cwd(), "temp_backups");
    const tempPath = path.resolve(tempDir, filename);

    try {
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      await drizzleDb.run(sql`VACUUM INTO ${tempPath}`);
      await logAdminAction(
        actor.id,
        actor.username,
        "BACKUP_DATABASE",
        "system",
        "database",
        { filename },
      );
      const data = fs.readFileSync(tempPath);
      fs.unlinkSync(tempPath);
      return { filename, data };
    } catch (error) {
      if (fs.existsSync(tempPath))
        try {
          fs.unlinkSync(tempPath);
        } catch (cleanupErr) {
          // audit-allow: 回滚路径的清理是尽力而为，失败不影响返回的错误语义
          logger.debug({ err: cleanupErr, tempPath }, "回滚时删除临时文件失败");
        }
      logger.error({ err: error, tempPath }, "[AdminService] 数据库备份失败");
      return null;
    }
  },

  /**
   * 用上传的 SQLite 文件替换线上库。
   *
   * 顺序与保护沿用原路由实现，一处都不能放宽：
   *   1. magic header → 结构探测（缺核心表直接拒绝，不碰线上库一个字节）；
   *   2. `closeDb()` 后 copy/unlink/rename，再 `reinitDb()`；
   *   3. 任何一步失败 → 用 `.bak-<ts>` 回滚并重连；回滚也失败则保留备份文件并明确报错。
   *
   * `closeDb()/reinitDb()` 是**进程级副作用**：只允许在这个「管理员鉴权通过后」的
   * 入口调用。不要把它包装成可被其他代码随意调用的公共方法——一个未鉴权的请求
   * 就能把全站的连接断掉。
   *
   * 审计日志写在**替换成功之后、同一个 try 内**：与历史实现一致——日志写失败会走
   * 回滚分支（宁可回到旧库，也不要出现"恢复成功但没有审计记录"的不可追溯状态）。
   */
  async restoreDatabase(input: {
    buffer: Buffer;
    fileName: string;
    actor: AdminActor;
  }): Promise<RestoreDatabaseResult> {
    const { buffer, fileName, actor } = input;

    // 恢复目标必须与 initDatabase()/reinitDb() 连的是同一个文件（唯一来源：
    // resolveDbFilePath）。否则改了 DB_FILENAME 的部署会把备份恢复到
    // data/ai-learning.db，随后 reinitDb() 又在 DB_FILENAME 处新建一个空库 ——
    // 接口报成功，应用在空库上空转。
    const dbPath = resolveDbFilePath();
    const backupPath = `${dbPath}.bak-${Date.now()}`;
    const tempPath = path.resolve(process.cwd(), "data", "temp_restore.db");

    try {
      if (!buffer.subarray(0, 16).toString().startsWith("SQLite format 3")) {
        return { ok: false, status: 400, error: "无效的 SQLite 数据库文件" };
      }

      fs.writeFileSync(tempPath, buffer);

      // 结构校验：magic header 只能证明"是 SQLite"，不能证明"是本应用的库"。
      // 缺核心表的库一旦被接受，线上库会被替换成应用跑不起来的东西 —— 必须在
      // closeDb()/覆盖之前拒绝，且不碰线上库一个字节。
      let missingTables: string[];
      try {
        missingTables = findMissingCoreTables(tempPath);
      } catch (probeErr) {
        // 命中明确业务错误：文件读不出 SQLite 结构 = 上传的不是可用备份，转 400
        fs.rmSync(tempPath, { force: true });
        logger.warn(
          { err: probeErr, fileName },
          "备份文件结构无法读取，拒绝恢复",
        );
        return {
          ok: false,
          status: 400,
          error: "无效的备份文件：无法读取 SQLite 结构",
        };
      }
      if (missingTables.length > 0) {
        fs.rmSync(tempPath, { force: true });
        logger.warn(
          { fileName, missingTables },
          "备份文件缺少核心表，拒绝恢复",
        );
        return {
          ok: false,
          status: 400,
          error: `无效的备份文件：缺少关键数据表（${missingTables.join("、")}）`,
        };
      }

      closeDb();

      try {
        if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, backupPath);
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        fs.renameSync(tempPath, dbPath);
        reinitDb();
        await logAdminAction(
          actor.id,
          actor.username,
          "RESTORE_DATABASE",
          "system",
          "database",
          {
            filename: fileName,
            backupCreated: path.basename(backupPath),
          },
        );
        return { ok: true, backupCreated: path.basename(backupPath) };
      } catch (e: unknown) {
        try {
          if (fs.existsSync(backupPath) && !fs.existsSync(dbPath)) {
            fs.copyFileSync(backupPath, dbPath);
          }
        } catch (rollbackErr) {
          // 恢复备份本身失败：保留备份文件、明确报错，绝不重连到新建的空库
          logger.error(
            { err: rollbackErr, backupPath, dbPath },
            "回滚恢复备份失败，已保留备份文件",
          );
          return {
            ok: false,
            status: 500,
            error:
              "Restore failed and rollback failed. Database backup preserved at " +
              path.basename(backupPath),
            backup: path.basename(backupPath),
          };
        }
        try {
          reinitDb();
        } catch (reinitErr) {
          // audit-allow: 数据已恢复，重连失败时进程重启即可，错误已记录
          logger.error({ err: reinitErr }, "回滚后重连数据库失败");
        }
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        return {
          ok: false,
          status: 500,
          error:
            "Restore failed: " +
            ((e instanceof Error ? e.message : null) || "Unknown error"),
        };
      }
    } catch (error: unknown) {
      try {
        reinitDb();
      } catch (reinitErr) {
        // audit-allow: 失败后的重连是尽力而为，错误语义已由返回值表达
        logger.error({ err: reinitErr }, "重连数据库失败");
      }
      return {
        ok: false,
        status: 500,
        error: "Restore failed: " + getErrorMessage(error),
      };
    }
  },

  /**
   * 兜底题重复清理：`apply=true` 时先 `VACUUM INTO` 备份，备份不可用即中止。
   * 幂等性由 `question-dedupe-cleanup.ts` 保证（重复执行不会二次迁移/删除）。
   */
  async runDedupe(input: {
    apply: boolean;
    actor: AdminActor;
  }): Promise<DedupeRunResult> {
    const { apply, actor } = input;

    try {
      let backupPath: string | undefined;
      if (apply) {
        // 与 /backup 同一纪律：VACUUM INTO 生成一致快照，失败即中止，绝不带病执行
        const dir = path.resolve(process.cwd(), "data");
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        backupPath = path.join(
          dir,
          `backup-before-dedupe-${new Date().toISOString().replace(/[:.]/g, "-")}.db`,
        );
        await drizzleDb.run(sql`VACUUM INTO ${backupPath}`);
        if (!fs.existsSync(backupPath) || fs.statSync(backupPath).size < 1024) {
          return { ok: false, status: 500, error: "备份失败，清理已中止" };
        }
      }

      const report = await dedupeFallbackQuestions({ dryRun: !apply });

      if (apply) {
        await logAdminAction(
          actor.id,
          actor.username,
          "DATA_DEDUPE",
          "system",
          "questions",
          { ...report } as unknown as Record<string, unknown>,
        );
      }

      return { ok: true, report, backupPath };
    } catch (error) {
      logger.error({ err: error }, "[AdminService] 数据清理失败");
      return { ok: false, status: 500, error: "清理失败，详见服务端日志" };
    }
  },
};
