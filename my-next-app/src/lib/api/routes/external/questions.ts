/**
 * `/api/external` —— 题库（读：列表/详情；写：建题/改题/批量建题，需 admin 作用域）
 *
 * 拆分自 `routes/external.ts`；路径、方法、schema、中间件与错误文案均未改动。
 */
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { safeParseJson } from "@/lib/utils/json";
import { logger } from "@/lib/logger";
import { QuestionSchema } from "@/lib/schemas";
import { buildApiExternalId } from "@/lib/services/question-idempotency";
import {
  findQuestionById,
  findQuestionIdByExternalId,
  insertQuestionIfAbsent,
  listQuestionsPage,
  questionIdExists,
  updateQuestionWithSnapshot,
} from "@/lib/services/external/questions-service";
import {
  createQuestionsBatch,
  QUESTION_BATCH_MAX,
  ReservedExternalIdError,
  type QuestionBatchCreateInput,
} from "@/lib/services/question-batch";
import { indexQuestion } from "@/lib/services/question-vector-index";
import { touchesEmbeddingText } from "@/lib/services/question-index-policy";
import { parsePageParams } from "@/lib/api/pagination";
import {
  DryRunQuerySchema,
  RateLimitedResponse,
  formatIssues,
  parsePositiveInt,
  requireScopeMiddleware,
  wantsDryRun,
} from "./shared";

const app = new OpenAPIHono();

const ExternalQuestionSchema = z.object({
  id: z.number(),
  type: z.string().nullable().optional(),
  dimension: z.string().nullable().optional(),
  content: z.string(),
  options: z.array(z.string()),
  answer: z.string(),
  explanation: z.string().nullable().optional(),
  tags: z.array(z.string()),
});

const ExternalQuestionListSchema = z.object({
  data: z.array(ExternalQuestionSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

// ==================== 路由：获取题库列表 ====================

const listRoute = createRoute({
  method: "get",
  path: "/questions",
  request: {
    query: z.object({
      page: z.string().optional().default("1"),
      limit: z.string().optional().default("20"),
      tag: z.string().optional(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: ExternalQuestionListSchema },
      },
      description: "获取题库列表（分页）",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    429: RateLimitedResponse,
  },
});

app.openapi(listRoute, async (c) => {
  const { page, limit, tag } = c.req.valid("query");
  // `page` + `limit` 是外部题库接口独有的页码口径（其余接口统一 limit/offset），
  // 但解析规则与 `history` / `questions` 共用 `parsePageParams`：非法 page 回落 1、
  // 非法 limit 回落 20、limit 上限截到 100，offset 由它算好 —— 这里不再手写。
  const {
    page: pageNum,
    pageSize: limitNum,
    offset,
  } = parsePageParams({ page, limit }, { defaultPageSize: 20, maxPageSize: 100 });

  const { total, rows } = await listQuestionsPage({
    limit: limitNum,
    offset,
    tag,
  });

  // 反序列化 JSON 字符串字段
  const data = rows.map((row) => ({
    id: row.id,
    type: row.type || null,
    dimension: (row.dimension as string) || null,
    content: row.content,
    options: safeParseJson(row.options as string | null | undefined, []),
    answer: row.answer || "",
    explanation: row.explanation || null,
    tags: safeParseJson(row.tags as string | null | undefined, []),
  }));

  return c.json({
    data,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

// ==================== 路由：获取单道题目详情 ====================

const getRoute = createRoute({
  method: "get",
  path: "/questions/{id}",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: ExternalQuestionSchema },
      },
      description: "获取单道题目详情",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    404: { description: "题目不存在" },
    429: RateLimitedResponse,
  },
});

app.openapi(getRoute, async (c) => {
  const { id } = c.req.valid("param");

  // 与 PATCH 共用同一套解析：`parseInt("1e1")` 会得到 1，而 `Number("1e1")` 是 10，
  // 同一路径两套规则会让"读到的题"和"改到的题"不是同一道（评审指出过）
  const questionId = parsePositiveInt(id);
  if (questionId === null) {
    return c.json({ error: "题目 ID 必须是正整数" }, 400);
  }

  const row = await findQuestionById(questionId);

  if (!row) {
    return c.json({ error: "题目不存在" }, 404);
  }

  return c.json({
    id: row.id,
    type: row.type || null,
    dimension: (row.dimension as string) || null,
    content: row.content,
    options: safeParseJson(row.options as string | null | undefined, []),
    answer: row.answer || "",
    explanation: row.explanation || null,
    tags: safeParseJson(row.tags as string | null | undefined, []),
  });
});

// ==================== 题库写接口（admin 作用域） ====================
// 为什么是 admin 而不是 write：题库是**全局共享资产**，任何 write key 都能改它
// 等于把所有人的练习内容交给任意 agent。建/改题按 admin 作用域放行，签发时人工决定。
//
// 幂等键：内容指纹 `api:` + (题干 + 选项 + 答案)。同一份内容重复建题不新增行；
// 改题后指纹重算，与既有行撞键返回 409 而不是静默覆盖。

const QuestionWriteBodySchema = z
  .object({
    content: z.string().min(5).describe("题干，至少 5 个字符"),
    options: z
      .array(z.string().min(1))
      .max(10)
      .default([])
      .describe("选项文本；判断题固定两个、填空题可为空"),
    answer: z
      .string()
      .min(1)
      .describe(
        '正确答案：单选传标号（A）或多选传 JSON 数组字符串（["A","B"]），判断题 A/B，填空题为自由文本',
      ),
    explanation: z.string().min(5).describe("解析，至少 5 个字符"),
    tags: z.array(z.string().min(1)).min(1).describe("知识点标签，至少 1 个"),
    dimension: z
      .enum(["knowledge", "understanding", "application"])
      .describe("能力维度"),
    type: z
      .enum(["single", "multi", "truefalse", "fill_blank"])
      .default("single")
      .describe("题型，默认 single"),
  })
  .openapi("ExternalQuestionWriteBody");

const QuestionWriteResponseSchema = z
  .object({
    id: z
      .number()
      .int()
      .nullable()
      .describe("题目 ID；预演且内容不存在时为 null（不要拿它去调查详情接口）"),
    externalId: z.string().describe("内容指纹（幂等键，`api:` 前缀）"),
    duplicate: z
      .boolean()
      .describe("true = 同内容已存在，本次未新增（返回既有 id）"),
    dryRun: z.boolean().optional().openapi({
      description: "仅预演时出现且恒为 true：业务数据没有变更",
    }),
  })
  .openapi("ExternalQuestionWriteResponse");

const questionsCreateRoute = createRoute({
  method: "post",
  path: "/questions",
  middleware: [requireScopeMiddleware("admin")] as const,
  summary: "新建一道题（内容指纹幂等，需 admin 作用域）",
  description:
    "写接口，**需 admin 作用域**：题库是全局共享资产，write key 不能改。幂等键是内容指纹 `api:`+（题干+选项+答案）——同一份内容重复提交返回既有 `id` 且 `duplicate: true`，不会新增行。校验口径与后台导入完全一致（`QuestionSchema`）。预演传 `?dryRun=true`。",
  request: {
    query: DryRunQuerySchema,
    body: {
      required: true,
      content: { "application/json": { schema: QuestionWriteBodySchema } },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: QuestionWriteResponseSchema },
      },
      description: "已写入（或幂等命中既有题目）",
    },
    400: { description: "内容校验失败（带 issues）" },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足（需要 admin）" },
    429: RateLimitedResponse,
    500: { description: "服务器内部错误" },
  },
});

app.openapi(questionsCreateRoute, async (c) => {
  const body = c.req.valid("json");
  const dryRun = wantsDryRun(c.req.valid("query"));

  // 校验与后台导入共用同一份 schema：两处规则一旦分叉，同一道题会"后台能导、API 不能建"
  const parsed = QuestionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "内容校验失败", issues: formatIssues(parsed.error) },
      400,
    );
  }
  const data = parsed.data;
  const externalId = buildApiExternalId({
    content: data.content,
    options: data.options,
    answer: data.answer,
  });

  const existingId = await findQuestionIdByExternalId(externalId);

  if (existingId !== null) {
    return c.json(
      {
        id: existingId,
        externalId,
        duplicate: true,
        ...(dryRun ? { dryRun: true as const } : {}),
      },
      200,
    );
  }

  if (dryRun) {
    // 预演且库里没有这道题：不给假 ID（0 会被调用方当成真实题目去查详情）
    return c.json(
      { id: null, externalId, duplicate: false, dryRun: true as const },
      200,
    );
  }

  try {
    const insertedId = await insertQuestionIfAbsent({
      externalId,
      content: data.content,
      options: JSON.stringify(data.options),
      answer: data.answer,
      explanation: data.explanation,
      tags: JSON.stringify(data.tags),
      dimension: data.dimension as
        "knowledge" | "understanding" | "application",
      type: data.type,
    });

    // 并发窗口：预检没命中、插入时另一次请求先提交 → 唯一索引吞掉插入。
    // 回查要有限重试：胜出的那行可能在写入与回查之间被删掉，此时既不能返回
    // id:0 冒充"已存在"，也不能静默改口说"新建成功"
    if (insertedId === null) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const racedId = await findQuestionIdByExternalId(externalId);
        if (racedId !== null) {
          return c.json({ id: racedId, externalId, duplicate: true }, 200);
        }
        await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
      }
      logger.warn(
        { externalId },
        "[External] 建题冲突后读不到既有行（可能已被删除），提示重试",
      );
      return c.json(
        { error: "建题冲突后未能读到既有题目，请重试", externalId },
        409,
      );
    }

    // 建完立刻重建向量（不 await）：检索索引落后于题库会让 agent 检索不到新题
    void indexQuestion(insertedId).catch((err: unknown) => {
      logger.warn(
        { err, questionId: insertedId },
        "[External] 新题向量索引失败",
      );
    });

    return c.json({ id: insertedId, externalId, duplicate: false }, 200);
  } catch (err) {
    logger.error({ err }, "[External] 建题失败");
    return c.json({ error: "服务器内部错误" }, 500);
  }
});

// ---------- PATCH /questions/{id} ----------

// 不能用 QuestionWriteBodySchema.partial()：zod 的 `.default()` 在 partial 后仍会
// 补值，导致"只改解析"的请求被悄悄带上 type:"single"、options:[] 等默认值，
// 合并后把原有选项清空（校验直接 400），changed 也会谎报一堆没改的字段。
// 因此这里手写一份"无默认值、全可选"的 schema，真正的合法性交给合并后的 QuestionSchema。
const QuestionPatchBodySchema = z
  .object({
    content: z.string().min(5).optional(),
    options: z.array(z.string().min(1)).max(10).optional(),
    answer: z.string().min(1).optional(),
    explanation: z.string().min(5).optional(),
    tags: z.array(z.string().min(1)).min(1).optional(),
    dimension: z.enum(["knowledge", "understanding", "application"]).optional(),
    type: z.enum(["single", "multi", "truefalse", "fill_blank"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "至少要改一个字段",
  })
  .openapi("ExternalQuestionPatchBody");

const questionsPatchRoute = createRoute({
  method: "patch",
  path: "/questions/{id}",
  middleware: [requireScopeMiddleware("admin")] as const,
  summary: "修改一道题（需 admin 作用域）",
  description:
    "写接口，**需 admin 作用域**。部分更新：只改传了的字段，改完仍要整体满足 `QuestionSchema`（否则 400 带 issues）。改题干/选项/答案会重算内容指纹；若新指纹与**另一道题**撞键返回 409（不静默合并）。预演传 `?dryRun=true`，返回将会变更的字段名。",
  request: {
    params: z.object({ id: z.string().describe("题目 ID") }),
    query: DryRunQuerySchema,
    body: {
      required: true,
      content: { "application/json": { schema: QuestionPatchBodySchema } },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            id: z.number().int(),
            externalId: z.string().describe("更新后的内容指纹"),
            changed: z.array(z.string()).describe("本次实际变更的字段名"),
            dryRun: z.boolean().optional().openapi({
              description: "仅预演时出现且恒为 true：业务数据没有变更",
            }),
          }),
        },
      },
      description: "已更新（或预演结果）",
    },
    400: { description: "合并后校验失败（带 issues）/ ID 非正整数" },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足（需要 admin）" },
    404: { description: "题目不存在" },
    409: {
      description:
        "两种冲突：改后内容与另一道题相同（带 conflictingId），或题目在你读取后被他人修改（code=question.patch.conflict，重读后重试）",
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
            conflictingId: z
              .number()
              .int()
              .optional()
              .describe("撞键时指向的另一道题的 ID"),
            code: z
              .string()
              .optional()
              .describe("乐观锁冲突时固定为 question.patch.conflict"),
          }),
        },
      },
    },
    429: RateLimitedResponse,
    500: { description: "服务器内部错误" },
  },
});

app.openapi(questionsPatchRoute, async (c) => {
  const { id } = c.req.valid("param");
  const patch = c.req.valid("json");
  const dryRun = wantsDryRun(c.req.valid("query"));

  const questionId = parsePositiveInt(id);
  if (questionId === null) {
    return c.json({ error: "题目 ID 必须是正整数" }, 400);
  }

  const existing = await findQuestionById(questionId);

  if (!existing) {
    return c.json({ error: `题目不存在：${questionId}` }, 404);
  }

  // 先记下"读到的版本"，写入时用它做乐观并发控制（见下方 where 条件）：
  // 两个请求各自读到同一版本时，后提交的那个会因为行已变而更新不到行，
  // 从而不会把前一次的编辑覆盖回旧值
  const snapshot = {
    content: existing.content,
    options: existing.options,
    answer: existing.answer,
  };

  const currentOptions = safeParseJson<string[]>(existing.options, []);
  const currentTags = safeParseJson<string[]>(existing.tags, []);

  // 合并只用于**校验**：部分更新同样不能产出"单选却只有一个选项"这类坏行。
  // 注意不能把 merged 整体写回库 —— 那会把未提交字段的默认值（type/dimension）落盘
  const merged = {
    content: patch.content ?? existing.content,
    options: patch.options ?? currentOptions,
    answer: patch.answer ?? existing.answer ?? "",
    explanation: patch.explanation ?? existing.explanation ?? "",
    tags: patch.tags ?? currentTags,
    dimension: patch.dimension ?? existing.dimension ?? "knowledge",
    type:
      patch.type ??
      (existing.type as "single" | "multi" | "truefalse" | "fill_blank") ??
      "single",
  };

  const parsed = QuestionSchema.safeParse(merged);
  if (!parsed.success) {
    return c.json(
      { error: "合并后校验失败", issues: formatIssues(parsed.error) },
      400,
    );
  }
  const data = parsed.data;

  // 只有客户端真的提交了、且值确实不同才算"变更"：
  // 原样回传当前值不该触发向量重建，也不该出现在回执里
  const nextValues: Record<string, unknown> = {};
  if (patch.content !== undefined && patch.content !== existing.content) {
    nextValues.content = data.content;
  }
  if (
    patch.options !== undefined &&
    JSON.stringify(patch.options) !== JSON.stringify(currentOptions)
  ) {
    nextValues.options = JSON.stringify(data.options);
  }
  if (patch.answer !== undefined && patch.answer !== existing.answer) {
    nextValues.answer = data.answer;
  }
  if (
    patch.explanation !== undefined &&
    patch.explanation !== existing.explanation
  ) {
    nextValues.explanation = data.explanation;
  }
  if (
    patch.tags !== undefined &&
    JSON.stringify(patch.tags) !== JSON.stringify(currentTags)
  ) {
    nextValues.tags = JSON.stringify(data.tags);
  }
  if (patch.dimension !== undefined && patch.dimension !== existing.dimension) {
    nextValues.dimension = data.dimension as
      "knowledge" | "understanding" | "application";
  }
  if (patch.type !== undefined && patch.type !== existing.type) {
    nextValues.type = data.type;
  }

  const changed = Object.keys(nextValues);

  // 指纹只在"内容三要素"真的变了时重算，且**只改自己这一域的键**：
  // 粉笔导入的行用上游题目 ID 当 external_id，被改成 api: 指纹后，
  // 下一次同 sourceKey 的导入就匹配不到它，会插出重复题（评审指出过）
  const contentTouched =
    nextValues.content !== undefined ||
    nextValues.options !== undefined ||
    nextValues.answer !== undefined;
  const ownsExternalId =
    existing.external_id === null ||
    existing.external_id === undefined ||
    existing.external_id.startsWith("api:");
  const externalId =
    contentTouched && ownsExternalId
      ? buildApiExternalId({
          content: data.content,
          options: data.options,
          answer: data.answer,
        })
      : (existing.external_id ??
        buildApiExternalId({
          content: data.content,
          options: data.options,
          answer: data.answer,
        }));

  if (externalId !== existing.external_id) {
    // 指纹撞到**别的**行：说明这次修改会让两道题变成同一道，交给人决定怎么处理
    const clashId = await findQuestionIdByExternalId(externalId);
    if (clashId !== null && clashId !== questionId) {
      return c.json(
        {
          error: `改后的内容与题目 ${clashId} 相同（内容指纹撞键）`,
          conflictingId: clashId,
        },
        409,
      );
    }
  }

  if (dryRun) {
    return c.json(
      { id: questionId, externalId, changed, dryRun: true as const },
      200,
    );
  }

  if (changed.length === 0) {
    // 提交了但没有实际差异：不写库、不重建向量，如实回执
    return c.json({ id: questionId, externalId, changed }, 200);
  }

  try {
    // 乐观并发控制：只更新"读到的那一版"；行已被别人改过就更新不到，
    // 由调用方重读后重试，而不是把别人的编辑覆盖回旧值
    const updatedIds = await updateQuestionWithSnapshot({
      questionId,
      nextValues,
      externalId,
      previousExternalId: existing.external_id,
      snapshot,
    });

    if (updatedIds.length === 0) {
      // 0 行有两种原因：题目被删了（404），或行在读到之后被改过（409 乐观锁冲突）。
      // 混成一种会让"题没了"被当成"稍后重试"
      if (!(await questionIdExists(questionId))) {
        return c.json({ error: `题目不存在：${questionId}` }, 404);
      }
      return c.json(
        {
          error: "题目在你读取之后已被他人修改，请重读后再提交",
          code: "question.patch.conflict",
        },
        409,
      );
    }

    if (
      touchesEmbeddingText(
        Object.fromEntries(changed.map((key) => [key, true])),
      )
    ) {
      void indexQuestion(questionId, { pruneOnSkip: true }).catch(
        (err: unknown) => {
          logger.warn({ err, questionId }, "[External] 改题后向量索引失败");
        },
      );
    }

    return c.json({ id: questionId, externalId, changed }, 200);
  } catch (err) {
    // 唯一索引冲突：两个不同题目同时改成同一指纹，先提交的成功、后提交的在这里炸。
    // 这类冲突是业务语义（409 + 谁占了），不是服务器故障（500）
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes("UNIQUE constraint failed") &&
      message.includes("external_id")
    ) {
      const holderId = await findQuestionIdByExternalId(externalId);
      return c.json(
        {
          error: holderId
            ? `改后的内容与题目 ${holderId} 相同（内容指纹撞键）`
            : "改后的内容与另一道题相同（内容指纹撞键）",
          ...(holderId !== null ? { conflictingId: holderId } : {}),
        },
        409,
      );
    }
    logger.error({ err }, "[External] 改题失败");
    return c.json({ error: "服务器内部错误" }, 500);
  }
});

// ==================== 题库批量建题（admin 作用域） ====================
// 与单题 `POST /questions` 的关系：同一个作用域（题库是全局资产）、同一份校验
// （`QuestionSchema`），差别在**幂等键**——批量导入的调用方手里有上游题号
// （粉笔的 `jz1680_jz00312` 这类），比内容指纹更稳：题干被修订也不会变成新题。
// 路径单独一条而不是复用 `POST /questions`：body 形状（单题 / 数组）与幂等语义
// 都不同，混在一条路由里会让契约和文档都说不清。

const QuestionBatchItemSchema = z
  .object({
    externalId: z.string().trim().min(1).max(200).optional().openapi({
      description:
        "幂等键（推荐）：上游题号这类跨重试稳定的标识。同一 externalId 重复提交只会落一行；省略时退回内容指纹（题干+选项+答案）。不能以 `api:` 开头——该前缀是服务端内容指纹保留的命名空间",
      example: "jz1680_jz00312",
    }),
    content: z.string().openapi({ description: "题干纯文本" }),
    options: z
      .array(z.string())
      .optional()
      .openapi({ description: "选项文本；判断题必须是两个、填空题可为空" }),
    answer: z.string().openapi({
      description:
        '正确答案：单选传标号（A）/ 多选题传 JSON 数组字符串（如 ["A","C"]）/ 判断题 A 或 B / 填空题为自由文本',
    }),
    explanation: z.string().openapi({
      description: "解析（至少 5 个字符，与 QuestionSchema 一致）",
    }),
    tags: z.array(z.string()).openapi({ description: "知识点标签，至少 1 个" }),
    dimension: z
      .enum(["knowledge", "understanding", "application"])
      .optional()
      .openapi({ description: "能力维度，省略时按 knowledge 落库" }),
    type: z
      .enum(["single", "multi", "truefalse", "fill_blank"])
      .optional()
      .openapi({ description: "题型，省略时按 single 落库" }),
    source: z
      .string()
      .max(200)
      .optional()
      .openapi({ description: "来源标识（原样落库，如 fenbi_import）" }),
    material: z
      .string()
      .optional()
      .openapi({ description: "材料原文（原样落库，可为空）" }),
  })
  .openapi("ExternalQuestionBatchItem");

const QuestionBatchBodySchema = z
  .object({
    questions: z
      .array(QuestionBatchItemSchema)
      .min(1)
      .max(QUESTION_BATCH_MAX)
      .openapi({
        description: `待建题目，1–${QUESTION_BATCH_MAX} 条；整批原子：任一条不合法则一条都不写`,
      }),
  })
  .openapi("ExternalQuestionBatchRequest");

const QuestionBatchItemResultSchema = z
  .object({
    index: z
      .number()
      .int()
      .describe("该条在请求 questions 数组里的下标（从 0 开始）"),
    externalId: z
      .string()
      .describe("实际使用的幂等键（请求没给 externalId 时是内容指纹）"),
    questionId: z
      .number()
      .int()
      .nullable()
      .describe(
        "题目 ID；预演且需要新建时为 null（不要拿 null 去调查详情接口）",
      ),
    status: z
      .enum(["created", "skipped"])
      .describe(
        "created = 本次新建；skipped = 命中既有题或批内重复（内容未被修改）",
      ),
  })
  .openapi("ExternalQuestionBatchItemResult");

const QuestionBatchResponseSchema = z
  .object({
    created: z.number().int().describe("本次新建条数"),
    skipped: z
      .number()
      .int()
      .describe("跳过条数（既有题 + 批内重复 externalId）"),
    items: z
      .array(QuestionBatchItemResultSchema)
      .describe("逐条结果，顺序与请求 questions 一致"),
    duplicate: z
      .boolean()
      .describe("true = 本次没有新建任何题（整批都是重复）"),
    dryRun: z.boolean().optional().openapi({
      description: "仅预演时出现且恒为 true：题库业务数据零变更",
    }),
  })
  .openapi("ExternalQuestionBatchResponse");

const questionsBatchCreateRoute = createRoute({
  method: "post",
  path: "/questions/batch",
  middleware: [requireScopeMiddleware("admin")] as const,
  summary: "批量建题（上游 externalId 幂等，需 admin 作用域）",
  description:
    "写接口，**需 admin 作用域**：题库是全局共享资产，write key 不能写。逐条校验复用 `QuestionSchema`（与后台导入、单题建题同一口径），**整批原子**：任一条不合法返回 400 且一条都不写。幂等：每条优先用 `externalId`，省略则退回内容指纹 `api:`+（题干+选项+答案）；命中既有题按 `skipped` 返回既有 `questionId`，**不更新内容**（改内容走 `PATCH /questions/{id}`）。预演传 `?dryRun=true`：只查不写，`created` 表示「会新建几条」。",
  request: {
    query: DryRunQuerySchema,
    body: {
      required: true,
      content: { "application/json": { schema: QuestionBatchBodySchema } },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: QuestionBatchResponseSchema },
      },
      description: "逐条结果（幂等命中按 skipped 返回，不报错）",
    },
    400: {
      description: "请求体校验失败 / 任一条内容不合法（整批未写入，带 issues）",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足（需要 admin）" },
    429: RateLimitedResponse,
    500: { description: "服务器内部错误" },
  },
});

/** 批量校验的 issue 截断条数：100 条全错时逐条回会把 400 响应撑到几十 KB */
const MAX_BATCH_ISSUES = 20;

/**
 * 批量建题的结构校验 issue → 契约里的字符串数组。
 *
 * `@hono/zod-openapi` 默认的 400 是框架体（`{success:false, error:{issues:[...]}}`），
 * 与批量契约 `{error, issues, issueCount}` 不是一回事：调用方按契约读 `issues`
 * 会拿到空数组，只能看到一句"请求体校验失败"。这里把 zod issue 拼成与处理器内
 * 语义校验**同一种**形状（`questions.<index>.<path>: <message>`），两处口径才一致。
 */
function mapBatchBodyIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const [root, index, ...rest] = issue.path;
    const path =
      root === "questions" && typeof index === "number"
        ? `questions.${index}.${rest.map(String).join(".") || "body"}`
        : issue.path.map(String).join(".") || "body";
    return `${path}: ${issue.message}`;
  });
}

app.openapi(
  questionsBatchCreateRoute,
  async (c) => {
    const body = c.req.valid("json");
    const dryRun = wantsDryRun(c.req.valid("query"));

    // 逐条复用 QuestionSchema：两处规则一旦分叉，会出现"后台能导、单题能建、批量不能"
    const issues: string[] = [];
    const items: QuestionBatchCreateInput[] = [];
    body.questions.forEach((raw, index) => {
      const { externalId, source, material, ...core } = raw;
      const parsed = QuestionSchema.safeParse({
        ...core,
        // 这两个默认值与后台导入一致：维度缺省 knowledge、题型缺省 single
        options: core.options ?? [],
        dimension: core.dimension ?? "knowledge",
      });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const path = issue.path.map(String).join(".");
          issues.push(`questions.${index}.${path || "body"}: ${issue.message}`);
        }
        return;
      }
      items.push({
        ...parsed.data,
        // QuestionSchema 的 dimension 是「三档枚举 or 任意字符串」，这里已经过
        // 枚举校验（schema 层），按契约类型收窄
        dimension: parsed.data
          .dimension as QuestionBatchCreateInput["dimension"],
        externalId,
        source,
        material,
      });
    });

    if (issues.length > 0) {
      return c.json(
        {
          error: "批量建题校验失败（整批未写入）",
          issues: issues.slice(0, MAX_BATCH_ISSUES),
          issueCount: issues.length,
        },
        400,
      );
    }

    try {
      const result = await createQuestionsBatch(items, { dryRun });

      if (!dryRun) {
        // 新题立刻重建检索向量（不 await）：索引落后会让 agent 检索不到刚建的题。
        // 失败只记 warn —— 建题本身已经成功，回 500 会让调用方重推整批
        for (const item of result.items) {
          if (item.status !== "created" || item.questionId === null) continue;
          const questionId = item.questionId;
          void indexQuestion(questionId).catch((err: unknown) => {
            logger.warn(
              { err, questionId },
              "[External] 批量建题后向量索引失败",
            );
          });
        }
      }

      return c.json(result, 200);
    } catch (err) {
      // 保留前缀：语义上是调用方输入错误（400 + issues），不是服务端故障。
      // 服务层在任何查询/写入之前统一拒绝，因此这里一条都没写
      if (err instanceof ReservedExternalIdError) {
        const reservedIssues = err.indexes.map(
          (index) => `questions.${index}.externalId: ${err.message}`,
        );
        return c.json(
          {
            error: "批量建题校验失败（整批未写入）",
            issues: reservedIssues.slice(0, MAX_BATCH_ISSUES),
            issueCount: reservedIssues.length,
          },
          400,
        );
      }
      // 真实故障（含事务失败）：整批已回滚，记结构化日志后按 500 返回
      logger.error({ err }, "[External] 批量建题失败");
      return c.json({ error: "服务器内部错误" }, 500);
    }
  },
  (result, c) => {
    // 结构校验（缺必填 / 类型错）发生在处理器之前：默认 400 是框架体，
    // 这里换成批量契约的形状，调用方不必为两种 400 写两套解析
    if (result.success) return;
    const issues = mapBatchBodyIssues(result.error);
    return c.json(
      {
        error: "批量建题校验失败（整批未写入）",
        issues: issues.slice(0, MAX_BATCH_ISSUES),
        issueCount: issues.length,
      },
      400,
    );
  },
);

// ==================== 工具函数 ====================

// JSON 解析统一走 @/lib/utils/json 的 safeParseJson（本文件原有的 safeJsonParse 是重复实现）

export default app;
