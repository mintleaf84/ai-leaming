import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { historyService } from "@/lib/services/history";
import { authMiddleware, getCurrentUser } from "@/lib/api/middlewares/auth";

const app = new OpenAPIHono();

// Response Schemas
const HistoryItemSchema = z.object({
  id: z.string(),
  sessionName: z.string().optional(),
  totalQuestions: z.number(),
  correctCount: z.number(),
  reviewCount: z.number(),
  createdAt: z.string(),
  accuracy: z.number(),
  practiceMode: z.string().optional(),
});

const HistoryListSchema = z.object({
  items: z.array(HistoryItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
});

// List History
const listRoute = createRoute({
  method: "get",
  path: "/",
  middleware: [authMiddleware] as const,
  request: {
    query: z.object({
      page: z.string().optional().default("1"),
      pageSize: z.string().optional().default("10"),
      mode: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "User practice history",
      content: {
        "application/json": {
          schema: HistoryListSchema,
        },
      },
    },
  },
});

app.openapi(listRoute, async (c) => {
  const user = getCurrentUser(c);
  const { page, pageSize, mode } = c.req.valid("query");
  const pageNum = parseInt(page);
  const pageSizeNum = parseInt(pageSize);

  const result = await historyService.getHistory(Number(user.id), {
    page: pageNum,
    pageSize: pageSizeNum,
    mode: mode,
  });

  // Ensure optional fields are handled or stripped if undefined
  const items = result.items.map((item) => ({
    id: item.id,
    sessionName: item.sessionName,
    totalQuestions: item.totalQuestions,
    correctCount: item.correctCount,
    reviewCount: item.reviewCount,
    createdAt: item.createdAt,
    accuracy: item.accuracy,
    practiceMode: item.practiceMode,
  }));

  return c.json({
    items,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
  });
});

const SessionDetailSchema = z.object({
  session: HistoryItemSchema,
  logs: z.array(
    z.object({
      questionId: z.number(),
      questionContent: z.string(),
      options: z.array(z.string()),
      correctAnswer: z.string(),
      userAnswer: z.string(),
      isCorrect: z.boolean(),
      duration: z.number(),
      tags: z.array(z.string()),
      explanation: z.string().optional(),
      aiMnemonic: z.string().nullable().optional(),
    }),
  ),
});

// Get Session Detail
const getDetailRoute = createRoute({
  method: "get",
  path: "/:id",
  middleware: [authMiddleware] as const,
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: "Session detail",
      content: {
        "application/json": {
          schema: SessionDetailSchema,
        },
      },
    },
    404: {
      description: "Session not found",
    },
  },
});

app.openapi(getDetailRoute, async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.valid("param");

  const result = await historyService.getSessionDetail(Number(user.id), id);

  if (!result) {
    return c.json({ error: "Session not found" }, 404);
  }

  return c.json({
    session: result.session,
    logs: result.logs.map((l) => ({
      questionId: l.questionId,
      questionContent: l.questionContent,
      options: l.options,
      correctAnswer: l.correctAnswer,
      userAnswer: l.userAnswer,
      isCorrect: l.isCorrect,
      duration: l.duration,
      tags: l.tags,
      explanation: l.explanation,
      aiMnemonic: l.aiMnemonic,
    })),
  });
});

export default app;
