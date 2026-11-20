import { drizzleDb } from "@/lib/db";
import { eq, and, desc, sql, gte, notInArray, count } from "drizzle-orm";
import {
  practice_logs,
  practice_sessions,
  questions,
  question_srs,
  mastered_questions,
} from "@/lib/db/drizzle-schema";
import dayjs from "dayjs";
import { safeParseJson } from "@/lib/utils/json";

export interface WrongQuestionItem {
  questionId: number;
  questionContent: string;
  tags: string[];
  wrongCount: number;
  lastWrongAt: string;
  correctAnswer: string;
  userLastAnswer: string;
  srs?: {
    stability: number;
    difficulty: number;
    due_date: string;
  };
}

/**
 * 获取按知识点分组的错题
 */
export interface WrongQuestionsByTag {
  tag: string;
  count: number;
  questions: WrongQuestionItem[];
}

/**
 * 错题详情类型
 */
export interface WrongQuestionDetail {
  questionId: number;
  questionContent: string;
  options: string[];
  correctAnswer: string | null;
  explanation: string;
  tags: string[];
  questionType: string;
  wrongCount: number;
  lastWrongAt: string;
  userLastAnswer: string;
  historyLogs: {
    timestamp: string | null;
    userAnswer: string | null;
    isCorrect: boolean;
  }[];
  srs?: {
    stability: number;
    difficulty: number;
    due_date: string;
  };
}

/**
 * 错题本页面（`routes/wrong-book.ts`）对外形态的列表项。
 *
 * 与 `WrongQuestionItem` 的区别是 `questionId` 为字符串：错题本前端拿它当
 * 不透明 ID 用（旧实现就这么发），改成数字会破坏既有调用方。
 */
export interface WrongBookListItem {
  questionId: string;
  questionContent: string;
  tags: string[];
  wrongCount: number;
  lastWrongAt: string;
  correctAnswer: string;
  userLastAnswer: string;
}

/** 错题详情页（`GET /api/wrong-book/:id`）的响应形态 */
export interface WrongBookDetail {
  questionId: string;
  questionContent: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  tags: string[];
  questionType: string;
  wrongCount: number;
  lastWrongAt: string;
  userLastAnswer: string;
  historyLogs: {
    timestamp: string;
    userAnswer: string;
    isCorrect: boolean;
  }[];
}

/**
 * 每道错题"最近一次错答"的相关子查询。
 *
 * 列表 / 抽题 / 详情三处的口径必须一致：按 timestamp 倒序取 is_correct = 0
 * 的最新一条。写成 MAX(user_answer) 会拿到字典序最大值（旧 service 的写法），
 * 与"最近一次错答"不是一回事。
 */
function lastWrongAnswerSql(userId: number) {
  // 内层表必须起别名：不加别名时 `${practice_logs.question_id}` 会渲染成
  // "practice_logs"."question_id"，SQLite 把它解析到内层表，条件退化成自身比较
  // （拿到的是该用户任意一题的最新错答，而不是本题的）。
  return sql<string>`(SELECT la.user_answer FROM practice_logs AS la
                             WHERE la.question_id = ${practice_logs.question_id}
                             AND la.user_id = ${userId} AND la.is_correct = 0
                             ORDER BY la.timestamp DESC LIMIT 1)`;
}

/**
 * 错题聚合的排序键。
 *
 * **不能**引用 select 里的 JS key（`desc(sql\`wrongCount\`)`）：drizzle 不会为
 * 聚合生成 `AS wrongCount`，SQLite 会报 `no such column: wrongCount`（列表恒 500）。
 * 排序列一律重写表达式，保证 ORDER BY 里是真实存在的东西。
 */
function wrongOrderBy() {
  return [desc(count()), desc(sql`MAX(${practice_logs.timestamp})`)] as const;
}

/** 聚合行（DB 原始形态）→ 页面形态 */
function toWrongBookItem(row: {
  questionId: number | null;
  questionContent: string | null;
  tags: string | null;
  correctAnswer: string | null;
  wrongCount: number;
  lastWrongAt: string | null;
  userLastAnswer: string | null;
}): WrongBookListItem {
  return {
    questionId: String(row.questionId),
    questionContent: String(row.questionContent),
    tags: JSON.parse(row.tags || "[]") as string[],
    wrongCount: Number(row.wrongCount),
    lastWrongAt: row.lastWrongAt || "",
    correctAnswer: String(row.correctAnswer),
    userLastAnswer: row.userLastAnswer || "",
  };
}

/**
 * 错题服务 - 管理错题本、掌握状态及智能推荐
 */
export const wrongQuestionService = {
  /**
   * 获取错题列表 (分页)
   */
  async getList(
    userId: number,
    options?: { limit?: number; offset?: number; tag?: string },
  ): Promise<{ questions: WrongQuestionItem[]; total: number }> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const tag = options?.tag?.trim();

    // 1. 获取已掌握题目 ID 列表
    const masteredIds = await drizzleDb
      .select({ id: mastered_questions.question_id })
      .from(mastered_questions)
      .where(eq(mastered_questions.user_id, userId));
    const excludeIds = masteredIds.map((m) => m.id);

    // 2. 聚合查询错题 (带分页)
    const baseWhere = and(
      eq(practice_logs.user_id, userId),
      eq(practice_logs.is_correct, false),
      excludeIds.length > 0
        ? notInArray(practice_logs.question_id, excludeIds)
        : undefined,
      tag
        ? sql`EXISTS (SELECT 1 FROM json_each(${questions.tags}) WHERE value = ${tag})`
        : undefined,
    );

    // 先获取总数（带 tag 筛选时同样需要 join questions）
    const countQuery = drizzleDb
      .select({ count: sql`COUNT(DISTINCT ${practice_logs.question_id})` })
      .from(practice_logs)
      .where(baseWhere);
    const countResult = (await (
      tag
        ? countQuery.innerJoin(
            questions,
            eq(practice_logs.question_id, questions.id),
          )
        : countQuery
    ).get()) as { count: number };
    const total = countResult?.count || 0;

    // 分页查询主数据
    const rows = await drizzleDb
      .select({
        questionId: practice_logs.question_id,
        questionContent: questions.content,
        tags: questions.tags,
        correctAnswer: questions.answer,
        wrongCount: sql<number>`COUNT(*)`,
        lastWrongAt: sql<string>`MAX(${practice_logs.timestamp})`,
        stability: question_srs.stability,
        difficulty: question_srs.difficulty,
        due_date: question_srs.due_date,
        userLastAnswer: sql<string>`MAX(${practice_logs.user_answer})`,
      })
      .from(practice_logs)
      .innerJoin(questions, eq(practice_logs.question_id, questions.id))
      .leftJoin(
        question_srs,
        and(
          eq(practice_logs.question_id, question_srs.question_id),
          eq(practice_logs.user_id, question_srs.user_id),
        ),
      )
      .where(baseWhere)
      .groupBy(practice_logs.question_id)
      .orderBy(desc(sql`COUNT(*)`), desc(sql`MAX(${practice_logs.timestamp})`))
      .limit(limit)
      .offset(offset);

    const questionsList: WrongQuestionItem[] = rows.map((r) => ({
      questionId: r.questionId!,
      questionContent: r.questionContent!,
      tags: safeParseJson<string[]>(r.tags as string | null | undefined, []),
      wrongCount: r.wrongCount,
      lastWrongAt: r.lastWrongAt,
      correctAnswer: r.correctAnswer!,
      userLastAnswer: r.userLastAnswer || "",
      srs: r.stability
        ? {
            stability: r.stability,
            difficulty: r.difficulty || 0,
            due_date: r.due_date || "",
          }
        : undefined,
    }));

    return { questions: questionsList, total };
  },

  /**
   * 获取错题统计
   */
  async getStats(userId: number) {
    const [total, recent, frequent] = await Promise.all([
      // 总数
      drizzleDb
        .select({ count: sql`COUNT(DISTINCT ${practice_logs.question_id})` })
        .from(practice_logs)
        .where(
          and(
            eq(practice_logs.user_id, userId),
            eq(practice_logs.is_correct, false),
          ),
        )
        .get() as Promise<{ count: number }>,

      // 最近 7 天
      drizzleDb
        .select({ count: sql`COUNT(DISTINCT ${practice_logs.question_id})` })
        .from(practice_logs)
        .where(
          and(
            eq(practice_logs.user_id, userId),
            eq(practice_logs.is_correct, false),
            gte(
              practice_logs.timestamp,
              dayjs().subtract(7, "day").format("YYYY-MM-DD HH:mm:ss"),
            ),
          ),
        )
        .get() as Promise<{ count: number }>,

      // 高频 (2次及以上)
      drizzleDb
        .all<{ count: number }>(
          sql`
                SELECT COUNT(*) as count FROM (
                    SELECT question_id FROM ${practice_logs}
                    WHERE user_id = ${userId} AND is_correct = 0
                    GROUP BY question_id
                    HAVING COUNT(*) >= 2
                )
            `,
        )
        .then((r) => r[0] as { count: number }),
    ]);

    return {
      total: total?.count || 0,
      recent: recent?.count || 0,
      frequent: frequent?.count || 0,
    };
  },

  /**
   * 错题分布统计（只读）：总数 + 按标签 + 按维度
   *
   * 口径与 getList 一致：排除已掌握题目，统计"有过错误记录"的题目去重数。
   */
  async getDistribution(userId: number): Promise<{
    total: number;
    byTag: { tag: string; count: number }[];
    byDimension: { dimension: string; count: number }[];
  }> {
    const masteredSubquery = sql`SELECT question_id FROM ${mastered_questions} WHERE user_id = ${userId}`;

    const [totalRows, tagRows, dimensionRows] = await Promise.all([
      drizzleDb.all<{ count: number }>(sql`
        SELECT COUNT(DISTINCT ${practice_logs.question_id}) AS count
        FROM ${practice_logs}
        WHERE ${practice_logs.user_id} = ${userId}
          AND ${practice_logs.is_correct} = 0
          AND ${practice_logs.question_id} NOT IN (${masteredSubquery})
      `),
      drizzleDb.all<{ tag: string; count: number }>(sql`
        SELECT je.value AS tag, COUNT(DISTINCT ${practice_logs.question_id}) AS count
        FROM ${practice_logs}
        INNER JOIN ${questions} ON ${questions.id} = ${practice_logs.question_id}
        INNER JOIN json_each(${questions.tags}) AS je
        WHERE ${practice_logs.user_id} = ${userId}
          AND ${practice_logs.is_correct} = 0
          AND ${practice_logs.question_id} NOT IN (${masteredSubquery})
        GROUP BY je.value
        ORDER BY count DESC, je.value ASC
      `),
      drizzleDb.all<{ dimension: string | null; count: number }>(sql`
        SELECT ${questions.dimension} AS dimension,
               COUNT(DISTINCT ${practice_logs.question_id}) AS count
        FROM ${practice_logs}
        INNER JOIN ${questions} ON ${questions.id} = ${practice_logs.question_id}
        WHERE ${practice_logs.user_id} = ${userId}
          AND ${practice_logs.is_correct} = 0
          AND ${practice_logs.question_id} NOT IN (${masteredSubquery})
        GROUP BY ${questions.dimension}
        ORDER BY count DESC
      `),
    ]);

    return {
      total: Number(totalRows[0]?.count) || 0,
      byTag: tagRows.map((row) => ({
        tag: String(row.tag),
        count: Number(row.count) || 0,
      })),
      byDimension: dimensionRows.map((row) => ({
        dimension: row.dimension || "unknown",
        count: Number(row.count) || 0,
      })),
    };
  },

  /**
   * 智能推荐错题 (基于权重算法)
   */
  async getRandomRecommended(
    userId: number,
    options: {
      count?: number;
      tag?: string;
      mode?: "priority" | "random";
    } = {},
  ) {
    const { count = 10, tag, mode = "priority" } = options;

    // 核心加权 SQL 逻辑迁移
    const priorityOrder = sql`(COUNT(*) * 5.0 + (JULIANDAY('now') - JULIANDAY(MAX(${practice_logs.timestamp}))) * 2.0) * (ABS(RANDOM() % 1000) / 1000.0) DESC`;
    const randomOrder = sql`RANDOM()`;

    let query = drizzleDb
      .select({
        questionId: practice_logs.question_id,
        questionContent: questions.content,
        tags: questions.tags,
        correctAnswer: questions.answer,
        wrongCount: sql<number>`COUNT(*)`,
        lastWrongAt: sql<string>`MAX(${practice_logs.timestamp})`,
      })
      .from(practice_logs)
      .innerJoin(questions, eq(practice_logs.question_id, questions.id))
      .where(
        and(
          eq(practice_logs.user_id, userId),
          eq(practice_logs.is_correct, false),
          // 排除已掌握
          sql`${practice_logs.question_id} NOT IN (SELECT question_id FROM ${mastered_questions} WHERE user_id = ${userId})`,
          tag
            ? sql`EXISTS (SELECT 1 FROM json_each(${questions.tags}) WHERE value = ${tag})`
            : undefined,
        ),
      )
      .groupBy(practice_logs.question_id)
      .orderBy(mode === "priority" ? priorityOrder : randomOrder)
      .limit(Math.min(count, 50));

    const rows = await query;
    return rows.map((r) => ({
      questionId: r.questionId!,
      questionContent: r.questionContent!,
      tags: safeParseJson<string[]>(r.tags as string | null | undefined, []),
      wrongCount: r.wrongCount,
      lastWrongAt: r.lastWrongAt || "",
      correctAnswer: r.correctAnswer!,
      userLastAnswer: "", // 推荐模式下暂不填充上次答案以换取性能
    }));
  },

  /**
   * 标记为已掌握
   */
  async markAsMastered(userId: number, questionId: number, note?: string) {
    await drizzleDb
      .insert(mastered_questions)
      .values({
        user_id: userId,
        question_id: questionId,
        note: note || null,
      })
      .onConflictDoUpdate({
        target: [mastered_questions.user_id, mastered_questions.question_id],
        // 只有显式传了 note 才覆盖：路由的「重新标记已掌握」不该清掉已有备注。
        // 迁移前路由自己的 upsert 只刷 mastered_at，备注是保留的。
        set: {
          mastered_at: sql`CURRENT_TIMESTAMP`,
          ...(note === undefined ? {} : { note: note || null }),
        },
      });
    return true;
  },

  /**
   * 取消掌握标记
   */
  async unmarkMastered(userId: number, questionId: number) {
    await drizzleDb
      .delete(mastered_questions)
      .where(
        and(
          eq(mastered_questions.user_id, userId),
          eq(mastered_questions.question_id, questionId),
        ),
      );
    return true;
  },

  /**
   * 获取错题详情 (含历史作答记录)
   */
  async getDetail(userId: number, questionId: number) {
    // 1. 获取题目与 SRS
    const [question] = await drizzleDb
      .select()
      .from(questions)
      .leftJoin(
        question_srs,
        and(
          eq(questions.id, question_srs.question_id),
          eq(question_srs.user_id, userId),
        ),
      )
      .where(eq(questions.id, questionId))
      .limit(1);

    if (!question) return null;

    // 2. 聚合错误统计
    const [stats] = await drizzleDb
      .select({
        wrongCount: sql<number>`COUNT(*)`,
        lastWrongAt: sql<string>`MAX(${practice_logs.timestamp})`,
      })
      .from(practice_logs)
      .where(
        and(
          eq(practice_logs.question_id, questionId),
          eq(practice_logs.user_id, userId),
          eq(practice_logs.is_correct, false),
        ),
      );

    // 3. 获取历史记录
    const history = await drizzleDb
      .select({
        timestamp: practice_logs.timestamp,
        userAnswer: practice_logs.user_answer,
        isCorrect: practice_logs.is_correct,
      })
      .from(practice_logs)
      .where(
        and(
          eq(practice_logs.question_id, questionId),
          eq(practice_logs.user_id, userId),
        ),
      )
      .orderBy(desc(practice_logs.timestamp))
      .limit(20);

    return {
      questionId: question.questions.id,
      questionContent: question.questions.content,
      options:
        typeof question.questions.options === "string"
          ? safeParseJson<string[]>(
              question.questions.options as string | null | undefined,
              [],
            )
          : question.questions.options || [],
      correctAnswer: question.questions.answer,
      explanation: question.questions.explanation || "",
      tags:
        typeof question.questions.tags === "string"
          ? safeParseJson<string[]>(
              question.questions.tags as string | null | undefined,
              [],
            )
          : question.questions.tags || [],
      questionType: question.questions.type || "single",
      wrongCount: stats?.wrongCount || 0,
      lastWrongAt: stats?.lastWrongAt || "",
      userLastAnswer: history.find((h) => !h.isCorrect)?.userAnswer || "",
      historyLogs: history.map((h) => ({
        timestamp: h.timestamp,
        userAnswer: h.userAnswer,
        isCorrect: Boolean(h.isCorrect),
      })),
      srs: question.question_srs?.stability
        ? {
            stability: question.question_srs.stability,
            difficulty: question.question_srs.difficulty || 0,
            due_date: question.question_srs.due_date || "",
          }
        : undefined,
    };
  },

  /**
   * 获取已掌握题目列表
   */
  async getMasteredQuestions(userId: number): Promise<WrongQuestionItem[]> {
    const rows = await drizzleDb
      .select({
        questionId: mastered_questions.question_id,
        questionContent: questions.content,
        tags: questions.tags,
        correctAnswer: questions.answer,
        masteredAt: mastered_questions.mastered_at,
      })
      .from(mastered_questions)
      .innerJoin(questions, eq(mastered_questions.question_id, questions.id))
      .where(eq(mastered_questions.user_id, userId))
      .orderBy(desc(mastered_questions.mastered_at));

    return rows.map((r) => ({
      questionId: r.questionId!,
      questionContent: r.questionContent!,
      tags: safeParseJson<string[]>(r.tags as string | null | undefined, []),
      wrongCount: 0, // 已掌握题目不需要错题计数
      lastWrongAt: r.masteredAt || "",
      correctAnswer: r.correctAnswer!,
      userLastAnswer: "",
    }));
  },

  /**
   * 错题本列表（`GET /api/wrong-book/`）。
   *
   * 与 `getList` 的差异不是口味问题，迁移时按行为等价保留原口径：
   * - 不分页、不截 50 条（页面一次取全部，前端自己分组/过滤）；
   * - `userLastAnswer` 取"最近一次**错**答"（相关子查询），`getList` 取
   *   `MAX(user_answer)`（字典序最大值，语义不同）；
   * - 不带 SRS 字段（列表页不渲染，多一次 leftJoin 只是白花钱）。
   */
  async listWrongBook(userId: number): Promise<WrongBookListItem[]> {
    const masteredSubquery = drizzleDb
      .select({ id: mastered_questions.question_id })
      .from(mastered_questions)
      .where(eq(mastered_questions.user_id, userId));

    const rows = await drizzleDb
      .select({
        questionId: practice_logs.question_id,
        questionContent: questions.content,
        tags: questions.tags,
        correctAnswer: questions.answer,
        wrongCount: count(),
        lastWrongAt: sql<string>`MAX(${practice_logs.timestamp})`,
        userLastAnswer: lastWrongAnswerSql(userId),
      })
      .from(practice_logs)
      .innerJoin(questions, eq(practice_logs.question_id, questions.id))
      .where(
        and(
          eq(practice_logs.user_id, userId),
          eq(practice_logs.is_correct, false),
          notInArray(practice_logs.question_id, masteredSubquery),
        ),
      )
      .groupBy(practice_logs.question_id)
      .orderBy(...wrongOrderBy())
      .all();

    return rows.map(toWrongBookItem);
  },

  /**
   * 错题统计（`GET /api/wrong-book/stats`）。
   *
   * 与 `getStats` 的差异（迁移时保留原口径，别互换）：
   * - "最近 7 天"用 `date(timestamp) >= date('now','-7 days')`（按自然日），
   *   不是"7×24 小时前"的时间戳比较；
   * - `frequent` = 错误次数 ≥ 2 的**去重题目数**（分组行数），不是总错误条数。
   */
  async getWrongBookStats(
    userId: number,
  ): Promise<{ total: number; recent: number; frequent: number }> {
    const totalStats = await drizzleDb
      .select({
        count: sql<number>`COUNT(DISTINCT ${practice_logs.question_id})`,
      })
      .from(practice_logs)
      .where(
        and(
          eq(practice_logs.user_id, userId),
          eq(practice_logs.is_correct, false),
        ),
      );

    const recentStats = await drizzleDb
      .select({
        count: sql<number>`COUNT(DISTINCT ${practice_logs.question_id})`,
      })
      .from(practice_logs)
      .where(
        and(
          eq(practice_logs.user_id, userId),
          eq(practice_logs.is_correct, false),
          sql`date(${practice_logs.timestamp}) >= date('now', '-7 days')`,
        ),
      );

    const frequentRows = await drizzleDb
      .select({ cnt: count() })
      .from(practice_logs)
      .where(
        and(
          eq(practice_logs.user_id, userId),
          eq(practice_logs.is_correct, false),
        ),
      )
      .groupBy(practice_logs.question_id)
      .having(sql`count(*) >= 2`)
      .all();

    return {
      total: Number(totalStats[0]?.count ?? 0),
      recent: Number(recentStats[0]?.count ?? 0),
      frequent: frequentRows.length,
    };
  },

  /**
   * 智能抽题（`GET /api/wrong-book/random`）。
   *
   * `mode=priority`：错误次数 × 5 + 距上次错的天数 × 2，再乘一个随机扰动；
   * `mode=random`：纯随机。两个 ORDER BY 都直接塞 SQL 表达式（不能引用 select key）。
   */
  async pickWrongQuestions(
    userId: number,
    options: { limit: number; tag?: string; mode?: "priority" | "random" },
  ): Promise<WrongBookListItem[]> {
    const { limit, tag, mode = "priority" } = options;

    const priorityOrder = sql`(
            COUNT(*) * 5.0 + 
            (JULIANDAY('now') - JULIANDAY(MAX(${practice_logs.timestamp}))) * 2.0
        ) * (ABS(RANDOM() % 1000) / 1000.0) DESC`;

    const randomOrder = sql`RANDOM()`;

    const masteredSubquery = drizzleDb
      .select({ id: mastered_questions.question_id })
      .from(mastered_questions)
      .where(eq(mastered_questions.user_id, userId));

    const rows = await drizzleDb
      .select({
        questionId: practice_logs.question_id,
        questionContent: questions.content,
        tags: questions.tags,
        correctAnswer: questions.answer,
        wrongCount: count(),
        lastWrongAt: sql<string>`MAX(${practice_logs.timestamp})`,
        userLastAnswer: lastWrongAnswerSql(userId),
      })
      .from(practice_logs)
      .innerJoin(questions, eq(practice_logs.question_id, questions.id))
      .where(
        and(
          eq(practice_logs.user_id, userId),
          eq(practice_logs.is_correct, false),
          notInArray(practice_logs.question_id, masteredSubquery),
          tag
            ? sql`EXISTS (SELECT 1 FROM json_each(${questions.tags}) WHERE value = ${tag})`
            : sql`1=1`,
        ),
      )
      .groupBy(practice_logs.question_id)
      .orderBy(mode === "priority" ? priorityOrder : randomOrder)
      .limit(limit)
      .all();

    return rows.map(toWrongBookItem);
  },

  /**
   * 错题详情（`GET /api/wrong-book/:id`）。
   *
   * 只取详情页真正渲染的列：整行查询会把 `material_html`（材料原文，单题最大
   * 字段）与 `ai_mnemonic` 一起搬进内存，而响应里根本不含它们。
   * 与 `getDetail` 的差异：不返回 SRS（详情页不渲染），`userLastAnswer` 用单独
   * 一条"最近错答"查询（`getDetail` 从历史列表里 find）。
   */
  async getWrongBookDetail(
    userId: number,
    questionId: number,
  ): Promise<WrongBookDetail | null> {
    const [question] = await drizzleDb
      .select({
        id: questions.id,
        content: questions.content,
        options: questions.options,
        answer: questions.answer,
        explanation: questions.explanation,
        tags: questions.tags,
        type: questions.type,
      })
      .from(questions)
      .where(eq(questions.id, questionId))
      .limit(1)
      .all();

    if (!question) return null;

    const stats = await drizzleDb
      .select({
        wrongCount: count(),
        lastWrongAt: sql<string>`MAX(${practice_logs.timestamp})`,
      })
      .from(practice_logs)
      .where(
        and(
          eq(practice_logs.question_id, questionId),
          eq(practice_logs.user_id, userId),
          eq(practice_logs.is_correct, false),
        ),
      );

    const historyLogs = await drizzleDb
      .select({
        timestamp: practice_logs.timestamp,
        userAnswer: practice_logs.user_answer,
        isCorrect: practice_logs.is_correct,
      })
      .from(practice_logs)
      .where(
        and(
          eq(practice_logs.question_id, questionId),
          eq(practice_logs.user_id, userId),
        ),
      )
      .orderBy(desc(practice_logs.timestamp))
      .limit(20)
      .all();

    const lastWrongRow = await drizzleDb
      .select({ user_answer: practice_logs.user_answer })
      .from(practice_logs)
      .where(
        and(
          eq(practice_logs.question_id, questionId),
          eq(practice_logs.user_id, userId),
          eq(practice_logs.is_correct, false),
        ),
      )
      .orderBy(desc(practice_logs.timestamp))
      .limit(1)
      .all();

    return {
      questionId: String(question.id),
      questionContent: String(question.content),
      options: JSON.parse(question.options || "[]") as string[],
      correctAnswer: String(question.answer),
      explanation: question.explanation || "",
      tags: JSON.parse(question.tags || "[]") as string[],
      questionType: question.type || "single",
      wrongCount: Number(stats[0]?.wrongCount ?? 0),
      lastWrongAt: stats[0]?.lastWrongAt || "",
      userLastAnswer: lastWrongRow[0]?.user_answer || "",
      historyLogs: historyLogs.map((row) => ({
        timestamp: row.timestamp || "",
        userAnswer: row.userAnswer || "",
        isCorrect: Boolean(row.isCorrect),
      })),
    };
  },

  /**
   * 建错题练习会话（`POST /api/wrong-book/practice`）。
   *
   * 没复用 `practiceService.createReviewSession`，因为对外可见的三处不同：
   * 会话 id 形态（`wrong-<时间戳>`）、`practice_mode`（`review`）、
   * `questions_json` 存的是**字符串 id 列表**。改这些等于改客户端契约。
   */
  async createWrongBookPracticeSession(
    userId: number,
    questionIds: string[],
  ): Promise<string> {
    const sessionId = `wrong-${Date.now()}`;

    await drizzleDb.insert(practice_sessions).values({
      id: sessionId,
      user_id: userId,
      total_questions: questionIds.length,
      practice_mode: "review",
      questions_json: JSON.stringify(questionIds),
    });

    return sessionId;
  },
};
