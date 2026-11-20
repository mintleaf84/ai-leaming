/**
 * `/api/external` —— SRS：复习负载概览 / 错题复习提交 / 回忆卡归档
 *
 * 拆分自 `routes/external.ts`；路径、方法、schema、中间件与错误文案均未改动。
 */
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { drizzleDb, drizzleSchema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { archiveCard, unarchiveCard } from "@/lib/services/recall";
import { srsService, summarizeFutureReviews } from "@/lib/services/srs";
import { toErrorResponse } from "@/lib/api/error-response";
import { withTransaction } from "@/lib/db/executor";
import { withKeyedLock } from "@/lib/services/keyed-lock";
import {
  RateLimitedResponse,
  parsePositiveInt,
  requireIdentity,
  requireScopeMiddleware,
} from "./shared";

const app = new OpenAPIHono();

const srsSummaryRoute = createRoute({
  method: "get",
  path: "/srs/summary",
  summary: "SRS 复习负载概览（含未来 7 天预估）",
  description:
    "只读接口，需 read 作用域。给出错题 SRS 的卡片总量、状态分布、未来 7 天每天要复习多少张/约多少分钟。这是「明天该复习什么」的最小数据面——具体题目用 `GET /wrong-book` 取。",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            totalCards: z.number().int().describe("进入 SRS 的错题卡总数"),
            stateDistribution: z.object({
              new: z.number().int(),
              learning: z.number().int(),
              review: z.number().int(),
              relearning: z.number().int(),
            }),
            learnedCount: z.number().int().describe("已进入学习/复习的卡片数"),
            retention: z
              .object({
                trueRetention: z.number().describe("真实保留率（0-1）"),
                totalReviews: z.number().int().describe("累计复习次数"),
              })
              .describe(
                "保留率统计；`totalReviews` 是**最近 30 天**的复习次数，不是历史总数",
              ),
            next7Days: z
              .object({
                count: z.number().int().describe("未来 7 天待复习总张数"),
                minutes: z.number().int().describe("预估总时长（分钟）"),
              })
              .describe("未来 7 天的复习负载合计"),
            daily: z
              .array(
                z.object({
                  date: z.string().describe("日期（YYYY-MM-DD）"),
                  count: z.number().int().describe("当天待复习张数"),
                  minutes: z.number().int().describe("当天预估分钟数"),
                }),
              )
              .describe("逐日负载；agent 用来排计划，不要一次渲染给用户"),
          }),
        },
      },
      description: "SRS 概览",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    429: RateLimitedResponse,
    500: { description: "服务器内部错误" },
  },
});

app.openapi(srsSummaryRoute, async (c) => {
  const identity = requireIdentity(c);

  try {
    const stats = await srsService.getGlobalStats(identity.effectiveUserId);
    const summary = summarizeFutureReviews(stats.futureReviews);

    return c.json(
      {
        totalCards: stats.totalCards,
        stateDistribution: stats.stateDistribution,
        learnedCount: stats.learnedCount,
        retention: stats.retentionStats,
        next7Days: { count: summary.totalCount, minutes: summary.totalMinutes },
        daily: stats.futureReviews.map((day) => ({
          date: day.date,
          count: day.count,
          minutes: day.estimatedMinutes,
        })),
      },
      200,
    );
  } catch (err) {
    logger.error({ err }, "[External] 读取 SRS 概览失败");
    return c.json({ error: "服务器内部错误" }, 500);
  }
});

// ---------- POST /recall/cards/{cardId}/archive ----------
// 归档是「按身份」的动作：卡片内容全局共享，但每个人都该能自己把它移出队列。

const archiveRoute = createRoute({
  method: "post",
  path: "/recall/cards/{cardId}/archive",
  middleware: [requireScopeMiddleware("write")] as const,
  summary: "把一张回忆卡移出当前身份的复习队列（归档）",
  description:
    "写接口，需 write 作用域。只影响**调用身份**的队列，不改卡片内容与别人的进度。天然幂等：重复归档仍是同一个结果。卡片不存在返回 404。",
  request: {
    params: z.object({ cardId: z.string().describe("卡片数字主键") }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            cardId: z.number().int(),
            archived: z.literal(true).describe("恒为 true"),
          }),
        },
      },
      description: "已归档",
    },
    400: { description: "cardId 不是正整数" },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足（需要 write）" },
    404: { description: "卡片不存在" },
    429: RateLimitedResponse,
    500: { description: "服务器内部错误" },
  },
});

app.openapi(archiveRoute, async (c) => {
  const identity = requireIdentity(c);
  const { cardId } = c.req.valid("param");
  const id = parsePositiveInt(cardId);
  if (id === null) {
    return c.json({ error: "cardId 必须是正整数" }, 400);
  }

  try {
    await archiveCard(identity.effectiveUserId, id);
    return c.json({ cardId: id, archived: true as const }, 200);
  } catch (err) {
    // audit-allow: 统一交给 recallErrorResponse 归类（业务错误 → 4xx 带可读原因，
    //   未知错误已在那里记结构化日志后回 500），此处不再重复记日志
    return toErrorResponse(c, err, { scope: "external.recall" });
  }
});

// ---------- DELETE /recall/cards/{cardId}/archive ----------

const unarchiveRoute = createRoute({
  method: "delete",
  path: "/recall/cards/{cardId}/archive",
  middleware: [requireScopeMiddleware("write")] as const,
  summary: "把一张回忆卡放回复习队列（取消归档）",
  description:
    "写接口，需 write 作用域。只影响**调用身份**。天然幂等：没归档过时返回 `restored: false`（没有可恢复的状态行），不算错误。",
  request: {
    params: z.object({ cardId: z.string().describe("卡片数字主键") }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            cardId: z.number().int(),
            restored: z
              .boolean()
              .describe("true = 恢复了一条状态行；false = 本来就没有归档记录"),
          }),
        },
      },
      description: "已取消归档（或本来就没有归档）",
    },
    400: { description: "cardId 不是正整数" },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足（需要 write）" },
    429: RateLimitedResponse,
    500: { description: "服务器内部错误" },
  },
});

app.openapi(unarchiveRoute, async (c) => {
  const identity = requireIdentity(c);
  const { cardId } = c.req.valid("param");
  const id = parsePositiveInt(cardId);
  if (id === null) {
    return c.json({ error: "cardId 必须是正整数" }, 400);
  }

  try {
    const restored = await unarchiveCard(identity.effectiveUserId, id);
    return c.json({ cardId: id, restored }, 200);
  } catch (err) {
    // audit-allow: 统一交给 recallErrorResponse 归类（业务错误 → 4xx 带可读原因，
    //   未知错误已在那里记结构化日志后回 500），此处不再重复记日志
    return toErrorResponse(c, err, { scope: "external.recall" });
  }
});

// ---------- POST /srs/reviews ----------
// 错题 SRS 的唯一写入口。以前这条链路只在答题流程里发生（PracticeService 内部），
// 外部数据推不动复习队列 —— agent 补做一道错题后没法让它进入明天的复习。

const SrsReviewRequestSchema = z
  .object({
    questionId: z.number().int().positive().describe("题目 ID"),
    isCorrect: z
      .boolean()
      .describe("本次是否答对（服务端不重算；传错会污染调度）"),
    durationMs: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("作答耗时（毫秒），默认 0；影响评分推导"),
    userAnswerLength: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("填空类作答的字符数；影响评分推导"),
    answeredAt: z
      .string()
      .optional()
      .describe(
        "本次作答时间（ISO 8601）。同时是幂等键：同一时间去重试不会二次推进调度",
      ),
  })
  .openapi("ExternalSrsReviewRequest");

const SrsReviewResponseSchema = z
  .object({
    questionId: z.number().int(),
    dueDate: z.string().describe("下次到期时间（ISO 8601 UTC）"),
    stability: z.number().describe("FSRS 记忆稳定度"),
    difficulty: z.number().describe("FSRS 难度"),
    reps: z.number().int().describe("累计复习次数"),
    lapses: z.number().int().describe("累计遗忘次数"),
    state: z
      .number()
      .int()
      .describe("FSRS 状态：0 New / 1 Learning / 2 Review / 3 Relearning"),
    duplicate: z
      .boolean()
      .describe("true = 同一 answeredAt 已处理过，本次未推进调度"),
  })
  .openapi("ExternalSrsReviewResponse");

const srsReviewRoute = createRoute({
  method: "post",
  path: "/srs/reviews",
  middleware: [requireScopeMiddleware("write")] as const,
  summary: "提交一次错题复习（推进该身份的 SRS 调度）",
  description:
    "写接口，需 write 作用域。按 `isCorrect` 与耗时推导 FSRS 评分并推进该身份的 `question_srs`，这是让外部数据影响复习队列的唯一入口。**幂等**：带 `answeredAt` 时，同一时间的重试直接返回当前状态（`duplicate: true`），不会二次推进。题目不存在返回 404。",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: SrsReviewRequestSchema } },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: SrsReviewResponseSchema },
      },
      description: "推进后的调度状态（或幂等重放）",
    },
    400: { description: "请求体校验失败 / answeredAt 不是合法时间" },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足（需要 write）" },
    404: { description: "题目不存在" },
    429: RateLimitedResponse,
    500: { description: "服务器内部错误" },
  },
});

app.openapi(srsReviewRoute, async (c) => {
  const identity = requireIdentity(c);
  const body = c.req.valid("json");
  const userId = identity.effectiveUserId;

  // 只把 undefined 当成"用当前时间"；空串/非法串必须 400，
  // 否则 answeredAt:"" 会静默退化成"现在"，把幂等键变成每次都不一样
  const answeredAt =
    body.answeredAt === undefined ? new Date() : new Date(body.answeredAt);
  if (Number.isNaN(answeredAt.getTime())) {
    return c.json({ error: "answeredAt 不是合法时间" }, 400);
  }

  // 题目存在性先判：srsService 用 throw Error 表达"题目不存在"，
  // 路由层没有可靠办法把它与真实故障区分成 404 / 500
  const [question] = await drizzleDb
    .select({ id: drizzleSchema.questions.id })
    .from(drizzleSchema.questions)
    .where(eq(drizzleSchema.questions.id, body.questionId))
    .limit(1);
  if (!question) {
    return c.json({ error: `题目不存在：${body.questionId}` }, 404);
  }

  const answeredAtIso = answeredAt.toISOString();

  try {
    // 读-判-写必须在同一事务里，并按 (user, question) 串行：
    // 否则两笔并发请求会各自读到同一份旧状态、各自 +1，后写的把前者覆盖掉
    // （评审指出的两条竞态）；阅读速度的采样也走同一个 exec，调度失败时一起回滚
    const outcome = await withKeyedLock(
      `srs:${userId}:${body.questionId}`,
      () =>
        withTransaction(async (exec) => {
          const [existing] = await exec
            .select()
            .from(drizzleSchema.question_srs)
            .where(
              and(
                eq(drizzleSchema.question_srs.user_id, userId),
                eq(drizzleSchema.question_srs.question_id, body.questionId),
              ),
            )
            .limit(1);

          // 幂等：answeredAt 落到 last_review 上，同一时间重试直接返回当前状态。
          // 不用客户端 UUID 是为了不新增一张表 —— 复习本来就是"一个时间点一条"。
          if (existing?.last_review === answeredAtIso) {
            return { duplicate: true as const, row: existing };
          }

          const item = await srsService.updateQuestionSrs(
            userId,
            body.questionId,
            body.isCorrect,
            body.durationMs ?? 0,
            answeredAt,
            undefined,
            body.userAnswerLength,
            exec,
          );
          return { duplicate: false as const, item };
        }),
    );

    if (outcome.duplicate) {
      return c.json(
        {
          questionId: body.questionId,
          dueDate: outcome.row.due_date,
          stability: outcome.row.stability,
          difficulty: outcome.row.difficulty,
          reps: outcome.row.reps,
          lapses: outcome.row.lapses,
          state: outcome.row.state,
          duplicate: true,
        },
        200,
      );
    }

    const item = outcome.item;
    return c.json(
      {
        questionId: body.questionId,
        dueDate: item.due.toISOString(),
        stability: item.stability,
        difficulty: item.difficulty,
        reps: item.reps,
        lapses: item.lapses,
        state: item.state,
        duplicate: false,
      },
      200,
    );
  } catch (err) {
    logger.error({ err }, "[External] 推进 SRS 失败");
    return c.json({ error: "服务器内部错误" }, 500);
  }
});

export default app;
