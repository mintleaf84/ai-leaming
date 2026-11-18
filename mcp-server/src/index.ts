#!/usr/bin/env node
/**
 * ai-leaming MCP server（stdio）。
 *
 * 只做一件事：把我们已有的 `/api/external/*` 暴露成 MCP 工具，让 dsh 之类的
 * agent 客户端直接挂载。**不新增后端接口、不缓存状态、不做业务判断** ——
 * 幂等键、dry-run、限流、作用域全部由服务端负责，这里只是搬运。
 *
 * 环境变量：
 *   AI_LEAMING_BASE_URL  默认 http://localhost:3000
 *   AI_LEAMING_API_KEY   必填，`sk_` 开头的 API Key（read 只读，write 才能写）
 *
 * 工具清单见同目录 tools.json（唯一事实源，`npm run mcp:check` 会与
 * docs/openapi.json 对照，防止两边漂移）。
 */
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

type ParamType =
  "string" | "integer" | "number" | "boolean" | "array" | "object";

interface ParamDescriptor {
  name: string;
  in: "path" | "query" | "body";
  type: ParamType;
  required: boolean;
  description?: string;
  items?: { type: ParamType; properties?: Record<string, ParamDescriptor> };
}

interface ToolDescriptor {
  name: string;
  title: string;
  description: string;
  method: "GET" | "POST" | "DELETE";
  path: string;
  params: ParamDescriptor[];
}

const toolsFile = new URL("../tools.json", import.meta.url);
const { tools } = JSON.parse(readFileSync(toolsFile, "utf8")) as {
  tools: ToolDescriptor[];
};

const BASE_URL = (
  process.env.AI_LEAMING_BASE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");
const API_KEY = process.env.AI_LEAMING_API_KEY ?? "";

if (!API_KEY) {
  // 直接退出而不是降级成匿名：匿名请求只会拿到 401，agent 会把它误读成"服务坏了"
  process.stderr.write(
    "[ai-leaming-mcp] 缺少 AI_LEAMING_API_KEY（在 ai-leaming 的「设置 → API Key」里签发 sk_ 开头的 key）\n",
  );
  process.exit(1);
}

/** 把 JSON 里的类型描述翻成 zod schema（描述会进 tools/list，直接影响 agent 选工具） */
function toZod(param: ParamDescriptor): z.ZodTypeAny {
  // 路径参数一律接受 string | number 并转成字符串：agent 看到 cardId 是数字就直接传数字，
  // 严格只收 string 会把它变成一次无意义的调用失败（本脚本自己就踩过）
  if (param.in === "path") {
    const pathSchema = z
      .union([z.string(), z.number()])
      .transform((value) => String(value));
    return param.description
      ? pathSchema.describe(param.description)
      : pathSchema;
  }

  let schema: z.ZodTypeAny;
  switch (param.type) {
    case "integer":
      schema = z.number().int();
      break;
    case "number":
      schema = z.number();
      break;
    case "boolean":
      schema = z.boolean();
      break;
    case "array": {
      const itemSchema = param.items
        ? param.items.properties
          ? z.object(
              Object.fromEntries(
                Object.entries(param.items.properties).map(([key, value]) => [
                  key,
                  value.required ? toZod(value) : toZod(value).optional(),
                ]),
              ),
            )
          : z.union([z.string(), z.number()])
        : z.union([z.string(), z.number()]);
      schema = z.array(itemSchema);
      break;
    }
    case "object":
      schema = z.record(z.unknown());
      break;
    default:
      schema = z.string();
  }
  if (param.description) schema = schema.describe(param.description);
  return param.required ? schema : schema.optional();
}

interface BuiltRequest {
  url: string;
  init: RequestInit;
}

function buildRequest(
  tool: ToolDescriptor,
  args: Record<string, unknown>,
): BuiltRequest {
  let path = tool.path;
  const query = new URLSearchParams();
  const body: Record<string, unknown> = {};

  for (const param of tool.params) {
    const value = args[param.name];
    if (value === undefined || value === null) continue;

    if (param.in === "path") {
      path = path.replace(`{${param.name}}`, encodeURIComponent(String(value)));
    } else if (param.in === "query") {
      query.set(param.name, String(value));
    } else {
      body[param.name] = value;
    }
  }

  const qs = query.toString();
  const url = `${BASE_URL}/api/external${path}${qs ? `?${qs}` : ""}`;
  const hasBody = tool.method !== "GET" && Object.keys(body).length > 0;

  return {
    url,
    init: {
      method: tool.method,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      ...(hasBody ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30_000),
    },
  };
}

const server = new McpServer({ name: "ai-leaming", version: "0.1.0" });

for (const tool of tools) {
  const shape = Object.fromEntries(
    tool.params.map((param) => [param.name, toZod(param)]),
  );

  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: shape,
    },
    async (args: Record<string, unknown>) => {
      const { url, init } = buildRequest(tool, args ?? {});

      let response: Response;
      try {
        response = await fetch(url, init);
      } catch (err) {
        // 网络层失败要让 agent 知道"可以重试"，而不是当成"数据不存在"
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `请求失败（可重试）：${(err as Error).message}\n${init.method} ${url}`,
            },
          ],
        };
      }

      const text = await response.text();
      if (!response.ok) {
        const hint =
          response.status === 429
            ? `\n提示：被限流了，按 Retry-After（响应头或 body.retryAfter）等待后重试。`
            : response.status === 401
              ? `\n提示：API Key 无效或已停用，检查 AI_LEAMING_API_KEY。`
              : "";
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `HTTP ${response.status}\n${text}${hint}`,
            },
          ],
        };
      }

      return {
        content: [{ type: "text" as const, text }],
      };
    },
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);
