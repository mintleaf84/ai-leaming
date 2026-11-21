import { drizzleDb } from "@/lib/db";
import {
  practice_sessions,
  practice_logs,
  questions,
  question_srs,
  session_reviews,
  mastered_questions,
  first_principles_cache,
} from "@/lib/db/drizzle-schema";
import { eq, and, desc, gt, sql, inArray, notInArray } from "drizzle-orm";
import { Question, Dimension } from "@/types";
import { PracticeMode, PracticeConfig } from "@/types/practice";
import { QuestionRowSchema } from "@/lib/schemas";
import logger from "@/lib/logger";
import { DemoService } from "@/lib/practice/demo";
import { safeParseJson } from "@/lib/utils/json";
import { checkAnswerCorrectness } from "@/lib/services/answer-check";
import { generateId, generateSessionId } from "@/lib/utils/id";
import { NotFoundError } from "@/lib/errors/app-error";
import { withTransaction } from "@/lib/db/executor";

/**
 * 练习会话不存在**或不属于当前用户**。
 *
 * 刻意不区分这两种情况：对外一律 404，避免通过状态码差异探测"这个 sessionId 存在"。
 */
export class PracticeSessionNotFoundError extends NotFoundError {
  constructor(sessionId: string) {
    super(`练习会话不存在：${sessionId}`, {
      code: "practice.session.not-found",
      publicMessage: "练习会话不存在",
    });
    this.name = "PracticeSessionNotFoundError";
  }
}

export interface PracticeSessionConfig {
  mode: PracticeMode;
  limit: number;
  types?: string[];
  tags?: string[];
  dimensions?: string[];
  enableReview?: boolean;
  enableTimer?: boolean;
}

/**
 * 将数据库原始行映射为业务 Question 类型
 *
 * 导出给试卷服务复用：题目行 → Question 的修复/校验规则必须只有一份，
 * 否则试卷详情与练习会话会出现"同一道题两个形状"。
 */
export function mapQuestion(q: unknown): Question {
  const data = q as Record<string, unknown>;
  try {
    return QuestionRowSchema.parse(data);
  } catch (err) {
    logger.error(
      { err, questionId: data.id },
      "Question mapping failed in practiceService",
    );
    return {
      ...data,
      options: safeParseJson(data.options as string, [] as string[]),
      tags: safeParseJson(data.tags as string, [] as string[]),
      type: data.type || "single",
      dimension: data.dimension || "knowledge",
    } as Question;
  }
}

/**
 * 已掌握题目子查询（tag / wrong 模式统一排除）。
 * 与错题本列表（`routes/wrong-book.ts`）同一口径：掌握了就不再推。
 */
function masteredQuestionIdsSubquery(userId: number) {
  return drizzleDb
    .select({ id: mastered_questions.question_id })
    .from(mastered_questions)
    .where(eq(mastered_questions.user_id, userId));
}

/**
 * 把一组题目固化成练习会话行（random / tag / wrong 共用）。
 *
 * 题目集为空时**不建会话行**：返回空 `sessionId`，让路由层回
 * `{ sessionId: "", questions: [] }`（空结果不是错误，不能炸成 500）。
 */
async function persistPracticeSession(
  userId: number,
  practiceMode: string,
  questionData: Question[],
): Promise<{ questions: Question[]; sessionId: string }> {
  if (questionData.length === 0) {
    return { questions: [], sessionId: "" };
  }

  const sessionId = generateSessionId();

  await drizzleDb.insert(practice_sessions).values({
    id: sessionId,
    user_id: userId,
    total_questions: questionData.length,
    questions_json: JSON.stringify(questionData),
    practice_mode: practiceMode,
    is_demo: 0,
  });

  return { questions: questionData, sessionId };
}

/**
 * 第一性原理分析缓存表的兜底建表。
 *
 * 表与索引**已经由迁移创建**（`drizzle/0001_old_bishop.sql`：
 * `first_principles_cache` + `idx_fp_cache_hash`），原先每来一次请求就在路由里
 * 跑一遍 `CREATE TABLE IF NOT EXISTS`，既有 DDL 在请求路径上的问题，也多一次
 * 无谓的写事务。这里把兜底 memo 成"每进程最多一次"：即便某套环境跳过了迁移
 * （例如只 `drizzle-kit push` 了部分表），第一次请求仍能自愈，语义不变。
 */
let fpCacheTableReady: Promise<void> | null = null;

async function ensureFirstPrinciplesCacheTable(): Promise<void> {
  if (!fpCacheTableReady) {
    fpCacheTableReady = (async () => {
      await drizzleDb.run(sql`
        CREATE TABLE IF NOT EXISTS first_principles_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question_hash TEXT UNIQUE NOT NULL,
            analysis TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await drizzleDb.run(
        sql`CREATE INDEX IF NOT EXISTS idx_fp_cache_hash ON first_principles_cache(question_hash);`,
      );
    })().catch((e) => {
      // 建表失败不阻塞本次分析：下方按"无缓存"路径继续
      logger.error({ err: e }, "[FirstPrinciples] 创建缓存表失败");
      fpCacheTableReady = null;
    });
  }
  return fpCacheTableReady;
}

export const practiceService = {
  /**
   * 获取或创建练习会话 (核心入口)
   * 整合了演示模式检测、会话恢复与新会话创建逻辑
   */
  async getOrCreateSession(
    userId: number,
    forceNew: boolean = false,
  ): Promise<{
    questions: Question[];
    sessionId: string;
    resumed?: boolean;
    completedCount?: number;
  }> {
    // 1. 演示模式拦截
    if (await DemoService.isDemoModeEnabled()) {
      const demoResult = await DemoService.getDemoSession(userId);
      if (demoResult)
        return { ...demoResult, resumed: false, completedCount: 0 };
    }

    // 2. 尝试恢复最近 24 小时内未完成的会话
    if (!forceNew) {
      const [lastSession] = await drizzleDb
        .select()
        .from(practice_sessions)
        .where(
          and(
            eq(practice_sessions.user_id, userId),
            eq(practice_sessions.is_demo, 0),
            gt(practice_sessions.created_at, sql`datetime('now', '-1 day')`),
          ),
        )
        .orderBy(desc(practice_sessions.created_at))
        .limit(1);

      if (lastSession && lastSession.questions_json) {
        // 查询已完成的题目数
        const [logResult] = await drizzleDb
          .select({ count: sql<number>`count(*)` })
          .from(practice_logs)
          .where(eq(practice_logs.session_id, lastSession.id));

        const totalQuestions = lastSession.total_questions || 0;
        const completedCount = Number(logResult?.count) || 0;

        if (completedCount < totalQuestions) {
          try {
            const questionsData = JSON.parse(
              lastSession.questions_json,
            ) as Question[];
            const mappedQuestions = questionsData.map((q) => mapQuestion(q));
            return {
              questions: await this.attachSrsData(userId, mappedQuestions),
              sessionId: lastSession.id,
              resumed: true,
              completedCount,
            };
          } catch (e) {
            // audit-allow: 会话快照 JSON 损坏时放弃恢复，回落下方"新建随机会话"路径；失败已记录
            logger.error(
              { err: e, sessionId: lastSession.id },
              "Failed to parse session questions_json",
            );
          }
        }
      }
    }

    // 3. 创建新随机会话
    const result = await this.createRandomSession(userId);

    // 4. 挂载 SRS 数据
    result.questions = await this.attachSrsData(userId, result.questions);
    return result;
  },

  /**
   * 为题目列表挂载 SRS 记忆状态
   */
  async attachSrsData(
    userId: number,
    questionList: Question[],
  ): Promise<Question[]> {
    if (questionList.length === 0) return [];

    const qIds = questionList.map((q) => q.id);
    const srsRows = await drizzleDb
      .select()
      .from(question_srs)
      .where(
        and(
          eq(question_srs.user_id, userId),
          inArray(question_srs.question_id, qIds),
        ),
      );

    const srsMap = new Map(srsRows.map((row) => [row.question_id, row]));

    return questionList.map((q) => {
      const srs = srsMap.get(q.id);
      if (srs) {
        return {
          ...q,
          srs: {
            stability: srs.stability,
            difficulty: srs.difficulty,
            due_date: srs.due_date,
            state: srs.state,
            last_review: srs.last_review || undefined,
          },
        };
      }
      return q;
    });
  },

  /**
   * 创建随机练习会话
   */
  async createRandomSession(
    userId: number,
    limit: number = 10,
  ): Promise<{
    questions: Question[];
    sessionId: string;
  }> {
    const rawQuestions = await drizzleDb
      .select()
      .from(questions)
      .orderBy(sql`RANDOM()`)
      .limit(limit);

    return persistPracticeSession(
      userId,
      "random",
      rawQuestions.map(mapQuestion),
    );
  },

  /**
   * 按知识点创建练习会话（§32 `mode=tag`）。
   *
   * tags 是 JSON 文本列，用 `json_each` 逐元素精确比对：`tags LIKE '%"X"%'`
   * 会被「同前缀的更长 tag」和转义差异坑到，仓库里其余知识点筛选
   * （`question.ts` / `wrong-book.ts` / `practice-scheduling.ts`）一律用 json_each。
   * 已掌握题目排除，口径与错题本列表一致。
   */
  async createTagSession(
    userId: number,
    tag: string,
    limit: number = 10,
  ): Promise<{
    questions: Question[];
    sessionId: string;
  }> {
    const normalizedTag = tag.trim();
    // 空 tag 不落到 SQL（`value = ''` 只会白跑一次全表扫）
    if (normalizedTag === "") return { questions: [], sessionId: "" };

    const rawQuestions = await drizzleDb
      .select()
      .from(questions)
      .where(
        and(
          sql`EXISTS (SELECT 1 FROM json_each(${questions.tags}) WHERE value = ${normalizedTag})`,
          notInArray(questions.id, masteredQuestionIdsSubquery(userId)),
        ),
      )
      .orderBy(sql`RANDOM()`)
      .limit(limit);

    return persistPracticeSession(userId, "tag", rawQuestions.map(mapQuestion));
  },

  /**
   * 创建「做错过的题」练习会话（§32 `mode=wrong`）。
   *
   * 取 `practice_logs.is_correct = 0` 的 distinct question_id，排除已掌握；
   * 用子查询而不是把 id 列表拉回内存再 `inArray`：错题可能上千条，会撞
   * SQLite 的变量上限（999）。
   */
  async createWrongSession(
    userId: number,
    limit: number = 10,
  ): Promise<{
    questions: Question[];
    sessionId: string;
  }> {
    const wrongQuestionIds = drizzleDb
      .selectDistinct({ id: practice_logs.question_id })
      .from(practice_logs)
      .where(
        and(
          eq(practice_logs.user_id, userId),
          eq(practice_logs.is_correct, false),
        ),
      );

    const rawQuestions = await drizzleDb
      .select()
      .from(questions)
      .where(
        and(
          inArray(questions.id, wrongQuestionIds),
          notInArray(questions.id, masteredQuestionIdsSubquery(userId)),
        ),
      )
      .orderBy(sql`RANDOM()`)
      .limit(limit);

    return persistPracticeSession(
      userId,
      "wrong",
      rawQuestions.map(mapQuestion),
    );
  },

  /**
   * 提交答题结果
   */
  async submitAnswer(
    userId: number,
    sessionId: string | null,
    questionId: number,
    userAnswer: string,
    isCorrect: boolean,
    duration: number,
    totalDurationMs?: number,
    origin: "web" | "agent" | "import" = "web",
    // true = 在写日志的同一事务内重新读题判分（用于 submitAnswerWithValidation）
    revalidateAnswer = false,
  ) {
    // 空答案=未作答（skipped）：保留日志用于还原作答过程，但不算对错、不进 SRS、
    // 不计入掌握度（P0-3：历史上 348 条空答案被当成「做错」喂进了 FSRS）
    const skipped = userAnswer.trim() === "";

    // `duration` 的单位是**毫秒**（原样写进 practice_logs.duration_ms / FSRS 排期）。
    // D1：移动端历史上按秒上报（`inSeconds`），库里因此混入 2~60 的错值。
    // 这里只告警、不改写数据（改写会抹掉真实作答时长，历史值是否修由单独的数据
    // 修整决定），目的是让「还在按秒发」的调用方在日志里现形。
    if (duration > 0 && duration < 1000) {
      logger.warn(
        { userId, sessionId, questionId, duration },
        "[Practice] 作答时长疑似按秒上报（协议单位是毫秒，<1000ms 视为可疑）",
      );
    }

    // 1+2. 归属校验、答题日志写入、会话统计更新必须在**同一个事务**里。
    //
    // 只在写库前单独 SELECT 一次归属，会留下 TOCTOU 窗口：校验通过后会话被删除
    // 或转给别的用户，日志照样会写进一个不再属于当前用户的 session。放进事务后，
    // 校验与写入看到的是同一个快照（SQLite 写事务串行化），窗口消失。
    // 顺带把"日志"与"统计"绑成原子：任何一步失败都不会留下有日志无统计的脏数据。
    let gradedIsCorrect = isCorrect;

    await withTransaction(async (exec) => {
      if (sessionId) {
        const [owned] = await exec
          .select({ id: practice_sessions.id })
          .from(practice_sessions)
          .where(
            and(
              eq(practice_sessions.id, sessionId),
              eq(practice_sessions.user_id, userId),
            ),
          )
          .limit(1);

        // 不存在与不属于当前用户返回同一个 404，不泄露"这个会话存在"
        if (!owned) throw new PracticeSessionNotFoundError(sessionId);
      }

      // 判分与写入同一快照：事务外读到的答案可能已被改题回刷更新，
      // 迟到的日志会按旧答案落库且回刷扫描不到（评审指出的竞争窗口）。
      if (revalidateAnswer) {
        const [current] = await exec
          .select({
            answer: questions.answer,
            options: questions.options,
            type: questions.type,
          })
          .from(questions)
          .where(eq(questions.id, questionId))
          .limit(1);
        if (current) {
          const currentOptions: string[] =
            typeof current.options === "string"
              ? safeParseJson<string[]>(current.options, [])
              : current.options || [];
          gradedIsCorrect = checkAnswerCorrectness(
            userAnswer,
            current.answer ?? "",
            currentOptions,
            current.type ?? undefined,
          );
        }
      }

      await exec.insert(practice_logs).values({
        session_id: sessionId,
        user_id: userId,
        question_id: questionId,
        user_answer: userAnswer,
        is_correct: gradedIsCorrect,
        duration_ms: duration,
        origin,
        status: skipped ? "skipped" : "answered",
      });

      if (sessionId) {
        await exec
          .update(practice_sessions)
          .set({
            correct_count: sql`${practice_sessions.correct_count} + ${gradedIsCorrect && !skipped ? 1 : 0}`,
            total_duration_ms: totalDurationMs ?? undefined,
          })
          .where(
            and(
              eq(practice_sessions.id, sessionId),
              eq(practice_sessions.user_id, userId),
            ),
          );
      }
    });

    // 3. 异步更新掌握度
    const [q] = await drizzleDb
      .select({
        tags: questions.tags,
        dimension: questions.dimension,
        type: questions.type,
        // 隔离过滤（docs/agent-question-set-plan.md §2）：只有正常题库题（origin='import'）
        // 才计入掌握度聚合。Agent 题集题与已报错的题作答后只留 practice_logs
        // （错题本/历史照常可见），不污染掌握度曲线；转正（origin 改 import）后才开始计入。
        origin: questions.origin,
      })
      .from(questions)
      .where(eq(questions.id, questionId))
      .limit(1);

    const countsTowardMastery = q?.origin === "import";

    if (q && q.tags && !skipped && countsTowardMastery) {
      const tags = safeParseJson<string[]>(q.tags, []);

      const { masteryService } = await import("@/lib/services/mastery");
      await Promise.all(
        tags.map(async (tag: string) => {
          await masteryService.updateMastery(
            userId,
            tag,
            q.dimension as Dimension,
            gradedIsCorrect,
          );
        }),
      );
    }

    // 4. 更新 FSRS 状态（错题强化逻辑）
    // 跳过的不排期；agent 来源的对错由调用方判定、服务端不复核，同样不排期
    // （P0-2/P0-3；agent 记录只作历史统计，见 docs/audit 报告）
    // 隔离过滤：非正常题库题（Agent 题集题 / 已报错题）也不排期 —— 它们不在题库
    // 与复习队列里出现，排期只会让 FSRS 队列指向看不见的题。
    let updatedSrs = undefined;
    if (!skipped && origin !== "agent" && countsTowardMastery) {
      try {
        const { srsService } = await import("@/lib/services/srs");
        // 填空题传入用户答案长度，用于计算打字时间
        const userAnswerLength =
          q?.type === "fill_blank" ? userAnswer.length : undefined;
        updatedSrs = await srsService.updateQuestionSrs(
          userId,
          questionId,
          gradedIsCorrect,
          duration,
          undefined,
          undefined,
          userAnswerLength,
        );
      } catch (e) {
        logger.error({ err: e }, "Failed to update SRS state in submitAnswer");
        // 显式降级：SRS 更新失败不影响答题结果落库，返回无 SRS 数据的成功结果
        return { success: true, srs: undefined };
      }
    }

    return {
      success: true,
      srs: updatedSrs
        ? {
            stability: updatedSrs.stability,
            difficulty: updatedSrs.difficulty,
            due_date: updatedSrs.due.toISOString(),
            state: updatedSrs.state,
            nextInterval: updatedSrs.scheduled_days,
          }
        : undefined,
    };
  },

  /**
   * 提交答题结果并验证 (Server-side validation)
   */
  async submitAnswerWithValidation(
    userId: number,
    sessionId: string | null,
    questionId: number,
    userAnswer: string,
    duration: number,
  ) {
    const [question] = await drizzleDb
      .select({
        answer: questions.answer,
        options: questions.options,
        type: questions.type,
      })
      .from(questions)
      .where(eq(questions.id, questionId))
      .limit(1);

    if (!question) {
      throw new Error(`Question ${questionId} not found`);
    }

    // 解析 options（可能是 JSON 字符串）
    const options: string[] =
      typeof question.options === "string"
        ? safeParseJson<string[]>(question.options, [])
        : question.options || [];

    // 使用增强比对逻辑
    const correctAnswer = question.answer || "";
    const isCorrect = checkAnswerCorrectness(
      userAnswer,
      correctAnswer,
      options,
      question.type ?? undefined,
    );
    await this.submitAnswer(
      userId,
      sessionId,
      questionId,
      userAnswer,
      isCorrect,
      duration,
      undefined,
      "web",
      true,
    );

    return { isCorrect, correctAnswer };
  },

  /**
   * 获取可用标签
   */
  async getAvailableTags(): Promise<string[]> {
    const { getAllTags } = await import("@/lib/practice/practice-scheduling");
    return await getAllTags();
  },

  /**
   * 以后台 ID 获取完整会话内容
   */
  async getSessionById(userId: number, sessionId: string) {
    const [session] = await drizzleDb
      .select()
      .from(practice_sessions)
      .where(
        and(
          eq(practice_sessions.id, sessionId),
          eq(practice_sessions.user_id, userId),
        ),
      )
      .limit(1);

    if (!session || !session.questions_json) return null;

    // 先查询已完成数量（两个分支都需要）
    const [logResult] = await drizzleDb
      .select({ count: sql<number>`count(*)` })
      .from(practice_logs)
      .where(eq(practice_logs.session_id, sessionId));
    const completedCount = Number(logResult?.count) || 0;

    let questionData: unknown[] = safeParseJson<unknown[]>(
      session.questions_json,
      [],
    );

    // 如果存储的是 ID 列表，则查询完整题目 (向下兼容旧逻辑)
    if (
      questionData.length > 0 &&
      (typeof questionData[0] === "string" ||
        typeof questionData[0] === "number")
    ) {
      const idList = questionData
        .map((id: unknown) => Number(id))
        .filter((id) => !isNaN(id));
      const rawQuestions = await drizzleDb
        .select()
        .from(questions)
        .where(inArray(questions.id, idList));
      const mappedQuestions: Question[] = rawQuestions.map((q) =>
        mapQuestion(q),
      );
      return {
        questions: await this.attachSrsData(userId, mappedQuestions),
        sessionId: session.id,
        completedCount,
        practiceMode: session.practice_mode || undefined,
      };
    }

    // 如果存储的是完整对象，确保进行 mapQuestion 校验/修复
    const mappedQuestions: Question[] = questionData.map((q: unknown) =>
      mapQuestion(q),
    );

    return {
      questions: await this.attachSrsData(userId, mappedQuestions),
      sessionId: session.id,
      completedCount,
      practiceMode: session.practice_mode || undefined,
    };
  },

  /**
   * 保存会话回顾信息
   */
  async saveSessionReview(
    userId: number,
    sessionId: string,
    questionId: number,
    reviewData: Record<string, unknown>,
  ) {
    await drizzleDb.insert(session_reviews).values({
      session_id: sessionId,
      question_id: questionId,
      review_data: JSON.stringify(reviewData),
    });

    await drizzleDb
      .update(practice_sessions)
      .set({
        review_count: sql`${practice_sessions.review_count} + 1`,
      })
      .where(
        and(
          eq(practice_sessions.id, sessionId),
          eq(practice_sessions.user_id, userId),
        ),
      );
    return { success: true };
  },

  /**
   * 根据自定义配置创建练习会话
   */
  async createSessionFromConfig(
    userId: number,
    config: PracticeSessionConfig,
  ): Promise<{
    questions: Question[];
    sessionId: string;
    config: PracticeSessionConfig;
  }> {
    // 1. 模式映射 (兼容旧名称)
    let mode = config.mode;
    if ((mode as string) === "wrong") mode = "mistakes";
    if ((mode as string) === "tag") mode = "focus";

    // 2. 准备配置对象并调用调度算法
    const practiceConfig: PracticeConfig = {
      ...config,
      mode,
      types: config.types as PracticeConfig["types"],
      dimensions: config.dimensions as PracticeConfig["dimensions"],
    };

    const { practiceSchedulingService } =
      await import("@/lib/practice/practice-scheduling");
    const rawQuestions =
      await practiceSchedulingService.generateSessionByConfig(
        practiceConfig,
        userId,
      );

    if (!rawQuestions || rawQuestions.length === 0) {
      return { questions: [], sessionId: "", config };
    }

    // 2. 生成会话 ID
    const sessionId = generateSessionId();

    // 3. 映射并校验题目数据
    const questionData = rawQuestions.map((q) => mapQuestion(q));

    // 4. 持久化会话
    await drizzleDb.insert(practice_sessions).values({
      id: sessionId,
      user_id: userId,
      total_questions: questionData.length,
      questions_json: JSON.stringify(questionData),
      practice_mode: mode,
      is_demo: 0,
    });

    // 5. 挂载 SRS 数据并返回
    const questionsWithSrs = await this.attachSrsData(userId, questionData);

    return { questions: questionsWithSrs, sessionId, config };
  },

  /**
   * 创建专项复习会话 (基于给定的题目 ID 列表)
   */
  async createReviewSession(userId: number, questionIds: number[]) {
    const sessionId = `review-${generateId("", 10)}`;

    await drizzleDb.insert(practice_sessions).values({
      id: sessionId,
      user_id: userId,
      total_questions: questionIds.length,
      questions_json: JSON.stringify(questionIds), // 存储 ID 列表，getSessionById 会自动解析
      practice_mode: "review",
      is_demo: 0,
    });

    return sessionId;
  },

  /**
   * 第一性原理分析缓存键。
   *
   * 口径必须稳定：内容 trim + 截断 100 字符 + **原始长度**（截断后长度会撞车），
   * 再拼上正确答案与用户错答。改口径等于让所有历史缓存失效，别顺手"优化"。
   */
  buildFirstPrinciplesCacheKey(
    questionContent: string,
    correctAnswer: string,
    wrongAnswer?: string,
  ): string {
    const content = questionContent + correctAnswer + (wrongAnswer || "");
    const normalized = content.trim().slice(0, 100) + content.length;
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  },

  /** 命中返回缓存的解析文本，未命中返回 null */
  async getCachedFirstPrinciplesAnalysis(
    cacheKey: string,
  ): Promise<string | null> {
    await ensureFirstPrinciplesCacheTable();

    const [cached] = await drizzleDb
      .select({ analysis: first_principles_cache.analysis })
      .from(first_principles_cache)
      .where(eq(first_principles_cache.question_hash, cacheKey))
      .limit(1);

    return cached?.analysis ?? null;
  },

  /** 写入/覆盖缓存（question_hash 唯一，冲突即更新） */
  async saveFirstPrinciplesAnalysis(
    cacheKey: string,
    analysis: string,
  ): Promise<void> {
    await drizzleDb
      .insert(first_principles_cache)
      .values({
        question_hash: cacheKey,
        analysis,
      })
      .onConflictDoUpdate({
        target: first_principles_cache.question_hash,
        set: { analysis },
      });
  },
};
