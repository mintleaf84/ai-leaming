import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { authMiddleware } from "@/lib/api/middlewares/auth";
import { importFenbiDataAction } from "@/server/actions/import";
import { logger } from "@/lib/logger";

const app = new OpenAPIHono();

const ImportFenbiSchema = z.object({
  exerciseJson: z.string(),
  solutionsJson: z.string(),
  statsJson: z.string().optional(),
});

const ImportResponseSchema = z.object({
  success: z.boolean(),
  sessionId: z.string().optional(),
  importedCount: z.number().optional(),
  newQuestionsCount: z.number().optional(),
  skippedQuestionsCount: z.number().optional(),
  duplicated: z.boolean().optional(),
  message: z.string(),
  error: z.string().optional(),
});

const importRoute = createRoute({
  method: "post",
  path: "/fenbi-webhook",
  middleware: [authMiddleware] as const,
  request: {
    body: {
      content: {
        "application/json": {
          schema: ImportFenbiSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ImportResponseSchema,
        },
      },
      description: "Import result",
    },
    500: {
      description: "Server error",
    },
  },
});

app.openapi(importRoute, async (c) => {
  const body = c.req.valid("json");

  try {
    const result = await importFenbiDataAction({
      exerciseJson: body.exerciseJson,
      solutionsJson: body.solutionsJson,
      statsJson: body.statsJson,
    });

    // safe-action 抛错时只返回 serverError，若不透出就会变成"导入失败"三字，
    // 脚本侧与用户都看不到真实原因（历史问题：错误被吞）。
    if (result.serverError) {
      return c.json(
        {
          success: false,
          message: `导入失败: ${result.serverError}`,
          error: result.serverError,
        },
        500,
      );
    }

    return c.json(result.data || { success: false, message: "导入失败" }, 200);
  } catch (e) {
    logger.error({ err: e }, "[Import] 导入失败");
    return c.json(
      {
        success: false,
        message: `导入失败: ${(e as Error).message}`,
        error: (e as Error).message,
      },
      500,
    );
  }
});

export default app;
