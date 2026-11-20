import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { wrongQuestionService } from "@/lib/services/wrong-question";
import { authMiddleware, getCurrentUser } from "@/lib/api/middlewares/auth";
import { parsePagination } from "@/lib/api/pagination";

const app = new OpenAPIHono();

// ==================== Schema 定义 ====================

const WrongQuestionSchema = z.object({
  questionId: z.string(),
  questionContent: z.string(),
  tags: z.array(z.string()),
  wrongCount: z.number(),
  lastWrongAt: z.string(),
  correctAnswer: z.string(),
  userLastAnswer: z.string(),
});

const WrongQuestionsByTagSchema = z.object({
  tag: z.string(),
  count: z.number(),
  questions: z.array(WrongQuestionSchema),
});

const StatsSchema = z.object({
  total: z.number(),
  recent: z.number(),
  frequent: z.number(),
});

const WrongQuestionDetailSchema = WrongQuestionSchema.extend({
  options: z.array(z.string()),
  explanation: z.string(),
  questionType: z.string(),
  historyLogs: z.array(
    z.object({
      timestamp: z.string(),
      userAnswer: z.string(),
      isCorrect: z.boolean(),
    }),
  ),
});

// ==================== GET / — 错题列表 ====================

const getListRoute = createRoute({
  method: "get",
  path: "/",
  middleware: [authMiddleware] as const,
  responses: {
    200: {
      content: { "application/json": { schema: z.array(WrongQuestionSchema) } },
      description: "获取错题列表（排除已掌握）",
    },
  },
});

app.openapi(getListRoute, async (c) => {
  const user = getCurrentUser(c);
  const result = await wrongQuestionService.listWrongBook(Number(user.id));

  return c.json(result, 200);
});

// ==================== GET /by-tag — 按知识点分组 ====================

const getByTagRoute = createRoute({
  method: "get",
  path: "/by-tag",
  middleware: [authMiddleware] as const,
  responses: {
    200: {
      content: {
        "application/json": { schema: z.array(WrongQuestionsByTagSchema) },
      },
      description: "按知识点分组的错题",
    },
  },
});

app.openapi(getByTagRoute, async (c) => {
  const user = getCurrentUser(c);
  const questions = await wrongQuestionService.listWrongBook(
    Number(user.id),
  );

  // 一道题有多个知识点时会在每个 tag 下各出现一次（既有口径）
  const tagMap = new Map<string, typeof questions>();
  questions.forEach((q) => {
    q.tags.forEach((tag) => {
      if (!tagMap.has(tag)) tagMap.set(tag, []);
      tagMap.get(tag)!.push(q);
    });
  });

  const result = Array.from(tagMap.entries())
    .map(([tag, qs]) => ({ tag, count: qs.length, questions: qs }))
    .sort((a, b) => b.count - a.count);

  return c.json(result, 200);
});

// ==================== GET /stats — 统计 ====================

const getStatsRoute = createRoute({
  method: "get",
  path: "/stats",
  middleware: [authMiddleware] as const,
  responses: {
    200: {
      content: { "application/json": { schema: StatsSchema } },
      description: "错题统计",
    },
  },
});

app.openapi(getStatsRoute, async (c) => {
  const user = getCurrentUser(c);
  const stats = await wrongQuestionService.getWrongBookStats(Number(user.id));

  return c.json(stats, 200);
});

// ==================== GET /random — 随机抽题 (智能权重) ====================

const getRandomRoute = createRoute({
  method: "get",
  path: "/random",
  middleware: [authMiddleware] as const,
  request: {
    query: z.object({
      count: z.string().optional().default("10").describe("抽题数量"),
      tag: z.string().optional().describe("按知识点筛选"),
      mode: z
        .enum(["priority", "random"])
        .optional()
        .default("priority")
        .describe("抽题模式: priority=加权优先, random=纯随机"),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(WrongQuestionSchema) } },
      description: "随机获取一组错题",
    },
  },
});

app.openapi(getRandomRoute, async (c) => {
  const user = getCurrentUser(c);
  const { count: limitStr, tag, mode } = c.req.valid("query");
  // 保留既有口径：最多 50 道，但非法/0/负数不再是 NaN 或 0
  const limitNum = parsePagination({ limit: limitStr }, { maxLimit: 50 }).limit;

  const result = await wrongQuestionService.pickWrongQuestions(
    Number(user.id),
    { limit: limitNum, tag, mode },
  );

  return c.json(result, 200);
});

// ==================== GET /:id — 单题详情 ====================

const getDetailRoute = createRoute({
  method: "get",
  path: "/:id",
  middleware: [authMiddleware] as const,
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: WrongQuestionDetailSchema } },
      description: "错题详情（含历史作答）",
    },
    404: { description: "未找到题目" },
  },
});

app.openapi(getDetailRoute, async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.valid("param");

  const detail = await wrongQuestionService.getWrongBookDetail(
    Number(user.id),
    Number(id),
  );

  if (!detail) return c.json({ error: "未找到题目" }, 404);

  return c.json(detail, 200);
});

// ==================== POST /practice — 创建错题练习 ====================

const CreatePracticeSchema = z.object({
  questionIds: z.array(z.string()).min(1),
});

const createPracticeRoute = createRoute({
  method: "post",
  path: "/practice",
  middleware: [authMiddleware] as const,
  request: {
    body: {
      content: { "application/json": { schema: CreatePracticeSchema } },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            sessionId: z.string().optional(),
            message: z.string().optional(),
          }),
        },
      },
      description: "创建错题练习会话",
    },
  },
});

app.openapi(createPracticeRoute, async (c) => {
  const user = getCurrentUser(c);
  const { questionIds } = c.req.valid("json");

  const sessionId = await wrongQuestionService.createWrongBookPracticeSession(
    Number(user.id),
    questionIds,
  );

  return c.json({ success: true, sessionId }, 200);
});

// ==================== POST /:id/master — 标记已掌握 ====================

const masterRoute = createRoute({
  method: "post",
  path: "/:id/master",
  middleware: [authMiddleware] as const,
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            message: z.string().optional(),
          }),
        },
      },
      description: "标记错题为已掌握",
    },
  },
});

app.openapi(masterRoute, async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.valid("param");

  // 幂等：已存在则只刷新 mastered_at（`markAsMastered` 的 upsert 语义）
  await wrongQuestionService.markAsMastered(Number(user.id), Number(id));

  return c.json({ success: true }, 200);
});

// ==================== DELETE /:id/master — 取消掌握 ====================

const unmasterRoute = createRoute({
  method: "delete",
  path: "/:id/master",
  middleware: [authMiddleware] as const,
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            message: z.string().optional(),
          }),
        },
      },
      description: "取消已掌握标记",
    },
  },
});

app.openapi(unmasterRoute, async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.valid("param");

  await wrongQuestionService.unmarkMastered(Number(user.id), Number(id));

  return c.json({ success: true }, 200);
});

export default app;
