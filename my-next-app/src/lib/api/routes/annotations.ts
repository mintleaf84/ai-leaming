import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { authMiddleware, getCurrentUser } from "@/lib/api/middlewares/auth";
import { annotationService } from "@/lib/services/annotation";
import { log } from "@/lib/logger";

const app = new OpenAPIHono();

const _AnnotationSchema = z.object({
  id: z.number().optional(),
  startOffset: z.number(),
  endOffset: z.number(),
  tag: z.enum(["highlight", "underline", "wavy"]),
  color: z.string().nullable(),
});

/** GET /api/annotations */
const listAnnotationsDef = createRoute({
  method: "get",
  path: "",
  middleware: [authMiddleware] as const,
  request: {
    query: z.object({
      questionId: z.string().describe("题目ID"),
    }),
  },
  responses: {
    200: { description: "成功" },
    401: { description: "未授权" },
  },
});

app.openapi(listAnnotationsDef, async (c) => {
  const user = getCurrentUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { questionId } = c.req.valid("query");
  const annotations = await annotationService.list(
    Number(user.id),
    parseInt(questionId),
  );

  return c.json({ annotations });
});

/** POST /api/annotations */
const createAnnotationDef = createRoute({
  method: "post",
  path: "",
  middleware: [authMiddleware] as const,
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            questionId: z.number(),
            startOffset: z.number(),
            endOffset: z.number(),
            tag: z.enum(["highlight", "underline", "wavy"]),
            color: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: "成功" },
    401: { description: "未授权" },
  },
});

app.openapi(createAnnotationDef, async (c) => {
  const user = getCurrentUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const { questionId, startOffset, endOffset, tag, color } =
      c.req.valid("json");

    const id = await annotationService.upsert({
      userId: Number(user.id),
      questionId,
      startOffset,
      endOffset,
      tag,
      color,
    });

    return c.json({
      id,
      message: "标注已保存",
    });
  } catch (err) {
    log.error("[annotations] 创建标注失败:", err);
    return c.json({ error: "创建标注失败", detail: String(err) }, 500);
  }
});

/** DELETE /api/annotations */
const deleteAnnotationDef = createRoute({
  method: "delete",
  path: "",
  middleware: [authMiddleware] as const,
  request: {
    query: z.object({
      id: z.string().describe("标注ID"),
    }),
  },
  responses: {
    200: { description: "成功" },
    404: { description: "不存在" },
  },
});

app.openapi(deleteAnnotationDef, async (c) => {
  const user = getCurrentUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { id } = c.req.valid("query");
  const deleted = await annotationService.remove(Number(user.id), parseInt(id));

  if (!deleted) return c.json({ error: "标注不存在或无权删除" }, 404);
  return c.json({ message: "标注已删除" });
});

export default app;
