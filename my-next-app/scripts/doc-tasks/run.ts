/**
 * 计划 P1 + P3 的验收脚本（一条命令跑两条通道）。
 *
 *   npx tsx scripts/doc-tasks/run.ts           # HTTP + MCP 都跑
 *   npx tsx scripts/doc-tasks/run.ts --http    # 只跑 HTTP（P1）
 *   npx tsx scripts/doc-tasks/run.ts --mcp     # 只跑 MCP（P3）
 *
 * 做的事：
 *   1. 起一个**临时 SQLite**（`data/doc-tasks-<ts>.db`）并跑真实迁移；
 *   2. 直接落 fixture：用户 + write key + 笔记 + 导图（这三个没有外部写接口）；
 *   3. 通道 A：`runDocTasks` 走 `app.request`（等价于只在文档指导下打 /api/external）；
 *   4. 通道 B：把同一个 app 挂到 127.0.0.1 的临时端口，spawn `mcp-server` 的
 *      stdio 客户端，用 tools/call 再跑一遍同样的 4 个任务；
 *   5. 清理：关服务、删临时库。
 *
 * 为什么两条通道共用 fixture：任务本身要有"有错题可练、有笔记可读"的起点，
 * 否则测的是空库能不能返回 200。
 */
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..", "..");
const mcpDir = resolve(appRoot, "..", "mcp-server");

const mode = process.argv.includes("--http")
  ? "http"
  : process.argv.includes("--mcp")
    ? "mcp"
    : "both";

// 必须在 import "@/lib/db" 之前设置：库路径在模块加载时解析
const dbFileName = `doc-tasks-${Date.now()}.db`;
process.env.DB_FILENAME = dbFileName;
// 验收脚本不该依赖本地 .env：占位值让 env 校验过，AI 相关调用在这 4 个任务里用不到
process.env.JWT_SECRET ??= "doc-tasks-local-secret";
process.env.AI_API_KEY ??= "doc-tasks-placeholder";
// 验收脚本只看任务结果；审计降级/after 告警会刷屏，压到 error 级
process.env.LOG_LEVEL ??= "error";

const USER_ID = 9001;
const API_KEY = "doc-tasks-script-key";

async function main() {
  const { initDatabase, drizzleDb, drizzleSchema } = await import("@/lib/db");
  await initDatabase();

  await drizzleDb
    .insert(drizzleSchema.users)
    .values({
      id: USER_ID,
      username: "doc-tasks-script",
      password_hash: "not-a-real-hash",
    })
    .onConflictDoNothing();

  await drizzleDb
    .insert(drizzleSchema.api_keys)
    .values({
      key_string: API_KEY,
      is_active: 1,
      scopes: "write",
      user_id: USER_ID,
    })
    .onConflictDoNothing();

  await drizzleDb
    .insert(drizzleSchema.notes)
    .values({
      user_id: USER_ID,
      title: "教育法规要点",
      content:
        "《教育法》第三十七条：受教育者在入学、升学等方面依法享有平等权利。",
    })
    .onConflictDoNothing();

  await drizzleDb
    .insert(drizzleSchema.mindmaps)
    .values({
      user_id: USER_ID,
      title: "教育学总纲",
      content: "# 教育学\n\n- 教育目的\n- 教育制度",
    })
    .onConflictDoNothing();

  // 题库：seedData 可能已经有题，这里只补到"至少 3 道错题可练"
  const existing = await drizzleDb
    .select()
    .from(drizzleSchema.questions)
    .limit(3);
  if (existing.length < 3) {
    await drizzleDb.insert(drizzleSchema.questions).values([
      {
        content: "我国教育领域的基本法律是哪一部？",
        options: JSON.stringify(["《教育法》", "《教师法》", "《义务教育法》"]),
        answer: "A",
        explanation: "《教育法》是教育领域的基本法律。",
        tags: JSON.stringify(["教育法规"]),
        type: "single",
        dimension: "knowledge",
      },
      {
        content: "皮亚杰认知发展理论的第四个阶段是？",
        options: JSON.stringify(["感知运动", "前运算", "具体运算", "形式运算"]),
        answer: "D",
        explanation: "形式运算阶段大约从 11 岁开始。",
        tags: JSON.stringify(["教育心理学"]),
        type: "single",
        dimension: "understanding",
      },
      {
        content: "德育过程的基本矛盾是什么？",
        options: JSON.stringify(["社会道德要求与受教育者现有水平的矛盾"]),
        answer: "A",
        explanation: "这是德育过程的基本矛盾。",
        tags: JSON.stringify(["教育学"]),
        type: "single",
        dimension: "application",
      },
    ]);
  }

  const { app } = await import("@/lib/api/app");
  const { runDocTasks } = await import("./tasks");
  const fixtures = await buildFixtures(drizzleDb, drizzleSchema);

  if (mode !== "mcp") {
    const req: Parameters<typeof runDocTasks>[0] = async (
      method,
      path,
      body,
    ) => {
      const res = await app.request(`/api/external${path}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          Authorization: `Bearer ${API_KEY}`,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const parsed = await res.json().catch(() => null);
      return { status: res.status, body: parsed };
    };

    const result = await runDocTasks(req, fixtures);
    console.log(
      `✔ 通道 A（HTTP /api/external）4 个任务通过\n` +
        `  1 导入：预演 ${result.imported.dryRunInserted} → 真写 ${result.imported.realInserted} 条\n` +
        `  2 今日清单：${result.todayPlan.questionIds.length} 题 / 薄弱 ${result.todayPlan.weakestTags.join("/")}\n` +
        `  3 复习：card ${result.review.cardId} rating=${result.review.rating} due=${result.review.nextDue}\n` +
        `  4 小结：${result.summary.text}`,
    );
  }

  if (mode !== "http") {
    const server = await startHttpServer(app);
    try {
      await runMcpDocTasks(server.port);
    } finally {
      await new Promise<void>((resolveClose) =>
        server.close(() => resolveClose()),
      );
    }
  }
}

function buildFixtures(drizzleDb: any, drizzleSchema: any) {
  return (async () => {
    const rows = await drizzleDb
      .select({ id: drizzleSchema.questions.id })
      .from(drizzleSchema.questions)
      .limit(3);
    if (rows.length < 2) throw new Error("题库题目不足，无法完成任务 1");
    return {
      sessionKey: `doc-task-${Date.now()}`,
      answers: [
        {
          questionId: rows[0].id,
          userAnswer: "__wrong__",
          isCorrect: false,
          durationMs: 8000,
        },
        {
          questionId: rows[1].id,
          userAnswer: "A",
          isCorrect: true,
          durationMs: 9000,
        },
      ],
      deckKey: `deck-doc-task-${Date.now()}`,
      cardId: "c1",
      cardPrompt: "教育活动的两个基本要素是什么？",
      typed: "教育目的 教育方法",
    };
  })();
}

/**
 * 把 Hono app 挂到临时端口。
 *
 * 手工桥接而不是装 `@hono/node-server`：只为一个验收脚本引一个运行时依赖不值得，
 * 这里只需要把 IncomingMessage 转成标准 Request（GET/POST + JSON body）。
 */
async function startHttpServer(app: {
  fetch: (req: Request) => Promise<Response>;
}): Promise<{ port: number; close: (cb: () => void) => void }> {
  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const hasBody = chunks.length > 0;
        const request = new Request(`http://127.0.0.1${req.url ?? "/"}`, {
          method: req.method ?? "GET",
          headers: req.headers as Record<string, string>,
          ...(hasBody ? { body: Buffer.concat(chunks) } : {}),
        });
        const response = await app.fetch(request);
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(error) }));
      }
    },
  );

  await new Promise<void>((resolveListen) =>
    server.listen(0, "127.0.0.1", () => resolveListen()),
  );
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  if (!port) throw new Error("临时 HTTP 服务没能拿到端口");
  return { port, close: (cb) => server.close(cb) };
}

/** spawn mcp-server 的验收脚本：stdio 客户端 → tools/call → 真实后端 */
function runMcpDocTasks(port: number): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      process.execPath,
      [join(mcpDir, "scripts", "doc-tasks.mjs")],
      {
        env: {
          ...process.env,
          AI_LEAMING_BASE_URL: `http://127.0.0.1:${port}`,
          AI_LEAMING_API_KEY: API_KEY,
          MCP_SERVER_ENTRY: join(mcpDir, "dist", "index.js"),
        },
        stdio: "inherit",
      },
    );
    child.on("error", rejectRun);
    child.on("exit", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`MCP 文档任务退出码 ${code}`));
    });
  });
}

// 不用顶层 await：tsx 在本仓库按 CJS 转译，顶层 await 会直接报
// ERR_REQUIRE_ASYNC_MODULE（契约脚本 dump-openapi.ts 同样没有用）
void (async () => {
  try {
    await main();
  } catch (error) {
    console.error("✖ 文档任务失败：", error);
    process.exitCode = 1;
  } finally {
    // 清理临时库（含 WAL/SHM）
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      try {
        rmSync(join(appRoot, "data", `${dbFileName}${suffix}`), {
          force: true,
        });
      } catch {
        // 忽略：清理失败不影响验收结论
      }
    }
  }
})();
