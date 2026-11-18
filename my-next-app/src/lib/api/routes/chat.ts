import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getErrorMessage } from "@/lib/utils/error";
import { authMiddleware, getCurrentUser } from "@/lib/api/middlewares/auth";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import type { UIMessage } from "ai";
import type { ToolSet } from "ai";
import { streamChatWrapper } from "@/lib/ai/client";
import {
  createSession,
  deleteSession,
  getSession,
  getSessionMessages,
  listSessions,
  saveMessage,
} from "@/lib/services/chat";
import {
  buildEnhancedSystemPrompt,
  parseCommand,
  handleQuizCommand,
  handleExplainCommand,
} from "@/lib/services/chat-rag";
import { checkQuotaForApi } from "@/lib/billing/usage-middleware";
import { logger } from "@/lib/logger";

const app = new OpenAPIHono();

const ChatSchema = z.object({
  messages: z.array(z.record(z.string(), z.unknown())),
  sessionId: z.number().optional(),
  enableRag: z.boolean().optional(),
  context: z.string().optional(),
  mode: z.enum(["standard", "socratic"]).optional(),
});

const chatRoute = createRoute({
  method: "post",
  path: "/",
  middleware: [authMiddleware] as const,
  request: {
    body: {
      content: {
        "application/json": {
          schema: ChatSchema,
        },
      },
    },
  },
  responses: {
    200: { description: "成功 (流式或指令响应)" },
    401: { description: "未授权" },
    429: { description: "配额超限" },
    500: { description: "服务器错误" },
  },
});

app.openapi(chatRoute, async (c) => {
  const user = getCurrentUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const userId = user.id;

  const { messages, sessionId, enableRag, context, mode } = c.req.valid("json");

  const toUiMessage = (raw: unknown, index: number): UIMessage => {
    const msg = raw as Record<string, unknown>;
    const id =
      typeof msg.id === "string" && msg.id
        ? msg.id
        : `legacy-${Date.now()}-${index}`;
    const role =
      msg.role === "assistant" || msg.role === "system" ? msg.role : "user";

    if (Array.isArray(msg.parts)) {
      return {
        id,
        role,
        parts: msg.parts,
      } as UIMessage;
    }

    return {
      id,
      role,
      parts: [
        {
          type: "text",
          text: typeof msg.content === "string" ? msg.content : "",
        },
      ],
    } as UIMessage;
  };

  const uiMessages = (Array.isArray(messages) ? messages : []).map((m, i) =>
    toUiMessage(m, i),
  );

  const extractTextFromMessage = (message: UIMessage | undefined): string => {
    if (!message || !Array.isArray(message.parts)) return "";
    return message.parts
      .map((part) => {
        const p = part as Record<string, unknown>;
        if (p.type === "text" && typeof p.text === "string") {
          return p.text;
        }
        return "";
      })
      .join("");
  };

  // 1. 用量检查
  const quotaCheck = await checkQuotaForApi(userId, "ai_chat");
  if (quotaCheck) return c.json(quotaCheck.error, 429);

  // 2. 保存用户消息
  const lastUserMessage = [...uiMessages]
    .reverse()
    .find((m) => m.role === "user");
  const lastUserText = extractTextFromMessage(lastUserMessage);

  if (sessionId && lastUserText) {
    try {
      await saveMessage(userId, sessionId, "user", lastUserText);
    } catch (err) {
      // audit-allow: 聊天记录落库失败不应中断流式回答，已 warn 记录
      logger.warn({ err, sessionId }, "保存用户消息失败，继续生成回答");
    }
  }

  // 3. 检查指令
  const { type, keyword } = parseCommand(lastUserText);

  if (type !== "none") {
    let commandResponse = "";
    if (type === "quiz") commandResponse = await handleQuizCommand(keyword);
    else if (type === "explain")
      commandResponse = await handleExplainCommand(keyword);

    if (sessionId) {
      try {
        await saveMessage(userId, sessionId, "assistant", commandResponse);
      } catch (err) {
        // audit-allow: 同上，落库失败不阻断响应
        logger.warn({ err, sessionId }, "保存助手消息失败");
      }
    }

    const commandStream = createUIMessageStream({
      execute: ({ writer }) => {
        const textId = `cmd-${Date.now()}`;
        writer.write({ type: "start" });
        writer.write({ type: "start-step" });
        writer.write({ type: "text-start", id: textId });
        writer.write({
          type: "text-delta",
          id: textId,
          delta: commandResponse,
        });
        writer.write({ type: "text-end", id: textId });
        writer.write({ type: "finish-step" });
        writer.write({ type: "finish", finishReason: "stop" });
      },
    });

    return createUIMessageStreamResponse({ stream: commandStream });
  }

  // 4. 流式生成
  let tools: ToolSet | undefined = undefined;
  const systemPrompt = await buildEnhancedSystemPrompt(context, mode);

  if (enableRag) {
    const { knowledgeSearchTool } = await import("@/lib/services/chat-rag");
    tools = { knowledgeSearch: knowledgeSearchTool } as unknown as ToolSet;
  }

  try {
    const modelMessages = await convertToModelMessages(uiMessages);

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        writer.write({
          type: "data-chat-meta",
          data: {
            sessionId: sessionId ?? null,
            ragEnabled: Boolean(enableRag),
            mode: mode ?? "standard",
            quotaType: "ai_chat",
          },
        });

        const result = await streamChatWrapper(
          modelMessages,
          async (fullResponse) => {
            if (sessionId) {
              try {
                await saveMessage(userId, sessionId, "assistant", fullResponse);
              } catch (err) {
                // audit-allow: 流式结束后的落库失败不影响已经返回给用户的内容
                logger.warn({ err, sessionId }, "保存完整助手回复失败");
              }
            }
          },
          tools,
          systemPrompt,
        );

        writer.merge(result.toUIMessageStream());
      },
      originalMessages: uiMessages,
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error: unknown) {
    logger.error({ err: error }, "[Hono Chat API] error");
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

const SessionIdParamSchema = z.object({
  id: z.string().min(1),
});

const CreateSessionBodySchema = z.object({
  title: z.string().min(1).max(100).optional(),
});

const SessionListSchema = z.object({
  id: z.number(),
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  message_count: z.number(),
});

const MessageSchema = z.object({
  id: z.number(),
  session_id: z.number(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  is_favorite: z.number(),
  created_at: z.string(),
});

// GET /sessions — 会话列表（Flutter 读 data['sessions']）
const listSessionsRoute = createRoute({
  method: "get",
  path: "/sessions",
  middleware: [authMiddleware] as const,
  request: {
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }),
  },
  responses: {
    200: {
      description: "会话列表",
      content: {
        "application/json": {
          schema: z.object({
            sessions: z.array(SessionListSchema),
          }),
        },
      },
    },
    401: { description: "未授权" },
    500: { description: "服务器错误" },
  },
});

app.openapi(listSessionsRoute, async (c) => {
  const user = getCurrentUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { limit } = c.req.valid("query");

  try {
    const sessions = await listSessions(Number(user.id), limit);
    return c.json({ sessions });
  } catch (error: unknown) {
    logger.error({ err: error }, "[Hono Chat API] listSessions error");
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

// POST /sessions — 新建会话（Flutter 读 data['sessionId']）
const createSessionRoute = createRoute({
  method: "post",
  path: "/sessions",
  middleware: [authMiddleware] as const,
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateSessionBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "新会话 id",
      content: {
        "application/json": {
          schema: z.object({
            sessionId: z.number(),
          }),
        },
      },
    },
    401: { description: "未授权" },
    500: { description: "服务器错误" },
  },
});

app.openapi(createSessionRoute, async (c) => {
  const user = getCurrentUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { title } = c.req.valid("json");

  try {
    const sessionId = await createSession(Number(user.id), title);
    return c.json({ sessionId });
  } catch (error: unknown) {
    logger.error({ err: error }, "[Hono Chat API] createSession error");
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

// GET /sessions/:id — 会话详情含消息（Flutter 读 data['messages']）
const getSessionRoute = createRoute({
  method: "get",
  path: "/sessions/{id}",
  middleware: [authMiddleware] as const,
  request: {
    params: SessionIdParamSchema,
  },
  responses: {
    200: {
      description: "会话详情",
      content: {
        "application/json": {
          schema: z.object({
            session: SessionListSchema,
            messages: z.array(MessageSchema),
          }),
        },
      },
    },
    401: { description: "未授权" },
    404: { description: "会话不存在" },
    500: { description: "服务器错误" },
  },
});

app.openapi(getSessionRoute, async (c) => {
  const user = getCurrentUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { id } = c.req.valid("param");
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId)) {
    return c.json({ error: "会话不存在" }, 404);
  }

  const userId = Number(user.id);

  try {
    const session = await getSession(userId, sessionId);
    if (!session) {
      return c.json({ error: "会话不存在" }, 404);
    }
    const messages = await getSessionMessages(userId, sessionId);
    return c.json({ session, messages });
  } catch (error: unknown) {
    logger.error({ err: error }, "[Hono Chat API] getSession error");
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

// DELETE /sessions/:id — 删除会话（级联消息）
const deleteSessionRoute = createRoute({
  method: "delete",
  path: "/sessions/{id}",
  middleware: [authMiddleware] as const,
  request: {
    params: SessionIdParamSchema,
  },
  responses: {
    200: {
      description: "删除成功",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
          }),
        },
      },
    },
    401: { description: "未授权" },
    404: { description: "会话不存在" },
    500: { description: "服务器错误" },
  },
});

app.openapi(deleteSessionRoute, async (c) => {
  const user = getCurrentUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { id } = c.req.valid("param");
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId)) {
    return c.json({ error: "会话不存在" }, 404);
  }

  const userId = Number(user.id);
  const session = await getSession(userId, sessionId);
  if (!session) {
    return c.json({ error: "会话不存在" }, 404);
  }

  try {
    await deleteSession(userId, sessionId);
    return c.json({ success: true });
  } catch (error: unknown) {
    logger.error({ err: error }, "[Hono Chat API] deleteSession error");
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

export default app;
