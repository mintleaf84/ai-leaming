/**
 * `/api/external` —— 回忆自测（Recall）卡组 / 卡片 / 队列 / 作答 / 导入
 *
 * 拆分自 `routes/external.ts`；路径、方法、schema、中间件与错误文案均未改动。
 */
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  buildNextReviewText,
  computeStreakDays,
  findCard,
  getTodayQueue,
  listDeckCards,
  normalizeItemIndexes,
  submitReview,
} from "@/lib/services/recall";
import {
  deleteCard,
  importDeck,
  listDecks,
  upsertCard,
} from "@/lib/services/recall-import";
import { toErrorResponse } from "@/lib/api/error-response";
import { parsePagination } from "@/lib/api/pagination";
import {
  DryRunQuerySchema,
  PaginationMetaSchema,
  PaginationQuerySchema,
  RateLimitedResponse,
  parsePositiveInt,
  requireIdentity,
  requireScopeMiddleware,
  wantsDryRun,
} from "./shared";

const app = new OpenAPIHono();

// ==================== 回忆自测（Recall） ====================
// 卡组与卡片内容**全局共享**（`recall_decks` / `recall_cards` 没有 user_id），
// 复习进度与日志按调用身份隔离（`recall_card_states` / `recall_review_logs`）。
// 判分、调度、幂等全部在 `lib/services/recall*.ts`：这里只做参数校验、身份透传
// 与错误语义映射，任何判分逻辑都不允许在路由层再写一遍（否则两处必然漂移）。

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
  .describe("该调用身份在这张卡上的进度；null = 从未复习过（新卡）");

const RecallCardSchema = z.object({
  cardId: z.number().int().describe("卡片数字主键（提交作答时用它）"),
  cardKey: z.string().describe("卡片文件内标识（卡组内唯一）"),
  kind: RecallCardKindSchema,
  groupKey: z.string().nullable().describe("所属分组，未分组为 null"),
  prompt: z.string().describe("题干"),
  items: z
    .array(RecallListItemSchema)
    .nullable()
    .describe("列举卡条目；填空卡为 null"),
  blanks: z
    .array(RecallBlankSchema)
    .nullable()
    .describe("填空卡空位；列举卡为 null"),
  verbatim: z.boolean().describe("是否逐字判分（仅列举卡有意义）"),
  state: RecallCardStateSchema,
});

// ---------- GET /recall/decks ----------

const recallDecksRoute = createRoute({
  method: "get",
  path: "/recall/decks",
  summary: "列出回忆自测卡组（含当前身份的进度统计）",
  description:
    "只读接口，需 read 作用域。卡组内容全局共享，`activeCount` / `archivedCount` / `dueCount` 只统计当前 API Key 所属用户的数据。按卡组标题升序。",
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
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    429: RateLimitedResponse,
  },
});

app.openapi(recallDecksRoute, async (c) => {
  const identity = requireIdentity(c);
  const { limit, offset } = parsePagination(c.req.valid("query"));

  const decks = await listDecks(identity.effectiveUserId);
  // listDecks 一次查全部卡组（数量级是「几十个」），分页在内存里切片即可，
  // 不必为了外部 API 改动服务层签名（Server Action 也走同一个函数）。
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

// ---------- GET /recall/decks/:deckKey ----------

const recallDeckDetailRoute = createRoute({
  method: "get",
  path: "/recall/decks/{deckKey}",
  summary: "获取卡组详情与卡片列表（含当前身份的复习状态）",
  description:
    "只读接口，需 read 作用域。卡片内容全局共享，`state` 只反映当前 API Key 所属用户的进度（无记录为 null）。按卡片主键升序分页，默认 20、上限 100。卡组不存在返回 404。",
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
            data: z.array(RecallCardSchema),
            meta: PaginationMetaSchema,
          }),
        },
      },
      description: "卡组详情 + 卡片列表",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    429: RateLimitedResponse,
    404: { description: "卡组不存在" },
  },
});

app.openapi(recallDeckDetailRoute, async (c) => {
  const identity = requireIdentity(c);
  const { deckKey } = c.req.valid("param");
  const { limit, offset } = parsePagination(c.req.valid("query"));

  const page = await listDeckCards(identity.effectiveUserId, deckKey, {
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

// ---------- GET /recall/cards/:cardId ----------

const recallCardDetailRoute = createRoute({
  method: "get",
  path: "/recall/cards/{cardId}",
  summary: "获取单张回忆卡详情（含呈现模式与待重测条目）",
  description:
    "只读接口，需 read 作用域。`cardId` 是数字主键。`mode` 为 `retest` 时界面只呈现 `pendingItems` 里的条目；`state` 为 null 表示该身份从未复习过这张卡。卡片不存在返回 404。",
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
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    429: RateLimitedResponse,
    404: { description: "卡片不存在" },
  },
});

app.openapi(recallCardDetailRoute, async (c) => {
  const identity = requireIdentity(c);
  const cardId = parsePositiveInt(c.req.valid("param").cardId);
  if (cardId === null) {
    return c.json({ error: "cardId 必须是正整数" }, 400);
  }

  const card = await findCard(identity.effectiveUserId, cardId);
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

// ---------- GET /recall/queue ----------

const recallQueueRoute = createRoute({
  method: "get",
  path: "/recall/queue",
  summary: "获取今日回忆队列（到期优先 + 新卡额度）",
  description:
    "只读接口，需 read 作用域。`ids` 是本次要做的卡片主键序列（到期优先、按 due 升序，其后是今天投放的新卡）；`due` / `fresh` 是**条数**而不是 id 数组，编号一律从 `ids` 取。队列是纯查询，同一时刻重复调用结果一致。",
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
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    429: RateLimitedResponse,
  },
});

app.openapi(recallQueueRoute, async (c) => {
  const identity = requireIdentity(c);
  const now = new Date();
  const userId = identity.effectiveUserId;

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

// ---------- POST /recall/reviews ----------

const RecallReviewRequestSchema = z
  .object({
    cardId: z.number().int().positive().openapi({
      description: "卡片数字主键（来自 GET /recall/cards/:cardId 或队列 ids）",
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
  .openapi("ExternalRecallReviewRequest");

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
    dryRun: z.boolean().optional().openapi({
      description:
        "仅预演时出现且恒为 true：本次没有写库，评分与到期时间是真实计算结果",
    }),
  })
  .openapi("ExternalRecallReviewResponse");

const recallReviewsRoute = createRoute({
  method: "post",
  path: "/recall/reviews",
  middleware: [requireScopeMiddleware("write")] as const,
  summary: "提交一次回忆作答（判分 + 调度 + 落日志）",
  description:
    "写接口，需 write 作用域。服务端按卡片内容判分、推导评分并推进 FSRS 调度。带 `clientKey` 时按 `(user_id, clientKey)` 幂等：重试命中返回 `duplicate: true` 与首次结果，**不会二次推进调度**。卡片不存在返回 404。",
  request: {
    query: DryRunQuerySchema,
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
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足（需要 write）" },
    429: RateLimitedResponse,
    404: { description: "卡片不存在" },
    500: { description: "服务器内部错误" },
  },
});

app.openapi(recallReviewsRoute, async (c) => {
  const identity = requireIdentity(c);
  const body = c.req.valid("json");
  const dryRun = wantsDryRun(c.req.valid("query"));
  const userId = identity.effectiveUserId;

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
      dryRun,
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
        ...(result.dryRun ? { dryRun: true } : {}),
      },
      200,
    );
  } catch (err) {
    // audit-allow: 统一交给 recallErrorResponse 归类（业务错误 → 4xx 带可读原因，
    //   未知错误已在那里记结构化日志后回 500），此处不再重复记日志
    return toErrorResponse(c, err, { scope: "external.recall" });
  }
});

// ---------- POST /recall/decks ----------

const RecallDeckImportRequestSchema = z
  .object({
    json: z.string().min(1).openapi({
      description: "卡组文件内容（JSON 字符串，schema=1）",
      example: '{"schema":1,"deckId":"deck-1","title":"教育法规","cards":[…]',
    }),
    onConflict: z.enum(["keep", "accept"]).optional().openapi({
      description:
        "内容冲突策略：keep（默认，保留库内内容）/ accept（采用文件内容，进度不受影响）",
    }),
  })
  .openapi("ExternalRecallDeckImportRequest");

const RecallDeckImportResponseSchema = z
  .object({
    deckKey: z.string().describe("卡组标识"),
    createdCards: z.number().int().describe("本次新建的卡片数"),
    updatedCards: z
      .number()
      .int()
      .describe("内容被文件覆盖的卡片数（仅 accept）"),
    skippedCards: z.number().int().describe("内容一致、完全跳过的卡片数"),
    conflicts: z
      .array(
        z.object({
          cardId: z.string().describe("卡片标识"),
          action: z.enum(["keep", "accept"]).describe("该冲突的处理方式"),
        }),
      )
      .describe("内容冲突清单"),
    missingInFile: z
      .array(z.string())
      .describe("库里有、文件里没有的 cardId（不会删除）"),
    dryRun: z.boolean().optional().openapi({
      description:
        '仅预演时出现且恒为 true：本次没有写库，三组计数是"真执行会怎样"',
    }),
  })
  .openapi("ExternalRecallDeckImportResponse");

const recallDeckImportRoute = createRoute({
  method: "post",
  path: "/recall/decks",
  middleware: [requireScopeMiddleware("write")] as const,
  summary: "导入（或更新）一个回忆卡组",
  description:
    "写接口，需 write 作用域。幂等：同一份文件重复导入不新增、不重置任何人的复习进度。文件里没有的卡片不删除，只在 `missingInFile` 里报告。`schema` 版本不支持或内容校验失败返回 400 且库内零写入。",
  request: {
    query: DryRunQuerySchema,
    body: {
      // 必填：否则缺失的 body 会被校验成 `{}`，一路走到服务层才炸成 500
      required: true,
      content: {
        "application/json": { schema: RecallDeckImportRequestSchema },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: RecallDeckImportResponseSchema },
      },
      description: "导入结果",
    },
    400: { description: "卡组内容校验失败（带 issues）" },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足（需要 write）" },
    429: RateLimitedResponse,
    500: { description: "服务器内部错误" },
  },
});

app.openapi(recallDeckImportRoute, async (c) => {
  const identity = requireIdentity(c);
  const body = c.req.valid("json");
  const dryRun = wantsDryRun(c.req.valid("query"));

  try {
    // 直接传 JSON 字符串：parseRecallDeck 统一处理解析与校验，
    // 避免路由层再写一遍 JSON.parse → 错误文案分叉
    const result = await importDeck(identity.effectiveUserId, body.json, {
      onConflict: body.onConflict,
      dryRun,
    });

    return c.json(
      {
        deckKey: result.deckKey,
        createdCards: result.createdCards,
        updatedCards: result.updatedCards,
        skippedCards: result.skippedCards,
        conflicts: result.conflicts,
        missingInFile: result.missingInFile,
        ...(result.dryRun ? { dryRun: true } : {}),
      },
      200,
    );
  } catch (err) {
    // audit-allow: 统一交给 recallErrorResponse 归类（业务错误 → 4xx 带可读原因，
    //   未知错误已在那里记结构化日志后回 500），此处不再重复记日志
    return toErrorResponse(c, err, { scope: "external.recall" });
  }
});

// ---------- POST /recall/cards ----------

const RecallCardUpsertRequestSchema = z
  .object({
    deckKey: z.string().trim().min(1).max(120).openapi({
      description: "卡组标识",
      example: "deck-1",
    }),
    cardId: z.string().trim().min(1).max(120).openapi({
      description: "卡组内的卡片标识（文件里的 cardId，非数字主键）",
      example: "L1-c01",
    }),
    prompt: z.string().trim().min(1).openapi({ description: "题干" }),
    kind: z.enum(["list", "cloze"]).openapi({
      description: "list = 列举卡（用 items）/ cloze = 填空卡（用 blanks）",
    }),
    items: z
      .array(RecallListItemSchema)
      .min(1)
      .max(6)
      .optional()
      .openapi({ description: "列举卡条目，1–6 条；kind=list 时必填" }),
    blanks: z
      .array(RecallBlankSchema)
      .min(1)
      .optional()
      .openapi({ description: "填空卡空位；kind=cloze 时必填" }),
    verbatim: z.boolean().optional().openapi({
      description: "逐字判分开关；不传 = 沿用库内旧值",
    }),
    groupId: z.string().trim().min(1).max(120).nullable().optional().openapi({
      description: "分组；不传 = 沿用旧值，传 null = 移出分组",
    }),
  })
  .openapi("ExternalRecallCardUpsertRequest");

const RecallCardUpsertResponseSchema = z
  .object({
    cardId: z.number().int().describe("卡片的数字主键"),
    cardKey: z.string().describe("卡片文件内标识（与请求里的 cardId 相同）"),
    created: z
      .boolean()
      .describe("true = 本次新建；false = 覆盖了同 cardId 的既有卡片"),
    dryRun: z.boolean().optional().openapi({
      description: "仅预演时出现且恒为 true：业务数据没有变更",
    }),
  })
  .openapi("ExternalRecallCardUpsertResponse");

const recallCardUpsertRoute = createRoute({
  method: "post",
  path: "/recall/cards",
  middleware: [requireScopeMiddleware("write")] as const,
  summary: "新建或修改一张回忆卡",
  description:
    "写接口，需 write 作用域。卡片内容全局共享，写入**不会**重置任何人的复习进度。校验规则与整包导入一致（列举 1–6 条、每空 1–3 个可接受答案）。卡组不存在返回 404，内容非法返回 400（带 issues）。",
  request: {
    query: DryRunQuerySchema,
    body: {
      // 必填：否则缺失的 body 会被校验成 `{}`，一路走到服务层才炸成 500
      required: true,
      content: {
        "application/json": { schema: RecallCardUpsertRequestSchema },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: RecallCardUpsertResponseSchema },
      },
      description: "已写入（新建或更新）",
    },
    400: {
      description: "内容校验失败（带 issues）/ kind 与 items/blanks 不匹配",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足（需要 write）" },
    429: RateLimitedResponse,
    404: { description: "卡组不存在" },
    500: { description: "服务器内部错误" },
  },
});

app.openapi(recallCardUpsertRoute, async (c) => {
  const identity = requireIdentity(c);
  const body = c.req.valid("json");
  const dryRun = wantsDryRun(c.req.valid("query"));

  try {
    const { cardId, created } = await upsertCard(
      identity.effectiveUserId,
      {
        deckKey: body.deckKey,
        cardId: body.cardId,
        prompt: body.prompt,
        kind: body.kind,
        items: body.items,
        blanks: body.blanks,
        verbatim: body.verbatim,
        groupId: body.groupId,
      },
      { dryRun },
    );

    return c.json(
      {
        cardId,
        cardKey: body.cardId,
        created,
        ...(dryRun ? { dryRun: true as const } : {}),
      },
      200,
    );
  } catch (err) {
    // audit-allow: 统一交给 recallErrorResponse 归类（业务错误 → 4xx 带可读原因，
    //   未知错误已在那里记结构化日志后回 500），此处不再重复记日志
    return toErrorResponse(c, err, { scope: "external.recall" });
  }
});

// ---------- DELETE /recall/decks/:deckKey/cards/:cardKey ----------

const recallCardDeleteRoute = createRoute({
  method: "delete",
  path: "/recall/decks/{deckKey}/cards/{cardKey}",
  middleware: [requireScopeMiddleware("write")] as const,
  summary: "删除一张回忆卡（含其全部作答日志与进度）",
  description:
    "写接口，需 write 作用域。删除是全局的：卡片内容共存，删除后所有用户都看不到它，其作答日志与进度一并删除（与界面上的删除行为一致）。卡组或卡片不存在返回 404。",
  request: {
    query: DryRunQuerySchema,
    params: z.object({
      deckKey: z.string().describe("卡组标识"),
      cardKey: z.string().describe("卡片在卡组内的标识（文件里的 cardId）"),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            cardId: z.number().int().describe("被删除卡片的数字主键"),
            cardKey: z.string().describe("被删除卡片的文件内标识"),
            deleted: z
              .boolean()
              .describe(
                "true = 真的删掉了；false = 预演（dryRun），库内没有任何变更",
              ),
            reviewLogs: z
              .number()
              .int()
              .describe("本次删除的作答日志条数（全局，含其他用户）"),
            cardStates: z
              .number()
              .int()
              .describe("本次删除的复习进度行数（全局，含其他用户）"),
            dryRun: z.boolean().optional().openapi({
              description:
                '仅预演时出现且恒为 true：本次没有删除，计数是"真执行会删掉多少"',
            }),
          }),
        },
      },
      description: "已删除（预演时只返回将删除的计数）",
    },
    400: {
      description:
        "参数校验失败（如 dryRun 取值不是 true/false）—— 此时不会删除任何东西",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足（需要 write）" },
    429: RateLimitedResponse,
    404: { description: "卡组不存在 / 卡片不在该卡组里" },
    500: { description: "服务器内部错误" },
  },
});

app.openapi(recallCardDeleteRoute, async (c) => {
  const identity = requireIdentity(c);
  const { deckKey, cardKey } = c.req.valid("param");
  const dryRun = wantsDryRun(c.req.valid("query"));

  try {
    const { cardId, reviewLogs, cardStates } = await deleteCard(
      identity.effectiveUserId,
      deckKey,
      cardKey,
      { dryRun },
    );
    return c.json(
      {
        cardId,
        cardKey,
        // 预演时什么都没删，deleted 不能回 true —— 否则调用方会以为已经生效
        deleted: !dryRun,
        reviewLogs,
        cardStates,
        ...(dryRun ? { dryRun: true as const } : {}),
      },
      200,
    );
  } catch (err) {
    // audit-allow: 统一交给 recallErrorResponse 归类（业务错误 → 4xx 带可读原因，
    //   未知错误已在那里记结构化日志后回 500），此处不再重复记日志
    return toErrorResponse(c, err, { scope: "external.recall" });
  }
});

export default app;
