import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { questionService } from "@/lib/services/question";
import { authMiddleware } from "@/lib/api/middlewares/auth";

const app = new OpenAPIHono();

// Response Schema (Subset of DB schema for client)
const QuestionResponseSchema = z.object({
  id: z.number(),
  content: z.string(),
  options: z.array(z.string()),
  type: z.enum(["single", "multi"]).optional(),
  tags: z.array(z.string()),
  dimension: z.string().optional(),
});

const QuestionListSchema = z.object({
  items: z.array(QuestionResponseSchema),
  total: z.number(),
});

// List Questions
const listRoute = createRoute({
  method: "get",
  path: "/",
  middleware: [authMiddleware] as const,
  request: {
    query: z.object({
      page: z.string().optional().default("1"),
      limit: z.string().optional().default("20"),
      search: z.string().optional(),
      type: z.string().optional(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: QuestionListSchema,
        },
      },
      description: "List of questions",
    },
  },
});

app.openapi(listRoute, async (c) => {
  const { page, limit, search, type } = c.req.valid("query");
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);

  const result = await questionService.list({
    offset: (pageNum - 1) * limitNum,
    limit: limitNum,
    search,
    type: type ? [type] : undefined,
  });

  // Transform DB result to API response (handling validation/stripping)
  const items = result.items.map((q) => ({
    id: q.id,
    content: q.content,
    options: q.options,
    type: q.type === "single" || q.type === "multi" ? q.type : undefined,
    tags: q.tags,
    dimension: q.dimension,
  }));

  return c.json({
    items,
    total: result.total,
  });
});

// Get Question Detail
const getRoute = createRoute({
  method: "get",
  path: "/:id",
  middleware: [authMiddleware] as const,
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: QuestionResponseSchema.extend({
            explanation: z.string().optional(),
            answer: z.string().optional(), // Reveal answer in detail? Or only after submit?
            // Usually detail view implies study mode, so maybe yes.
          }),
        },
      },
      description: "Question detail",
    },
    404: {
      description: "Question not found",
    },
  },
});

app.openapi(getRoute, async (c) => {
  const { id } = c.req.valid("param");
  const question = await questionService.getById(parseInt(id));

  if (!question) {
    return c.json({ error: "Question not found" }, 404);
  }

  return c.json({
    id: question.id,
    content: question.content,
    options: question.options,
    type:
      question.type === "single" || question.type === "multi"
        ? question.type
        : undefined,
    tags: question.tags,
    dimension: question.dimension,
    explanation: question.explanation,
    answer: question.answer,
  });
});

export default app;
