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
import { saveMessage } from "@/lib/services/chat";
import {
  buildEnhancedSystemPrompt,
  parseCommand,
  handleQuizCommand,
  handleExplainCommand,
} from "@/lib/services/chat-rag";
import { checkQuotaForApi } from "@/lib/billing/usage-middleware";

const app = new OpenAPIHono();

const ChatSchema = z.object({
  messages: z.array(z.record(z.unknown())),
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
    } catch {}
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
      } catch {}
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
              } catch {}
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
    console.error("[Hono Chat API] error:", error);
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

export default app;
