#!/usr/bin/env node
/**
 * MCP server 冒烟测试（无第三方依赖）。
 *
 * 做两件事：
 *   1. 起一个本地 stub HTTP 服务冒充 ai-leaming 的 `/api/external/*`；
 *   2. 用 stdio 起真正的 server 进程，走一遍 initialize → tools/list → tools/call。
 *
 * 断言的是"接线正确"：工具数量、名字、以及一次真实调用把请求打到了正确的
 * 路径与鉴权头上。业务语义由后端测试覆盖，这里不重复。
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, "..", "dist", "index.js");

const seen = [];
const stub = createServer((req, res) => {
  seen.push({ method: req.method, url: req.url, auth: req.headers.authorization });
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ data: [], meta: { limit: 20, offset: 0, total: 0 } }));
});

await new Promise((resolve) => stub.listen(0, "127.0.0.1", resolve));
const port = stub.address().port;

const child = spawn(process.execPath, [entry], {
  env: {
    ...process.env,
    AI_LEAMING_BASE_URL: `http://127.0.0.1:${port}`,
    AI_LEAMING_API_KEY: "sk_smoke",
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let buffer = "";
const pending = new Map();
let nextId = 1;

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  let index;
  while ((index = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    const waiter = pending.get(message.id);
    if (waiter) {
      pending.delete(message.id);
      waiter(message);
    }
  }
});

function rpc(method, params) {
  const id = nextId++;
  const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  child.stdin.write(`${payload}\n`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${method} 超时（10s）`)),
      10_000,
    );
    pending.set(id, (message) => {
      clearTimeout(timer);
      resolve(message);
    });
  });
}

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

try {
  const init = await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke", version: "0.0.0" },
  });
  check(Boolean(init.result?.capabilities?.tools), "initialize 未声明 tools 能力");
  child.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
  );

  const list = await rpc("tools/list", {});
  const tools = list.result?.tools ?? [];
  check(tools.length === 11, `tools/list 应返回 11 个工具，实际 ${tools.length}`);
  check(
    tools.some((tool) => tool.name === "delete_recall_card"),
    "缺少 delete_recall_card",
  );
  check(
    tools.every((tool) => typeof tool.description === "string" && tool.description.length > 10),
    "有工具缺少可读描述（agent 靠描述选工具）",
  );

  const call = await rpc("tools/call", {
    name: "get_overview",
    arguments: {},
  });
  check(!call.error, `tools/call 返回错误：${JSON.stringify(call.error)}`);
  check(
    call.result?.content?.[0]?.text?.includes('"meta"'),
    "tools/call 没有把响应体原样带回来",
  );

  const hit = seen.at(-1);
  check(hit?.method === "GET", `期望 GET，实际 ${hit?.method}`);
  check(hit?.url === "/api/external/stats", `期望 /api/external/stats，实际 ${hit?.url}`);
  check(hit?.auth === "Bearer sk_smoke", `鉴权头不对：${hit?.auth}`);

  // 带路径参数的调用要真的替换掉占位符
  await rpc("tools/call", {
    name: "get_question",
    arguments: { id: "42" },
  });
  check(
    seen.at(-1)?.url === "/api/external/questions/42",
    `路径参数未替换：${seen.at(-1)?.url}`,
  );

  // 写工具的 dryRun 必须变成 query 而不是 body
  await rpc("tools/call", {
    name: "delete_recall_card",
    arguments: { deckKey: "d1", cardKey: "c1", dryRun: true },
  });
  check(
    seen.at(-1)?.method === "DELETE",
    `delete_recall_card 应为 DELETE，实际 ${seen.at(-1)?.method}`,
  );
  check(
    seen.at(-1)?.url === "/api/external/recall/decks/d1/cards/c1?dryRun=true",
    `dryRun 没拼进 query：${seen.at(-1)?.url}`,
  );
} finally {
  child.kill();
  stub.close();
}

if (failures.length > 0) {
  console.error(`✖ MCP 冒烟测试失败（${failures.length} 项）：`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("✔ MCP 冒烟测试通过：11 个工具、路径参数替换、dryRun 走 query、鉴权头正确。");
