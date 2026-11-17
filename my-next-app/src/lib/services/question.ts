import { drizzleDb, drizzleSchema } from "@/lib/db";
import { isVectorAvailable, searchQuestionVectors } from "@/lib/db/vec-store";
import { eq, like, and, sql, desc, inArray } from "drizzle-orm";
import { ragService } from "@/lib/ai/rag";
import { Question, Dimension } from "@/types";
import { QuestionRowSchema } from "@/lib/schemas";
import logger from "@/lib/logger";

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
      options:
        typeof q.options === "string" ? JSON.parse(q.options) : q.options || [],
      tags: typeof q.tags === "string" ? JSON.parse(q.tags) : q.tags || [],
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
   * 创建题目 (管理后台)
   */
  async create(data: Partial<Question>) {
    const result = await drizzleDb
      .insert(drizzleSchema.questions)
      .values({
        ...data,
        options: JSON.stringify(data.options),
        tags: JSON.stringify(data.tags),
      } as never)
      .returning();
    return result[0];
  },

  /**
   * 更新题目 (管理后台)
   */
  async update(id: number, data: Partial<Question>) {
    const updateData: Record<string, unknown> = { ...data };
    if (data.options) updateData.options = JSON.stringify(data.options);
    if (data.tags) updateData.tags = JSON.stringify(data.tags);

    await drizzleDb
      .update(drizzleSchema.questions)
      .set(updateData)
      .where(eq(drizzleSchema.questions.id, id));
    return true;
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
