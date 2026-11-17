// @vitest-environment node
/**
 * `chat` 路由的跨用户归属校验（IDOR 防护）。
 *
 * 真实依赖：真实 SQLite（独立临时库 + 真实迁移）、真实 `authMiddleware`（真 JWT +
 * token_version 会话撤销检查）、真实 `saveMessage`（内含会话归属校验 + 事务）。
 * 不 mock 数据库，也不 mock `getCurrentUser`：身份完全由请求头里的 JWT 决定。
 *
 * 唯一被替掉的是 `streamChatWrapper`（真正去请求外部大模型那一步）—— 被测的写入
 * 归属发生在调用模型**之前**，替换掉它不影响本文件要证明的事。
 *
 * 要证明的事：A 的会话，另一个用户 B 拿着同一个 sessionId 往里写，消息不会落到
 * A 的会话里，A 的 message_count 也不会被改动；同时 B 自己的会话仍然可写。
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { sign } from "hono/jwt";

const dbFile = `test-cross-user-chat-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

// 只替掉"向外部大模型发起请求"，返回一条空流；数据库与鉴权链路全部真实。
vi.mock("@/lib/ai/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/client")>();
  return {
    ...actual,
    streamChatWrapper: async () => ({
      toUIMessageStream: () =>
        new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
    }),
  };
});

/** 用户 A（会话所有者）与用户 B（跨用户访客） */
const A = 931;
const B = 932;
const SESSION_A = 7001;
const SESSION_B = 7002;
/** 只有 B 会写进请求体的文本，用它判断有没有越权落库 */
const B_TEXT = "B-试图写进A的会话";

type DbModule = typeof import("@/lib/db");
let dbm: DbModule;
let app: (typeof import("../chat"))["default"];

async function tokenFor(userId: number): Promise<string> {
  return sign(
    {
      user: {
        id: userId,
        username: `cross-user-${userId}`,
        role: "student",
        token_version: 0,
      },
    },
    process.env.JWT_SECRET as string,
    "HS256",
  );
}

function send(token: string, sessionId: number, text: string) {
  return app.request("/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: text }],
      sessionId,
    }),
  });
}

/** 发一次请求并把流式响应读完：避免未消费的 body 在 worker 退出时留下悬挂句柄 */
async function sendAndDrain(token: string, sessionId: number, text: string) {
  const res = await send(token, sessionId, text);
  await res.text();
  return res;
}

async function messageCount(sessionId: number): Promise<number> {
  const row = await dbm.drizzleDb.get<{ c: number }>(
    sql`SELECT COUNT(*) AS c FROM chat_messages WHERE session_id = ${sessionId}`,
  );
  return Number(row?.c ?? 0);
}

async function sessionCounter(sessionId: number): Promise<number> {
  const row = await dbm.drizzleDb.get<{ message_count: number }>(
    sql`SELECT message_count FROM chat_sessions WHERE id = ${sessionId}`,
  );
  return Number(row?.message_count ?? 0);
}

/**
 * 往会话里种一条消息，并把 `chat_sessions.message_count` 校准成真实行数。
 *
 * 返回新消息 id，让用例用它定位"自己种下的那条"，而不是去查"第一条"——
 * 这样 `-t '<用例名>'` 单独跑时基线也是确定的，不依赖前面用例留下的状态。
 */
async function seedMessage(
  sessionId: number,
  content: string,
): Promise<number> {
  const inserted = await dbm.drizzleDb.run(
    sql`INSERT INTO chat_messages (session_id, role, content)
        VALUES (${sessionId}, 'user', ${content})`,
  );
  await dbm.drizzleDb.run(
    sql`UPDATE chat_sessions
        SET message_count = (
          SELECT COUNT(*) FROM chat_messages WHERE session_id = ${sessionId}
        )
        WHERE id = ${sessionId}`,
  );
  return Number(inserted.lastInsertRowid);
}

describe("chat 路由 · 跨用户归属", () => {
  beforeAll(async () => {
    dbm = await import("@/lib/db");
    await dbm.initDatabase();
    app = (await import("../chat")).default;

    for (const [id, name] of [
      [A, "chat-owner"],
      [B, "chat-intruder"],
    ] as const) {
      await dbm.drizzleDb.run(
        sql`INSERT OR IGNORE INTO users (id, username, password_hash, token_version)
            VALUES (${id}, ${name}, 'x', 0)`,
      );
    }
    for (const [id, owner, title] of [
      [SESSION_A, A, "A 的会话"],
      [SESSION_B, B, "B 的会话"],
    ] as const) {
      await dbm.drizzleDb.run(
        sql`INSERT OR IGNORE INTO chat_sessions (id, user_id, title, message_count)
            VALUES (${id}, ${owner}, ${title}, 0)`,
      );
    }
  });

  // 幂等基线：每条用例都从"两个会话都没有消息、计数为 0"开始，
  // 自己需要的数据在用例体内用 seedMessage 显式种下。
  beforeEach(async () => {
    await dbm.drizzleDb.run(
      sql`DELETE FROM chat_messages
          WHERE session_id = ${SESSION_A} OR session_id = ${SESSION_B}`,
    );
    await dbm.drizzleDb.run(
      sql`UPDATE chat_sessions SET message_count = 0
          WHERE id = ${SESSION_A} OR id = ${SESSION_B}`,
    );
  });

  afterAll(async () => {
    await dbm.closeDrizzle();
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
        force: true,
      });
    }
  });

  it("B 往自己的会话写：正常落库并累加计数（证明不是把功能关了）", async () => {
    const res = await sendAndDrain(
      await tokenFor(B),
      SESSION_B,
      "B 自己的问题",
    );

    expect(res.status).toBe(200);
    expect(await messageCount(SESSION_B)).toBe(1);
    expect(await sessionCounter(SESSION_B)).toBe(1);
  });

  it("A 往自己的会话写：正常落库（对照，证明样本是真的）", async () => {
    const res = await sendAndDrain(
      await tokenFor(A),
      SESSION_A,
      "A 自己的问题",
    );

    expect(res.status).toBe(200);
    expect(await messageCount(SESSION_A)).toBe(1);
    expect(await sessionCounter(SESSION_A)).toBe(1);
  });

  it("另一个用户拿 A 的 sessionId 写：消息不落库，A 的计数不变", async () => {
    // A 的会话里已有自己的消息（基线 1 条）：越权写必须一条都加不进去
    const seededId = await seedMessage(SESSION_A, "A 的既有消息");
    const before = await sessionCounter(SESSION_A);
    expect(before).toBe(1);

    const res = await sendAndDrain(await tokenFor(B), SESSION_A, B_TEXT);

    // 写被拒绝（saveMessage 内归属校验失败）后请求继续走模型：响应不是错误页，
    // 但越权写必须没有发生 —— 这是本用例的核心断言。
    expect(res.status).toBe(200);
    expect(await messageCount(SESSION_A)).toBe(1);
    expect(await sessionCounter(SESSION_A)).toBe(before);

    // 被种下的那条仍然原样在库里（越权写没有把它挤掉或改写）
    const kept = await dbm.drizzleDb.get<{ content: string }>(
      sql`SELECT content FROM chat_messages WHERE id = ${seededId}`,
    );
    expect(kept?.content).toBe("A 的既有消息");

    const leaked = await dbm.drizzleDb.get<{ c: number }>(
      sql`SELECT COUNT(*) AS c FROM chat_messages
          WHERE session_id = ${SESSION_A} AND content LIKE ${`%${B_TEXT}%`}`,
    );
    expect(Number(leaked?.c ?? 0)).toBe(0);
  });

  it("跨用户写入没有把 B 的文本留在 A 的会话统计里", async () => {
    // 两个会话各有一条自己的消息：本用例只验证越权尝试不改变这两份基线
    const aMessageId = await seedMessage(SESSION_A, "A 的既有消息");
    const bMessageId = await seedMessage(SESSION_B, "B 的既有消息");

    // 再试一次，确认多次越权尝试也不会累加 A 的 message_count
    await sendAndDrain(await tokenFor(B), SESSION_A, `${B_TEXT}-second`);

    expect(await messageCount(SESSION_A)).toBe(1);
    expect(await sessionCounter(SESSION_A)).toBe(1);
    // 对照：B 自己的会话计数只受自己的写入影响
    expect(await sessionCounter(SESSION_B)).toBe(1);

    const aRows = await dbm.drizzleDb.all<{ id: number; content: string }>(
      sql`SELECT id, content FROM chat_messages
          WHERE session_id = ${SESSION_A} ORDER BY id`,
    );
    expect(aRows.map((row) => row.id)).toEqual([aMessageId]);
    expect(aRows.map((row) => row.content)).toEqual(["A 的既有消息"]);

    const bKept = await dbm.drizzleDb.get<{ content: string }>(
      sql`SELECT content FROM chat_messages WHERE id = ${bMessageId}`,
    );
    expect(bKept?.content).toBe("B 的既有消息");
  });
});
