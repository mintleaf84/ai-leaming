import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getErrorMessage } from "@/lib/utils/error";
import { practiceService } from "@/lib/services/practice";
import {
  importService,
  InvalidQuestionIdsError,
} from "@/lib/services/import-service";
import { authMiddleware, getCurrentUser } from "@/lib/api/middlewares/auth";
import { toErrorResponse } from "@/lib/api/error-response";
import { log, logger } from "@/lib/logger";

const app = new OpenAPIHono();

const CreateSessionSchema = z.object({
  mode: z.enum(["random", "wrong", "tag", "first-principles"]),
  limit: z.number().default(10),
});

const SubmitAnswerSchema = z.object({
  questionId: z.number(),
  userAnswer: z.string(),
  duration: z.number(),
});

// Create Session
const createSessionRoute = createRoute({
  method: "post",
  path: "/session",
  middleware: [authMiddleware] as const,
  request: {
    body: {
      content: {
        "application/json": { schema: CreateSessionSchema },
      },
    },
  },
  responses: {
    200: {
      description: "Session created",
      content: {
        "application/json": {
          schema: z.object({
            sessionId: z.string(),
            questions: z.array(
              z.object({
                id: z.number(),
                content: z.string(),
                options: z.array(z.string()),
                type: z.string().optional(),
                material: z.string().nullable().optional(),
                material_html: z.string().nullable().optional(),
              }),
            ),
          }),
        },
      },
    },
    400: {
      description: "Invalid input",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
});

app.openapi(createSessionRoute, async (c) => {
  const user = getCurrentUser(c);
  const { mode, limit } = c.req.valid("json");

  // Simplification: only random supported for now via createRandomSession
  if (mode !== "random") {
    return c.json(
      { error: "Only random mode supported currently via API" },
      400,
    );
  }

  const result = await practiceService.createRandomSession(user.id, limit);

  return c.json(
    {
      sessionId: result.sessionId,
      questions: result.questions.map((q) => ({
        id: q.id,
        content: q.content,
        options: q.options,
        type: q.type,
        material: q.material ?? null,
        material_html: q.material_html ?? null,
      })),
    },
    200,
  );
});

// Get Session Questions
// 用途：错题本 `/wrong-book/practice` 只创建了会话行（questions_json 存 id 列表），
// 客户端需要按 sessionId 取回待作答的题目。复用 practiceService.getSessionById，
// 不在这里重写 questions_json 解析（两处解析必然漂移）。
const getSessionRoute = createRoute({
  method: "get",
  path: "/session/{sessionId}",
  middleware: [authMiddleware] as const,
  request: {
    params: z.object({ sessionId: z.string() }),
  },
  responses: {
    200: {
      description: "Session questions",
      content: {
        "application/json": {
          schema: z.object({
            sessionId: z.string(),
            questions: z.array(
              z.object({
                id: z.number(),
                content: z.string(),
                options: z.array(z.string()),
                type: z.string().optional(),
                material: z.string().nullable().optional(),
                material_html: z.string().nullable().optional(),
              }),
            ),
            completedCount: z.number(),
            practiceMode: z.string().optional(),
          }),
        },
      },
    },
    404: {
      description: "练习会话不存在（或不属于当前用户）",
      content: {
        "application/json": { schema: z.object({ error: z.string() }) },
      },
    },
  },
});

app.openapi(getSessionRoute, async (c) => {
  const user = getCurrentUser(c);
  const { sessionId } = c.req.valid("param");

  const session = await practiceService.getSessionById(user.id, sessionId);

  // 不属于当前用户时同样返回 404，不泄露 id 是否存在（与仓库既有约定一致）
  if (!session) {
    return c.json({ error: "练习会话不存在" }, 404);
  }

  return c.json(
    {
      sessionId: session.sessionId,
      questions: session.questions.map((q) => ({
        id: q.id,
        content: q.content,
        options: q.options,
        type: q.type,
        material: q.material ?? null,
        material_html: q.material_html ?? null,
      })),
      completedCount: session.completedCount ?? 0,
      practiceMode: session.practiceMode,
    },
    200,
  );
});

// 离线答题回传
// 场景：Flutter 端断网时在本地作答，回连后整批补交。语义与
// `/api/external/practice/answers` 完全一致（同一 sessionKey 只算一次、
// 写 practice_sessions + practice_logs + 掌握度），差别只在鉴权：
// 这里走用户 JWT，移动端不需要持有 API Key。
// 判分信任客户端：离线时没有服务端答案，只能本地判定，这一点与 external 一致。
const OfflineAnswerSchema = z.object({
  questionId: z.number().int().positive(),
  userAnswer: z.string().nullable().optional(),
  isCorrect: z.boolean(),
  durationMs: z.number().int().min(0).nullable().optional(),
});

const OfflineAnswersSchema = z.object({
  // 幂等键：客户端用本地会话 uuid，跨重试稳定（不允许每次重试重新生成）
  sessionKey: z.string().min(1).max(200),
  sessionName: z.string().max(200).optional(),
  answers: z.array(OfflineAnswerSchema).min(1).max(500),
});

const offlineAnswersRoute = createRoute({
  method: "post",
  path: "/offline-answers",
  middleware: [authMiddleware] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: OfflineAnswersSchema } },
    },
  },
  responses: {
    200: {
      description: "导入成功（或幂等命中）",
      content: {
        "application/json": {
          schema: z.object({
            sessionId: z.string(),
            inserted: z.number().int(),
            duplicated: z.boolean(),
          }),
        },
      },
    },
    400: { description: "请求体校验失败 / 存在题库中不存在的 questionId" },
  },
});

app.openapi(offlineAnswersRoute, async (c) => {
  const user = getCurrentUser(c);
  const body = c.req.valid("json");

  try {
    const result = await importService.importAgentAnswers(user.id, body);
    return c.json(result, 200);
  } catch (err) {
    if (err instanceof InvalidQuestionIdsError) {
      return c.json(
        {
          error: err.message,
          invalidQuestionIds: err.invalidQuestionIds.slice(0, 5),
        },
        400,
      );
    }
    logger.error({ err }, "[Practice] 离线答题回传失败");
    return c.json({ error: "服务器内部错误" }, 500);
  }
});

// Submit Answer
const submitRoute = createRoute({
  method: "post",
  path: "/session/{sessionId}/submit",
  middleware: [authMiddleware] as const,
  request: {
    params: z.object({ sessionId: z.string() }),
    body: {
      content: {
        "application/json": { schema: SubmitAnswerSchema },
      },
    },
  },
  responses: {
    200: {
      description: "Answer submitted",
      content: {
        "application/json": {
          schema: z.object({
            isCorrect: z.boolean(),
            correctAnswer: z.string(),
          }),
        },
      },
    },
    404: {
      description: "练习会话不存在（或不属于当前用户）",
    },
  },
});

app.openapi(submitRoute, async (c) => {
  const user = getCurrentUser(c);
  const { sessionId } = c.req.valid("param");
  const { questionId, userAnswer, duration } = c.req.valid("json");

  try {
    const result = await practiceService.submitAnswerWithValidation(
      user.id,
      sessionId,
      questionId,
      userAnswer,
      duration,
    );

    return c.json(
      {
        isCorrect: result.isCorrect,
        correctAnswer: result.correctAnswer || "",
      },
      200,
    );
  } catch (err) {
    // audit-allow: 统一交给 toErrorResponse 归类（业务错误 → 4xx；未知错误已在那里
    //   记结构化日志后回 500），此处再记一次会重复
    return toErrorResponse(c, err, { scope: "practice.submit" });
  }
});

// --- First Principles Logic ---

import { drizzleDb, drizzleSchema } from "@/lib/db";
import { eq, sql } from "drizzle-orm";
import { generateTextWrapper } from "@/lib/ai/client";
import { checkAndConsumeQuota } from "@/lib/billing/subscription-service";

// 确保缓存表存在 (在 LibSQL 环境下，建议通过迁移文件预创表，这里保留作为兜底，改为异步)
async function ensureCacheTable() {
  try {
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
  } catch (e) {
    // 缓存表创建失败不阻塞本次分析（下方按"无缓存"路径继续）
    log.error("[FirstPrinciples] 创建缓存表失败:", e);
    return;
  }
}

// 生成内容哈希
function generateHash(content: string): string {
  const normalized = content.trim().slice(0, 100) + content.length;
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

const FirstPrinciplesSchema = z.object({
  questionContent: z.string(),
  explanation: z.string().optional(),
  wrongAnswer: z.string().optional(),
  correctAnswer: z.string(),
});

const firstPrinciplesRoute = createRoute({
  method: "post",
  path: "/first-principles",
  middleware: [authMiddleware] as const,
  request: {
    body: {
      content: {
        "application/json": { schema: FirstPrinciplesSchema },
      },
    },
  },
  responses: {
    200: {
      description: "Analysis result",
      content: {
        "application/json": {
          schema: z.object({
            analysis: z.string(),
            cached: z.boolean(),
          }),
        },
      },
    },
    403: {
      description: "Quota exceeded",
    },
    500: {
      description: "Server error",
    },
  },
});

app.openapi(firstPrinciplesRoute, async (c) => {
  const user = getCurrentUser(c);
  const { questionContent, explanation, wrongAnswer, correctAnswer } =
    c.req.valid("json");

  try {
    await ensureCacheTable();
    const cacheKey = generateHash(
      questionContent + correctAnswer + (wrongAnswer || ""),
    );

    // 检查缓存
    const [cached] = await drizzleDb
      .select({ analysis: drizzleSchema.first_principles_cache.analysis })
      .from(drizzleSchema.first_principles_cache)
      .where(eq(drizzleSchema.first_principles_cache.question_hash, cacheKey))
      .limit(1);

    if (cached) {
      return c.json({ analysis: cached.analysis, cached: true });
    }

    // 检查配额
    const quotaResult = await checkAndConsumeQuota(
      Number(user.id),
      "first_principles",
    );
    if (!quotaResult.allowed) {
      return c.json({ error: quotaResult.message }, 403);
    }

    // 构建 Prompt
    const prompt = `请用"第一性原理"解析这道题。要求：
1. 直接给答案，只说底层逻辑，不超过200字
2. 不要使用黑话，用通俗易懂的语言
3. 严格基于提供的题目内容和选项进行分析，禁止引用题目中未提及的观点，禁止编造不存在的选项。

题目：${questionContent}
正确答案：${correctAnswer}
${wrongAnswer ? `用户选择：${wrongAnswer}` : ""}
${explanation ? `参考解析：${explanation}` : ""}

回复格式：
【答案】X
【核心逻辑】...`;

    // 调用 AI
    let text: string;
    try {
      const result = await generateTextWrapper(
        prompt,
        "economy",
        undefined,
        undefined,
        {
          timeout: 30000,
          retries: 1,
        },
      );
      text = result.text;
    } catch (aiError: unknown) {
      logger.error({ err: aiError }, "[FirstPrinciples] AI 分析失败");
      return c.json(
        {
          error: `AI 分析失败: ${aiError instanceof Error ? aiError.message : "Unknown error"}`,
        },
        500,
      );
    }

    // 保存到缓存
    try {
      await drizzleDb
        .insert(drizzleSchema.first_principles_cache)
        .values({
          question_hash: cacheKey,
          analysis: text,
        })
        .onConflictDoUpdate({
          target: drizzleSchema.first_principles_cache.question_hash,
          set: { analysis: text },
        });
    } catch (cacheError) {
      // 缓存写失败不影响本次分析结果：显式返回本次生成内容（与落到 catch 之后的路径等价）
      log.error("[FirstPrinciples] 缓存保存失败:", cacheError);
      return c.json({ analysis: text, cached: false });
    }

    return c.json({ analysis: text, cached: false });
  } catch (error: unknown) {
    log.error("[FirstPrinciples API] error:", error);
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

export default app;
