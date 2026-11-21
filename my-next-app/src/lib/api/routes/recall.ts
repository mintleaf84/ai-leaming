/**
 * 回忆自测（Recall）——**用户 JWT** 接口面。
 *
 * 为什么需要这一层：同一套协议已经挂在 `/api/external` 下，但那里要求 API Key +
 * scope（`requireIdentity` / `requireScopeMiddleware`）。Flutter 客户端只有用户登录
 * 拿到的 JWT，没有 API Key，所以补一张 JWT 面。协议字段与 external 完全一致，
 * 只是身份来源从 `key → user` 换成 JWT 里的 `user.id`。
 *
 * 分层约定（与 external 相同）：判分、FSRS 调度、幂等、内容校验全部在
 * `lib/services/recall*.ts`；这里只做参数校验 + 身份透传 + 错误语义映射。
 * 任何判分/调度逻辑都不允许在路由层再写一遍（否则两处必然漂移）。
 *
 * schema 为镜像实现（external.ts:1024-1110 与 1370-1440）：external 的路由文件
 * 没有导出 schema，直接 import 会把整个 external 路由模块拽进来。镜像时字段与语义
 * 必须逐字对齐，改动 external 的 recall 协议时两处要一起改。
 */
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { authMiddleware, getCurrentUser } from "@/lib/api/middlewares/auth";
import { toErrorResponse } from "@/lib/api/error-response";
import { parsePagination } from "@/lib/api/pagination";
import {
  archiveCard,
  buildNextReviewText,
  computeStreakDays,
  findCard,
  getTodayQueue,
  listDeckCards,
  normalizeItemIndexes,
  submitReview,
  unarchiveCard,
} from "@/lib/services/recall";
import { listDecks } from "@/lib/services/recall-import";

const app = new OpenAPIHono();

// ==================== 分页（与 external.ts:356-419 同一口径） ====================
// 默认 20、上限 100；非法值**不报错**，退回默认（历史行为，客户端已经在依赖它）。
// 之所以不改成 400：分页参数是可选装饰，传错不该让整次读取失败。

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const PaginationQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .default(String(DEFAULT_LIMIT))
    .describe(`返回条数，默认 ${DEFAULT_LIMIT}，上限 ${MAX_LIMIT}`),
  offset: z.string().optional().default("0").describe("偏移量，默认 0"),
});

const PaginationMetaSchema = z.object({
  limit: z
    .number()
    .int()
    .describe("本次请求的实际条数上限（已被截到 100 以内）"),
  offset: z.number().int().describe("本次请求的偏移量"),
  total: z.number().int().describe("符合条件的总条数"),
});

// 分页解析走共享实现（P6 收敛）。本文件原先内联了一份语义相近的副本，
// 差别只在非法输入：`limit=0`/负数原先被夹到 1、小数被 trunc，现在统一回落到默认值。
// 这正是 `pagination.ts` 文档写明的口径（非数字/0/负数一律回落默认）。

/** 路径里的数字卡片主键；非法值返回 null（由路由回 400） */
function parsePositiveInt(raw: string): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

// ==================== 卡片 schema（镜像 external.ts:1029-1100） ====================

const RecallCardKindSchema = z
  .enum(["list", "cloze"])
  .describe("卡片类型：list = 列举卡，cloze = 填空卡");

const RecallListItemSchema = z.object({
  text: z.string().describe("条目文本"),
  keywords: z.array(z.string()).describe("关键词，任一命中即判「已写」"),
});

const RecallBlankSchema = z.object({
  answers: z.array(z.string()).describe("该空可接受的答案（1–3 个）"),
});

const RecallCardStateSchema = z
  .object({
    due: z.string().describe("下次到期时间（ISO 8601 UTC）"),
    stability: z.number().describe("FSRS 记忆稳定度"),
    difficulty: z.number().describe("FSRS 难度"),
    state: z
      .number()
      .int()
      .describe("FSRS 状态：0 New / 1 Learning / 2 Review / 3 Relearning"),
    reps: z.number().int().describe("累计复习次数"),
    lapses: z.number().int().describe("累计遗忘次数"),
    last_review: z
      .string()
      .nullable()
      .describe("最近一次复习时间，未知为 null"),
    pendingItems: z
      .array(z.number().int())
      .nullable()
      .describe("待重测的条目下标；null 表示没有待重测条目"),
    archived: z.boolean().describe("是否已归档（移出队列）"),
  })
  .nullable()
  .describe("当前用户在这张卡上的进度；null = 从未复习过（新卡）");

// ---------- GET /queue ----------

const queueRoute = createRoute({
  method: "get",
  path: "/queue",
  middleware: [authMiddleware] as const,
  summary: "获取今日回忆队列（到期优先 + 新卡额度）",
  description:
    "`ids` 是本次要做的卡片主键序列（到期优先、按 due 升序，其后是今天投放的新卡）；`due` / `fresh` 是**条数**而不是 id 数组，编号一律从 `ids` 取。纯查询，同一时刻重复调用结果一致。",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            ids: z
              .array(z.number().int())
              .describe("本次要做的卡片主键，顺序即建议作答顺序"),
            due: z.number().int().describe("到期卡条数（含重测卡）"),
            fresh: z.number().int().describe("今日投放的新卡条数"),
            total: z.number().int().describe("队列总条数 = due + fresh"),
            estimatedMinutes: z.number().int().describe("展示用估时（分钟）"),
            streakDays: z
              .number()
              .int()
              .describe("连续学习天数（学习日 04:00 切换）"),
          }),
        },
      },
      description: "今日队列",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已过期的 JWT" },
  },
});

app.openapi(queueRoute, async (c) => {
  const user = getCurrentUser(c);
  const userId = Number(user.id);
  const now = new Date();

  const queue = await getTodayQueue(userId, { now });
  const streakDays = await computeStreakDays(userId, now);

  return c.json({
    // 顺序 = 到期优先 + 新卡（服务层已按此顺序拼好，客户端据此逐张取卡）
    ids: [...queue.due, ...queue.fresh],
    due: queue.due.length,
    fresh: queue.fresh.length,
    total: queue.total,
    estimatedMinutes: queue.estimatedMinutes,
    streakDays,
  });
});

// ---------- GET /decks ----------

const decksRoute = createRoute({
  method: "get",
  path: "/decks",
  middleware: [authMiddleware] as const,
  summary: "列出回忆自测卡组（含当前用户的进度统计）",
  description:
    "卡组内容全局共享，`activeCount` / `archivedCount` / `dueCount` 只统计当前登录用户的数据。按卡组标题升序。",
  request: { query: PaginationQuerySchema },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(
              z.object({
                deckKey: z
                  .string()
                  .describe("卡组标识（导入导出文件里的 deckId）"),
                title: z.string().describe("卡组标题"),
                cardCount: z.number().int().describe("卡组内卡片总数"),
                activeCount: z
                  .number()
                  .int()
                  .describe("该用户未归档、已有复习状态的卡片数（含未到期）"),
                archivedCount: z
                  .number()
                  .int()
                  .describe("该用户已归档（移出队列）的卡片数"),
                dueCount: z
                  .number()
                  .int()
                  .describe("该用户当前到期可复习的卡片数"),
              }),
            ),
            meta: PaginationMetaSchema,
          }),
        },
      },
      description: "卡组列表",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已过期的 JWT" },
  },
});

app.openapi(decksRoute, async (c) => {
  const user = getCurrentUser(c);
  const { limit, offset } = parsePagination(c.req.valid("query"));

  const decks = await listDecks(Number(user.id));
  // listDecks 一次查全部卡组（数量级是「几十个」），分页在内存里切片即可，
  // 不必为此改动服务层签名（Server Action 也走同一个函数）。
  const page = decks.slice(offset, offset + limit).map((deck) => ({
    deckKey: deck.deckKey,
    title: deck.title,
    cardCount: deck.cardCount,
    activeCount: deck.activeCount,
    archivedCount: deck.archivedCount,
    dueCount: deck.dueCount,
  }));

  return c.json({ data: page, meta: { limit, offset, total: decks.length } });
});

// ---------- GET /decks/{deckKey} ----------

const deckDetailRoute = createRoute({
  method: "get",
  path: "/decks/{deckKey}",
  middleware: [authMiddleware] as const,
  summary: "获取卡组详情与卡片列表（含当前用户的复习状态）",
  description:
    "卡片内容全局共享，`state` 只反映当前用户的进度（无记录为 null）。按卡片主键升序分页，默认 20、上限 100。卡组不存在返回 404。",
  request: {
    params: z.object({ deckKey: z.string().describe("卡组标识") }),
    query: PaginationQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            deck: z.object({
              deckKey: z.string(),
              title: z.string(),
              groups: z.array(
                z.object({
                  groupId: z.string(),
                  title: z.string(),
                  order: z.number().int().optional(),
                }),
              ),
            }),
            data: z.array(
              z.object({
                cardId: z.number().int(),
                cardKey: z.string(),
                kind: RecallCardKindSchema,
                groupKey: z.string().nullable(),
                prompt: z.string(),
                items: z.array(RecallListItemSchema).nullable(),
                blanks: z.array(RecallBlankSchema).nullable(),
                verbatim: z.boolean(),
                state: RecallCardStateSchema,
              }),
            ),
            meta: PaginationMetaSchema,
          }),
        },
      },
      description: "卡组详情 + 卡片列表",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已过期的 JWT" },
    404: { description: "卡组不存在" },
  },
});

app.openapi(deckDetailRoute, async (c) => {
  const user = getCurrentUser(c);
  const { deckKey } = c.req.valid("param");
  const { limit, offset } = parsePagination(c.req.valid("query"));

  const page = await listDeckCards(Number(user.id), deckKey, {
    limit,
    offset,
  });
  if (!page) {
    return c.json({ error: `卡组不存在：${deckKey}` }, 404);
  }

  return c.json({
    deck: page.deck,
    data: page.cards.map((card) => ({
      cardId: card.cardId,
      cardKey: card.cardKey,
      kind: card.kind,
      groupKey: card.groupKey,
      prompt: card.prompt,
      items: card.items,
      blanks: card.blanks,
      verbatim: card.verbatim,
      state: card.state,
    })),
    meta: { limit, offset, total: page.total },
  });
});

// ---------- GET /cards/{cardId} ----------

const cardDetailRoute = createRoute({
  method: "get",
  path: "/cards/{cardId}",
  middleware: [authMiddleware] as const,
  summary: "获取单张回忆卡详情（含呈现模式与待重测条目）",
  description:
    "`cardId` 是数字主键。`mode` 为 `retest` 时界面只呈现 `pendingItems` 里的条目；`state` 为 null 表示当前用户从未复习过这张卡。卡片不存在返回 404。",
  request: {
    params: z.object({ cardId: z.string().describe("卡片数字主键") }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            cardId: z.number().int(),
            cardKey: z.string(),
            deckKey: z.string(),
            deckTitle: z.string(),
            kind: RecallCardKindSchema,
            groupKey: z.string().nullable(),
            prompt: z.string(),
            items: z.array(RecallListItemSchema).nullable(),
            blanks: z.array(RecallBlankSchema).nullable(),
            verbatim: z.boolean(),
            state: RecallCardStateSchema,
            mode: z
              .enum(["first", "retest"])
              .describe("first = 首次作答整卡；retest = 只重测待重测条目"),
            pendingItems: z
              .array(z.number().int())
              .nullable()
              .describe("待重测条目下标；null 表示没有（与 mode 联动）"),
          }),
        },
      },
      description: "卡片详情",
    },
    400: { description: "cardId 不是正整数" },
    401: { description: "未授权 - 缺少 / 无效 / 已过期的 JWT" },
    404: { description: "卡片不存在" },
  },
});

app.openapi(cardDetailRoute, async (c) => {
  const user = getCurrentUser(c);
  const cardId = parsePositiveInt(c.req.valid("param").cardId);
  if (cardId === null) {
    return c.json({ error: "cardId 必须是正整数" }, 400);
  }

  const card = await findCard(Number(user.id), cardId);
  if (!card) {
    return c.json({ error: `卡片不存在：${cardId}` }, 404);
  }

  // 条目可能因编辑而变少：先按**当前**条目数过滤库里的 pendingItems，
  // 过滤后为空就退回首发。否则会把模式判成 retest 并返回不存在的条目下标，
  // 客户端照着取条目会扑空（清洗逻辑复用服务层的 normalizeItemIndexes）。
  const itemCount =
    card.kind === "list"
      ? (card.items ?? []).length
      : (card.blanks ?? []).length;
  const pendingItems = normalizeItemIndexes(
    card.state?.pendingItems ?? null,
    itemCount,
  );

  return c.json({
    cardId: card.cardId,
    cardKey: card.cardKey,
    deckKey: card.deckKey,
    deckTitle: card.deckTitle,
    kind: card.kind,
    groupKey: card.groupKey,
    prompt: card.prompt,
    items: card.items,
    blanks: card.blanks,
    verbatim: card.verbatim,
    state: card.state,
    mode: pendingItems.length > 0 ? "retest" : "first",
    pendingItems: pendingItems.length > 0 ? pendingItems : null,
  });
});

// ---------- POST /reviews ----------

// 字段与语义必须与 external.ts:1370-1405 的 `RecallReviewRequestSchema` 完全一致：
// 客户端（Flutter 与 agent）共用同一份协议，两处只要有一个字段漂移，
// `clientKey` 幂等这类契约就会在某些通道上悄悄失效。
const RecallReviewRequestSchema = z
  .object({
    cardId: z.number().int().positive().openapi({
      description: "卡片数字主键（来自 GET /cards/:cardId 或队列 ids）",
      example: 42,
    }),
    typed: z.string().openapi({
      description: "用户作答原文；填空卡按呈现顺序分段",
      example: "1. 建立安全制度 2. 开展安全演练",
    }),
    allBlank: z.boolean().optional().openapi({
      description: "用户点了「全没想起」：所有呈现条目都算未写",
    }),
    overrides: z
      .array(
        z.object({
          index: z.number().int().nonnegative().openapi({
            description: "卡内条目下标（与 pendingItems 同一坐标系）",
          }),
          to: z.enum(["ok", "miss"]).openapi({ description: "改判结果" }),
        }),
      )
      .optional()
      .openapi({ description: "用户改判项，可空" }),
    clientKey: z.string().trim().min(1).max(120).optional().openapi({
      description:
        "幂等键（客户端进入判分屏时生成的 UUID）。同一次作答的所有重试必须沿用同一个 key；服务端命中后返回首次结果（duplicate=true），不会二次推进调度",
      example: "6f1c1d5e-2a4b-4f0e-9c2f-8f0a2d1b7c33",
    }),
  })
  .openapi("MobileRecallReviewRequest");

// 与 external.ts:1407-1430 的 `RecallReviewResponseSchema` 对齐；
// `dryRun` 只在 external 的预演通道上出现，JWT 面不提供预演，故不声明。
const RecallReviewResponseSchema = z
  .object({
    verdicts: z
      .array(z.enum(["ok", "miss"]))
      .describe("最终判分（已应用改判），与本次呈现的条目一一对应"),
    rating: z
      .enum(["again", "hard", "good"])
      .describe("推导出的 FSRS 评分（用户不直接选择）"),
    nextDue: z.string().describe("下次到期时间（ISO 8601 UTC）"),
    pendingItems: z
      .array(z.number().int())
      .nullable()
      .describe("下次要重测的条目下标；null 表示无需重测"),
    nextReviewText: z
      .string()
      .describe(
        "可直接展示的提示，如「下次 11 月 20 日」「明天只重测这 2 条」",
      ),
    duplicate: z
      .boolean()
      .describe("true = 该 clientKey 已提交过，本次为幂等重放，未推进调度"),
  })
  .openapi("MobileRecallReviewResponse");

const reviewsRoute = createRoute({
  method: "post",
  path: "/reviews",
  middleware: [authMiddleware] as const,
  summary: "提交一次回忆作答（判分 + 调度 + 落日志）",
  description:
    "服务端按卡片内容判分、推导评分并推进 FSRS 调度。带 `clientKey` 时按 `(user_id, clientKey)` 幂等：重试命中返回 `duplicate: true` 与首次结果，**不会二次推进调度**。卡片不存在返回 404。",
  request: {
    body: {
      // 必填：否则缺失的 body 会被校验成 `{}`，一路走到服务层才炸成 500
      required: true,
      content: {
        "application/json": { schema: RecallReviewRequestSchema },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: RecallReviewResponseSchema },
      },
      description: "判分结果（或幂等重放，见 duplicate）",
    },
    400: { description: "请求体校验失败 / 改判下标非法" },
    401: { description: "未授权 - 缺少 / 无效 / 已过期的 JWT" },
    404: { description: "卡片不存在" },
  },
});

app.openapi(reviewsRoute, async (c) => {
  const user = getCurrentUser(c);
  const userId = Number(user.id);
  const body = c.req.valid("json");

  // 先判存在性再提交：submitReview 会把"卡不存在"和"改判下标非法"都抛成
  // 业务错误，路由层无法区分；用只读查询把 404 与 400 分开，语义才稳定。
  const card = await findCard(userId, body.cardId);
  if (!card) {
    return c.json({ error: `卡片不存在：${body.cardId}` }, 404);
  }

  try {
    const result = await submitReview(userId, body.cardId, {
      typed: body.typed,
      allBlank: body.allBlank,
      overrides: body.overrides,
      // 幂等键必须原样透传：服务层按 (user_id, client_key) 判断是否重放
      clientKey: body.clientKey,
    });

    return c.json(
      {
        verdicts: result.verdicts,
        rating: result.rating,
        nextDue: result.nextDue,
        pendingItems: result.pendingItems,
        nextReviewText: buildNextReviewText(
          result.nextDue,
          result.pendingItems,
        ),
        duplicate: result.duplicate,
      },
      200,
    );
  } catch (err) {
    // audit-allow: 统一交给 toErrorResponse 归类（业务错误 → 4xx 带可读原因，
    //   未知错误已在那里记结构化日志后回 500），此处不再重复记日志
    return toErrorResponse(c, err, { scope: "recall.reviews" });
  }
});

// ---------- POST /cards/{cardId}/archive ----------
// 归档是「按用户」的动作：卡片内容全局共享，但每个人都该能自己把它移出队列。

const archiveRoute = createRoute({
  method: "post",
  path: "/cards/{cardId}/archive",
  middleware: [authMiddleware] as const,
  summary: "把一张回忆卡移出当前用户的复习队列（归档）",
  description:
    "只影响**当前登录用户**的队列，不改卡片内容与别人的进度。天然幂等：重复归档仍是同一个结果。卡片不存在返回 404。",
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
    401: { description: "未授权 - 缺少 / 无效 / 已过期的 JWT" },
    404: { description: "卡片不存在" },
  },
});

app.openapi(archiveRoute, async (c) => {
  const user = getCurrentUser(c);
  const cardId = parsePositiveInt(c.req.valid("param").cardId);
  if (cardId === null) {
    return c.json({ error: "cardId 必须是正整数" }, 400);
  }

  try {
    await archiveCard(Number(user.id), cardId);
    return c.json({ cardId, archived: true as const }, 200);
  } catch (err) {
    // audit-allow: 统一交给 toErrorResponse 归类（卡片不存在 → 404，未知 → 500），
    //   此处不再重复记日志
    return toErrorResponse(c, err, { scope: "recall.archive" });
  }
});

// ---------- DELETE /cards/{cardId}/archive ----------

const unarchiveRoute = createRoute({
  method: "delete",
  path: "/cards/{cardId}/archive",
  middleware: [authMiddleware] as const,
  summary: "把一张回忆卡放回复习队列（取消归档）",
  description:
    "只影响**当前登录用户**。天然幂等：没归档过时返回 `restored: false`（没有可恢复的状态行），不算错误。",
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
    401: { description: "未授权 - 缺少 / 无效 / 已过期的 JWT" },
  },
});

app.openapi(unarchiveRoute, async (c) => {
  const user = getCurrentUser(c);
  const cardId = parsePositiveInt(c.req.valid("param").cardId);
  if (cardId === null) {
    return c.json({ error: "cardId 必须是正整数" }, 400);
  }

  try {
    const restored = await unarchiveCard(Number(user.id), cardId);
    return c.json({ cardId, restored }, 200);
  } catch (err) {
    // audit-allow: 统一交给 toErrorResponse 归类，此处不再重复记日志
    return toErrorResponse(c, err, { scope: "recall.unarchive" });
  }
});

export default app;
