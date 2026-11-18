import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { authMiddleware, getCurrentUser } from "@/lib/api/middlewares/auth";
import {
  pdfImportService,
  PdfImportTaskNotFoundError,
} from "@/lib/services/pdf-import";
import { log } from "@/lib/logger";
import { AppError } from "@/lib/errors/app-error";
import { toErrorResponse } from "@/lib/api/error-response";

const app = new OpenAPIHono();

// POST /preview — multipart/form-data 接收 PDF 文件
const previewDef = createRoute({
  method: "post",
  path: "/preview",
  middleware: [authMiddleware] as const,
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            file: z.any(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.any() } },
      description: "预览结果",
    },
    400: { description: "无效文件" },
    500: { description: "解析失败" },
  },
});

app.openapi(previewDef, async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body["file"] as File;

    if (!file) return c.json({ error: "请上传文件" }, 400);
    if (file.type !== "application/pdf")
      return c.json({ error: "请上传 PDF 文件" }, 400);

    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return c.json(
        {
          error: `文件过大 (${(file.size / 1024 / 1024).toFixed(1)}MB)，上限 50MB`,
        },
        400,
      );
    }

    const user = getCurrentUser(c);
    const buffer = Buffer.from(await file.arrayBuffer());
    const { taskId, totalChunks } = await pdfImportService.ocrAndSplit(
      user.id,
      buffer,
      file.name,
      file.type,
    );

    return c.json({ taskId, totalChunks }, 200);
  } catch (e) {
    // 只把**领域错误**的文案透给客户端：数据库/驱动异常的 message 里可能带 SQL 与
    // 绑定参数（这张表的参数就是 OCR 原文），既不能回显也不能写进日志
    log.error("[PdfImportRoute] preview failed:", {
      errorName: e instanceof Error ? e.name : typeof e,
    });
    const message =
      e instanceof AppError ? e.publicMessage : "解析失败，请重试";
    return c.json({ error: message }, 500);
  }
});

// POST /parse-chunk — 解析单个块
const parseChunkDef = createRoute({
  method: "post",
  path: "/parse-chunk",
  middleware: [authMiddleware] as const,
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            taskId: z.string(),
            chunkIndex: z.number().int().min(0),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.any() } },
      description: "块解析结果",
    },
    400: { description: "无效参数" },
    404: { description: "任务不存在，或不属于当前用户" },
    500: { description: "解析失败" },
  },
});

app.openapi(parseChunkDef, async (c) => {
  const user = getCurrentUser(c);
  try {
    const body = await c.req.valid("json");
    const result = await pdfImportService.parseSingleChunk(
      user.id,
      body.taskId,
      body.chunkIndex,
    );
    return c.json(result, 200);
  } catch (e) {
    // 不存在与「不属于你」返回同一个 404（状态码由 AppError.kind 决定，不靠文案匹配）
    if (e instanceof PdfImportTaskNotFoundError) {
      return toErrorResponse(c, e, { scope: "pdf-import.parse-chunk" });
    }
    log.error("[PdfImportRoute] parse-chunk failed:", e);
    return c.json({ error: `解析失败: ${(e as Error).message}` }, 500);
  }
});

// POST /cleanup — 清理缓存（可选，解析全部完成后调用）
const cleanupDef = createRoute({
  method: "post",
  path: "/cleanup",
  middleware: [authMiddleware] as const,
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({ taskId: z.string() }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ ok: z.boolean() }) },
      },
      description: "清理结果",
    },
  },
});

app.openapi(cleanupDef, async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.valid("json");
  // 幂等：没删到东西（不存在 / 不是你的）也返回 200，但 `ok` 为 false。
  // 两种失败返回同一个形状，避免探测他人 taskId 是否存在。
  const ok = await pdfImportService.cleanup(user.id, body.taskId);
  return c.json({ ok }, 200);
});

// POST /text-import — 手动粘贴文本，跳过 OCR，直接分块
const textImportDef = createRoute({
  method: "post",
  path: "/text-import",
  middleware: [authMiddleware] as const,
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            text: z.string().min(20, "文本内容过短"),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ taskId: z.string(), totalChunks: z.number() }),
        },
      },
      description: "分块结果",
    },
    400: { description: "无效参数" },
    500: { description: "处理失败" },
  },
});

app.openapi(textImportDef, async (c) => {
  const user = getCurrentUser(c);
  try {
    const body = await c.req.valid("json");
    const { taskId, totalChunks } = await pdfImportService.splitText(
      user.id,
      body.text,
    );
    return c.json({ taskId, totalChunks }, 200);
  } catch (e) {
    log.error("[PdfImportRoute] text-import failed:", {
      errorName: e instanceof Error ? e.name : typeof e,
    });
    const message =
      e instanceof AppError ? e.publicMessage : "处理失败，请重试";
    return c.json({ error: message }, 500);
  }
});

// POST /confirm — JSON body
const confirmDef = createRoute({
  method: "post",
  path: "/confirm",
  middleware: [authMiddleware] as const,
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            questions: z.array(
              z.object({
                content: z.string(),
                options: z.array(z.string()),
                type: z.enum(["single", "multi", "truefalse"]),
                answer: z.string(),
                explanation: z.string(),
                confidence: z.number(),
                tags: z.array(z.string()),
              }),
            ),
            folderId: z.number().optional(),
            addToWrongBook: z.boolean().default(true),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.any() } },
      description: "导入结果",
    },
    500: { description: "导入失败" },
  },
});

app.openapi(confirmDef, async (c) => {
  const user = getCurrentUser(c);

  try {
    const body = await c.req.valid("json");
    const result = await pdfImportService.confirmImport(
      user.id,
      body.questions,
      body.folderId,
      body.addToWrongBook,
    );
    return c.json(result, 200);
  } catch (e) {
    log.error("[PdfImportRoute] confirm failed:", e);
    return c.json({ error: `导入失败: ${(e as Error).message}` }, 500);
  }
});

export default app;
