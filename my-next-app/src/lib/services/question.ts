import { drizzleDb, drizzleSchema } from "@/lib/db";
import { isVectorAvailable, searchQuestionVectors } from "@/lib/db/vec-store";
import { eq, like, and, sql, desc, inArray } from "drizzle-orm";
import { ragService } from "@/lib/ai/rag";
import { Question, Dimension } from "@/types";
import { QuestionRowSchema, QuestionSchema } from "@/lib/schemas";
import logger from "@/lib/logger";
import { coerceJsonColumn, safeParseJson } from "@/lib/utils/json";
import type { Executor } from "@/lib/db/executor";
import { withTransaction } from "@/lib/db/executor";
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
} from "@/lib/errors/app-error";
import { buildApiExternalId } from "@/lib/services/question-idempotency";
import { regradeQuestionLogs } from "@/lib/services/question-regrade";
import type { RegradeResult } from "@/lib/services/question-regrade";
import { touchesEmbeddingText } from "@/lib/services/question-index-policy";
import { indexQuestion } from "@/lib/services/question-vector-index";

/**
 * 题目摘要（用于卡片展示）
 */
export interface QuestionSummary {
  id: number;
  content: string; // 题目内容（截取前 100 字）
  type: string; // 题型
  tags: string[]; // 知识点标签
}

/**
 * 将数据库原始行映射为业务 Question 类型
 */
function mapQuestion(q: Record<string, unknown>): Question {
  try {
    return QuestionRowSchema.parse(q);
  } catch (err) {
    logger.error(
      { err, questionId: q.id },
      "[QuestionService] Question mapping failed",
    );
    return {
      ...q,
      options: coerceJsonColumn<unknown[]>(q.options, []),
      tags: coerceJsonColumn<unknown[]>(q.tags, []),
      type: q.type || "single",
      dimension: q.dimension || "knowledge",
    } as Question;
  }
}

/**
 * 将题目对象映射为摘要对象
 */
function mapToSummary(q: Question): QuestionSummary {
  return {
    id: q.id,
    content: q.content.slice(0, 100) + (q.content.length > 100 ? "..." : ""),
    type: q.type,
    tags: q.tags,
  };
}

export interface QuestionFilter {
  limit?: number;
  offset?: number;
  tags?: string[];
  type?: string[];
  search?: string;
  dimension?: Dimension;
}

/**
 * 向量能力不可用只警告一次：`searchSimilarQuestions` 会被 AI 兜底路径反复调用，
 * 每次都打一条 warn 会淹没真正的错误。
 */
let vectorUnavailableWarned = false;

function warnVectorUnavailableOnce(): void {
  if (vectorUnavailableWarned) return;
  vectorUnavailableWarned = true;
  logger.warn(
    "[QuestionService] sqlite-vec 不可用，相似题检索降级为空结果（后续不再重复告警）",
  );
}

/**
 * embedding 降级同样只警告一次 —— 与向量扩展不可用并列的另一种"检索能力缺失"。
 *
 * 为什么必须在这里拦住：`rag.ts` 降级时返回的是 `Math.sin(hash + i)` 生成的**伪向量**，
 * 拿它当查询向量跑 KNN 不会报错，只会返回一批与题干无关的题目 —— "看起来正常的
 * 错误结果"比空结果危险得多。写入路径已按同样理由拒收伪向量（`question-vector-index.ts`），
 * 查询路径必须是同一道门。
 */
let embeddingDegradedWarned = false;

function warnEmbeddingDegradedOnce(): void {
  if (embeddingDegradedWarned) return;
  embeddingDegradedWarned = true;
  logger.warn(
    "[QuestionService] embedding 走了降级路径（伪向量），跳过相似题检索并返回空结果（后续不再重复告警）",
  );
}

/**
 * 建题/改题的操作者。
 *
 * 题库本身是全局资产（没有 owner 列），但**由谁建的题**必须留痕：
 * `admin_logs` 记 actor，内部建题用 `manual:<userId>:` 前缀把归属编码进幂等键，
 * 这样"自己建的题自己能改、别人的题改不动"在没有 user_id 列的前提下也可判定。
 */
export interface QuestionWriteActor {
  id: number;
  username: string;
  ip_address?: string | null;
}

export interface QuestionCreateOptions {
  actor: QuestionWriteActor;
  /** 外部传入的幂等键（草稿 confirm 用 `draft:<draftId>:<idx>`） */
  externalId?: string;
  source?: string;
  /** 调用方已用 `QuestionSchema` 校验过（草稿 confirm 聚合完 issues 再写） */
  validated?: boolean;
  /** 事务执行器（草稿 confirm 单事务） */
  exec?: Executor;
  /** false = 不写 admin_logs（草稿逐条确认时只留草稿级记录） */
  audit?: boolean;
  /** 默认 true；事务内由调用方提交后统一重建 */
  indexVector?: boolean;
}

export interface QuestionCreateResult {
  id: number;
  created: boolean;
  /** 命中既有幂等键时，库里那道题的内容 */
  question: Question | null;
  /** 其余数据库列（旧形态调用方直接当行用） */
  [key: string]: unknown;
}

export interface QuestionUpdateOptions {
  actor: QuestionWriteActor;
  audit?: boolean;
  indexVector?: boolean;
}

export interface QuestionUpdateResult {
  id: number;
  changed: string[];
  regrade: RegradeResult | null;
}

/** 内容校验失败：issues 一次报全（路由层交给 `toErrorResponse` 渲染） */
export class QuestionValidationError extends ValidationError {
  constructor(issues: string[], message = "题目内容校验失败") {
    super(message, { code: "question.validation", issues });
  }
}

/** 非本人创建（manual:/draft: 前缀归属不匹配） */
export class QuestionForbiddenError extends ForbiddenError {
  constructor(message = "只能修改自己创建的题目") {
    super(message, { code: "question.forbidden" });
  }
}

function formatIssues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    return `${path || "body"}: ${issue.message}`;
  });
}

/** 内部建题的幂等键：按用户隔离，同一用户同一内容重复提交不新增行 */
export function buildManualExternalId(
  userId: number,
  data: { content: string; options?: unknown; answer?: string | null },
): string {
  return `manual:${userId}:${buildApiExternalId(data).slice("api:".length)}`;
}

/**
 * 归属判定：`manual:<uid>:` 与 `draft:<draftId>:` 这两类键带 owner；
 * 其余（`api:` 内容指纹、粉笔等上游题号）是全局题库，登录用户均可维护。
 */
export async function assertQuestionWritable(
  question: { external_id?: string | null },
  actorId: number,
  exec: Executor = drizzleDb,
): Promise<void> {
  const externalId = question.external_id ?? "";
  const manual = /^manual:(\d+):/.exec(externalId);
  if (manual && Number(manual[1]) !== actorId) {
    throw new QuestionForbiddenError();
  }
  const draft = /^draft:([^:]+):/.exec(externalId);
  if (draft) {
    const [owner] = await exec
      .select({ user_id: drizzleSchema.question_drafts.user_id })
      .from(drizzleSchema.question_drafts)
      .where(eq(drizzleSchema.question_drafts.id, draft[1]))
      .limit(1);
    if (!owner || owner.user_id !== actorId) {
      throw new QuestionForbiddenError("只能修改自己草稿确认的题目");
    }
  }
}

/** 题目写操作留痕（`admin_logs` 是唯一的审计入口，不要另建表） */
async function writeQuestionAudit(
  exec: Executor,
  actor: QuestionWriteActor,
  action: "QUESTION_CREATE" | "QUESTION_UPDATE",
  questionId: number,
  details: Record<string, unknown>,
): Promise<void> {
  await exec.insert(drizzleSchema.admin_logs).values({
    user_id: actor.id,
    username: actor.username || `user-${actor.id}`,
    action,
    target_type: "question",
    target_id: String(questionId),
    details: JSON.stringify(details),
    ip_address: actor.ip_address ?? null,
  });
}

export const questionService = {
  /**
   * 搜索相似题目 (向量检索回退)
   *
   * 向量读写只能走 legacy better-sqlite3 连接（vec0 只在那条连接上加载），
   * 而题面数据在 drizzle/libsql 上，跨连接不能 JOIN，所以分两步：
   * 先按向量拿 `{ questionId, distance }`，再按 id 批量取题并按 distance 排序。
   *
   * 这条路径被 `ai.ts` 当兜底调用：任何失败都必须降级成 `[]`，否则会把
   * "AI 不可用"升级成硬错误。embedding 降级（伪向量）也归入这条降级：宁可不查。
   */
  searchSimilarQuestions: async (content: string, limit: number = 3) => {
    if (!isVectorAvailable()) {
      warnVectorUnavailableOnce();
      return [];
    }

    try {
      // 用 getEmbeddingResult：查询向量同样不能是降级伪向量（它只是 Math.sin 噪声，
      // KNN 会照常返回"最像的"一批无关题目）。降级时直接不查 —— 不是"查了再过滤"。
      const { vector: embedding, degraded } =
        await ragService.getEmbeddingResult(content);

      if (degraded) {
        warnEmbeddingDegradedOnce();
        return [];
      }

      const hits = searchQuestionVectors(embedding, limit);
      if (hits.length === 0) return [];

      const rows = await drizzleDb
        .select()
        .from(drizzleSchema.questions)
        .where(
          inArray(
            drizzleSchema.questions.id,
            hits.map((hit) => hit.questionId),
          ),
        );

      // 索引有、题面没有（题目被删但向量残留）时跳过该条，不返回半截数据
      const byId = new Map(rows.map((row) => [row.id, row]));
      return hits.flatMap((hit) => {
        const row = byId.get(hit.questionId);
        return row
          ? [mapQuestion(row as unknown as Record<string, unknown>)]
          : [];
      });
    } catch (error) {
      // audit-allow: 检索失败降级为空结果（调用方有 AI 兜底），不阻断答题流程
      logger.error({ err: error }, "[QuestionService] 相似题目检索失败");
      return [];
    }
  },

  /**
   * 纯题库随机取题（**不依赖 embedding**）。
   *
   * 为什么需要单独一个入口：`searchSimilarQuestions` 在向量不可用、或 embedding 降级
   * （`Math.sin` 伪向量）时一律返回 `[]` —— 这是对的，伪向量检索出来的只是噪声的最近邻。
   * 但 `ai.ts` 的「AI 失败兜底」如果只靠它，"AI 挂了"就变成"没题可练"。
   *
   * 向量只决定"像不像"，不决定"有没有题"。所以兜底要分两层：
   * 有向量时按相似度取（`searchSimilarQuestions`），没有时直接从题库随机取。
   */
  pickFallbackQuestions: async (limit = 3): Promise<Question[]> => {
    /*
     * 用 `select` 而不是关系查询的 `findMany`：`findMany` 的 `where` 回调要靠
     * operators 解构出 `sql`，这里直接用顶层导入的 `sql` 标签，少一层抽象也更稳。
     */
    const rows = await drizzleDb
      .select()
      .from(drizzleSchema.questions)
      .where(sql`length(${drizzleSchema.questions.content}) > 0`)
      .orderBy(sql`RANDOM()`)
      .limit(limit);
    return rows.map((row) =>
      mapQuestion(row as unknown as Record<string, unknown>),
    );
  },

  /**
   * 获取单个题目
   */
  async getById(id: number): Promise<Question | null> {
    const result = await drizzleDb.query.questions.findFirst({
      where: eq(drizzleSchema.questions.id, id),
    });
    return result ? mapQuestion(result) : null;
  },

  /**
   * 获取题目摘要
   */
  async getSummary(id: number): Promise<QuestionSummary | null> {
    const q = await this.getById(id);
    return q ? mapToSummary(q) : null;
  },

  /**
   * 列表查询
   */
  async list(
    filter: QuestionFilter = {},
  ): Promise<{ items: Question[]; total: number }> {
    const conditions = [];

    if (filter.search) {
      conditions.push(
        like(drizzleSchema.questions.content, `%${filter.search}%`),
      );
    }

    if (filter.dimension) {
      conditions.push(eq(drizzleSchema.questions.dimension, filter.dimension));
    }

    if (filter.type && filter.type.length > 0) {
      conditions.push(
        inArray(
          drizzleSchema.questions.type,
          filter.type as [string, ...string[]],
        ),
      );
    }

    if (filter.tags && filter.tags.length > 0) {
      // SQLite JSON 数组筛选
      filter.tags.forEach((tag) => {
        conditions.push(
          sql`EXISTS (SELECT 1 FROM json_each(${drizzleSchema.questions.tags}) WHERE value = ${tag})`,
        );
      });
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // 并发查询总数和数据
    const [items, totalResult] = await Promise.all([
      drizzleDb.query.questions.findMany({
        where,
        orderBy: [desc(drizzleSchema.questions.id)],
        limit: filter.limit || 20,
        offset: filter.offset || 0,
      }),
      drizzleDb
        .select({ count: sql<number>`count(*)` })
        .from(drizzleSchema.questions)
        .where(where)
        .get(),
    ]);

    return {
      items: items.map((q: Record<string, unknown>) => mapQuestion(q)),
      total: totalResult?.count || 0,
    };
  },

  /**
   * 更新题目助记词
   */
  async updateMnemonic(id: number, mnemonic: string) {
    await drizzleDb
      .update(drizzleSchema.questions)
      .set({ ai_mnemonic: mnemonic })
      .where(eq(drizzleSchema.questions.id, id));
    return true;
  },

  /**
   * 创建题目。
   *
   * 两种调用形态：
   * - 旧形态 `create(data)`（管理端导入脚本 / 既有测试）：直接落库，不做额外校验；
   * - 新形态 `create(data, { actor })`（内部 API / 草稿 confirm）：走 `QuestionSchema`
   *   校验 + 幂等键 + 审计日志。**校验只有这一份**，外部 API 路由也用它。
   *
   * 幂等键：调用方给了 `externalId` 就用它；否则是 `manual:<userId>:<内容指纹>`。
   * 命中既有行时返回 `created: false` 与既有行，不覆盖内容（建题不是同步最新版）。
   */
  async create(
    data: Partial<Question>,
    options?: QuestionCreateOptions,
  ): Promise<QuestionCreateResult> {
    const exec = options?.exec ?? drizzleDb;

    // ---- 新形态：统一校验 + 幂等 + 审计 ----
    if (options?.actor) {
      const parsed = options.validated
        ? { success: true as const, data: data as Required<typeof data> }
        : QuestionSchema.safeParse(data);
      if (!parsed.success) {
        throw new QuestionValidationError(formatIssues(parsed.error));
      }
      const valid = parsed.data;

      const externalId =
        options.externalId ?? buildManualExternalId(options.actor.id, valid);

      const [existing] = await exec
        .select()
        .from(drizzleSchema.questions)
        .where(eq(drizzleSchema.questions.external_id, externalId))
        .limit(1);
      if (existing) {
        return {
          id: existing.id,
          created: false,
          question: mapQuestion(existing as unknown as Record<string, unknown>),
          ...(existing as unknown as Record<string, unknown>),
        };
      }

      const inserted = await exec
        .insert(drizzleSchema.questions)
        .values({
          external_id: externalId,
          content: valid.content,
          options: JSON.stringify(valid.options),
          answer: valid.answer,
          explanation: valid.explanation,
          tags: JSON.stringify(valid.tags),
          dimension: valid.dimension as
            | "knowledge"
            | "understanding"
            | "application",
          type: valid.type,
          source: options.source ?? data.source ?? null,
          material: data.material ?? null,
          material_html: data.material_html ?? null,
          created_at: sql`CURRENT_TIMESTAMP`,
        })
        .onConflictDoNothing({ target: drizzleSchema.questions.external_id })
        .returning();

      // 并发窗口：预检没命中、插入时另一请求先提交 → 唯一索引吞掉插入
      const row =
        inserted[0] ??
        (
          await exec
            .select()
            .from(drizzleSchema.questions)
            .where(eq(drizzleSchema.questions.external_id, externalId))
            .limit(1)
        )[0];
      if (!row) {
        throw new QuestionValidationError(
          [`无法写入题目（幂等键 ${externalId} 冲突后读不到既有行）`],
          "建题冲突，请重试",
        );
      }

      if (options.audit !== false) {
        await writeQuestionAudit(exec, options.actor, "QUESTION_CREATE", row.id, {
          externalId,
          source: options.source ?? data.source ?? null,
          content: valid.content.slice(0, 120),
        });
      }

      // 事务内不建向量：索引走独立连接，要等提交后才能看到这一行
      if (options.indexVector !== false && !options.exec) {
        void indexQuestion(row.id).catch((error: unknown) => {
          logger.warn(
            { err: error, questionId: row.id },
            "[QuestionService] 新题向量索引失败，可用重索引脚本补齐",
          );
        });
      }

      return {
        id: row.id,
        created: inserted.length > 0,
        question: mapQuestion(row as unknown as Record<string, unknown>),
        ...(row as unknown as Record<string, unknown>),
      };
    }

    // ---- 旧形态：保持既有契约（管理端脚本直接落库） ----
    const result = await drizzleDb
      .insert(drizzleSchema.questions)
      .values({
        ...data,
        options: JSON.stringify(data.options),
        tags: JSON.stringify(data.tags),
      } as never)
      .returning();
    const row = result[0] as unknown as Record<string, unknown>;
    // 旧契约只返回数据库行本身（既有测试用 toEqual 比对整行）；created/question
    // 以不可枚举属性挂上，既保持运行时可用又不改变既有契约的形状
    Object.defineProperty(row, "created", {
      value: true,
      enumerable: false,
    });
    Object.defineProperty(row, "question", {
      value: null,
      enumerable: false,
    });
    return row as unknown as QuestionCreateResult;
  },

  /**
   * 更新题目。
   *
   * 旧形态 `update(id, data)` 只写库；新形态 `update(id, data, { actor })` 额外：
   *   1. 校验归属（`manual:`/`draft:` 前缀带 owner，其余为全局题）；
   *   2. 合并后整体过 `QuestionSchema`（部分更新也不能产出坏行）；
   *   3. 答案/选项/题型变化时与写入**同事务**回刷历史判分（`regradeQuestionLogs`）；
   *   4. 写 `admin_logs`；改题干/选项/答案时异步重建向量。
   */
  async update(
    id: number,
    data: Partial<Question>,
    options?: QuestionUpdateOptions,
  ): Promise<QuestionUpdateResult> {
    if (!options?.actor) {
      const legacyData: Record<string, unknown> = { ...data };
      if (data.options) legacyData.options = JSON.stringify(data.options);
      if (data.tags) legacyData.tags = JSON.stringify(data.tags);

      await drizzleDb
        .update(drizzleSchema.questions)
        .set(legacyData)
        .where(eq(drizzleSchema.questions.id, id));
      // 旧契约返回 true（既有测试与调用方按布尔断言）；新形态才返回结构化结果
      return true as unknown as QuestionUpdateResult;
    }

    const [existing] = await drizzleDb
      .select()
      .from(drizzleSchema.questions)
      .where(eq(drizzleSchema.questions.id, id))
      .limit(1);
    if (!existing) {
      throw new NotFoundError(`题目不存在：${id}`, {
        code: "question.not-found",
      });
    }
    await assertQuestionWritable(existing, options.actor.id);

    const currentOptions = safeParseJson<string[]>(existing.options, []);
    const currentTags = safeParseJson<string[]>(existing.tags, []);

    // 合并只用于校验：不能把未提交字段的默认值写回库
    const merged = {
      content: data.content ?? existing.content,
      options: data.options ?? currentOptions,
      answer: data.answer ?? existing.answer ?? "",
      explanation: data.explanation ?? existing.explanation ?? "",
      tags: data.tags ?? currentTags,
      dimension: data.dimension ?? existing.dimension ?? "knowledge",
      type:
        data.type ??
        (existing.type as "single" | "multi" | "truefalse" | "fill_blank") ??
        "single",
    };
    const parsed = QuestionSchema.safeParse(merged);
    if (!parsed.success) {
      throw new QuestionValidationError(
        formatIssues(parsed.error),
        "合并后校验失败",
      );
    }
    const valid = parsed.data;

    // 只有客户端提交了、且值确实不同的字段才算变更
    const nextValues: Record<string, unknown> = {};
    if (data.content !== undefined && data.content !== existing.content) {
      nextValues.content = valid.content;
    }
    if (
      data.options !== undefined &&
      JSON.stringify(data.options) !== JSON.stringify(currentOptions)
    ) {
      nextValues.options = JSON.stringify(valid.options);
    }
    if (data.answer !== undefined && data.answer !== existing.answer) {
      nextValues.answer = valid.answer;
    }
    if (
      data.explanation !== undefined &&
      data.explanation !== existing.explanation
    ) {
      nextValues.explanation = valid.explanation;
    }
    if (
      data.tags !== undefined &&
      JSON.stringify(data.tags) !== JSON.stringify(currentTags)
    ) {
      nextValues.tags = JSON.stringify(valid.tags);
    }
    if (data.dimension !== undefined && data.dimension !== existing.dimension) {
      nextValues.dimension = valid.dimension as
        | "knowledge"
        | "understanding"
        | "application";
    }
    if (data.type !== undefined && data.type !== existing.type) {
      nextValues.type = valid.type;
    }

    const changed = Object.keys(nextValues);
    if (changed.length === 0) {
      return { id, changed, regrade: null };
    }

    const needsRegrade =
      data.answer !== undefined ||
      data.options !== undefined ||
      data.type !== undefined;

    const regrade = await withTransaction(async (exec) => {
      await exec
        .update(drizzleSchema.questions)
        .set(nextValues)
        .where(eq(drizzleSchema.questions.id, id));
      if (needsRegrade) return regradeQuestionLogs(id, exec);
      return null;
    });

    if (options.audit !== false) {
      await writeQuestionAudit(drizzleDb, options.actor, "QUESTION_UPDATE", id, {
        changed,
        ...(regrade ? { regrade } : {}),
      });
    }

    if (touchesEmbeddingText(nextValues) && options.indexVector !== false) {
      // 内容已变：不 await；拿不到新向量时删旧向量，避免按旧题干召回
      void indexQuestion(id, { pruneOnSkip: true }).catch((error: unknown) => {
        logger.warn(
          { err: error, questionId: id },
          "[QuestionService] 题目向量重建失败，保存已生效",
        );
      });
    }

    return { id, changed, regrade };
  },

  /**
   * 删除题目 (管理后台)
   */
  async delete(id: number) {
    await drizzleDb
      .delete(drizzleSchema.questions)
      .where(eq(drizzleSchema.questions.id, id));
    return true;
  },

  /**
   * 批量导入 (管理后台)
   */
  async bulkCreate(questions: Record<string, unknown>[]) {
    return await drizzleDb.transaction(async (tx) => {
      const values = questions.map((q) => ({
        ...q,
        options: JSON.stringify(q.options),
        tags: JSON.stringify(q.tags),
        created_at: sql`CURRENT_TIMESTAMP`,
      }));

      // SQLite 批量插入限制 (通常为 999 变量，Drizzle 会自动分批)
      return await tx.insert(drizzleSchema.questions).values(values as never);
    });
  },
};
