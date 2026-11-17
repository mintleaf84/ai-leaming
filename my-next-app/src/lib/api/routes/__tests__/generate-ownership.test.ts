// @vitest-environment node
/**
 * `generate` 路由的跨用户归属校验。
 *
 * 真实依赖：真实 SQLite（独立临时库 + 真实迁移）、真实 `authMiddleware`（真 JWT）、
 * 真实 `checkAndConsumeQuota` / `decrementUsage`（subscription-service 未被 mock）。
 *
 * 这个模块没有资源 id：它读的是"当前用户的配额"，写的是"当前用户今日用量"。
 * 所以跨用户隔离要证明的是：A 的调用只扣 A 的额度，B 的额度不受影响；B 也不能
 * 通过请求体把消耗记到别人账上。真正请求大模型那一步（`ai` / `getModel`）被替掉，
 * 因为配额扣减发生在此之前。
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
import { getBeijingDateString } from "@/lib/utils/datetime";

const dbFile = `test-cross-user-generate-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

// 外部模型调用不可在单测里发生：只替换传输层，配额与鉴权链路保持真实。
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    streamText: () => ({
      toTextStreamResponse: () => new Response("mock-generated"),
    }),
  };
});

vi.mock("@/lib/ai/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/client")>();
  return {
    ...actual,
    getAiConfig: async () => ({
      apiKey: "test-key",
      baseURL: "http://127.0.0.1:1/v1",
      modelName: "test-model",
    }),
    getModel: () => ({}),
  };
});

/** 用户 A（先消耗额度的那个）与用户 B（跨用户访客） */
const A = 951;
const B = 952;
/** free 套餐的每日 ai_chat 上限（seed-data.ts） */
const FREE_AI_CHAT_LIMIT = 10;

type DbModule = typeof import("@/lib/db");
let dbm: DbModule;
let app: (typeof import("../generate"))["default"];

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

function generate(token: string, body: Record<string, unknown> = {}) {
  return app.request("/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      prompt: "扩写这段解析",
      option: "continue",
      ...body,
    }),
  });
}

async function usageOf(userId: number): Promise<number> {
  // 用 all() 而不是 get()：没有记录时 gen() 在 libsql 驱动下会抛 normalizeRow
  const rows = await dbm.drizzleDb.all<{ count: number }>(
    sql`SELECT count FROM daily_usage
        WHERE user_id = ${userId} AND usage_type = 'ai_chat'
        ORDER BY id DESC LIMIT 1`,
  );
  return Number(rows[0]?.count ?? 0);
}

/**
 * 把某用户"今日 ai_chat 用量"直接设成 count（幂等：已有记录就覆盖）。
 * 复用生产同一份 `getBeijingDateString()`，避免测试自己拼日期格式。
 */
async function seedUsage(userId: number, count: number): Promise<void> {
  await dbm.drizzleDb.run(
    sql`INSERT INTO daily_usage (user_id, usage_date, usage_type, count)
        VALUES (${userId}, ${getBeijingDateString()}, 'ai_chat', ${count})
        ON CONFLICT (user_id, usage_date, usage_type)
        DO UPDATE SET count = excluded.count`,
  );
}

describe("generate 路由 · 跨用户归属", () => {
  beforeAll(async () => {
    dbm = await import("@/lib/db");
    await dbm.initDatabase();
    app = (await import("../generate")).default;

    for (const [id, name] of [
      [A, "generate-owner"],
      [B, "generate-intruder"],
    ] as const) {
      await dbm.drizzleDb.run(
        sql`INSERT OR IGNORE INTO users (id, username, password_hash, token_version)
            VALUES (${id}, ${name}, 'x', 0)`,
      );
    }
  });

  // 幂等基线：清掉两个用户今天的全部用量记录，每条用例自己 seedUsage。
  beforeEach(async () => {
    await dbm.drizzleDb.run(
      sql`DELETE FROM daily_usage WHERE user_id = ${A} OR user_id = ${B}`,
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

  it("A 调用生成：只扣 A 的额度，B 的额度还是 0", async () => {
    const res = await generate(await tokenFor(A));

    expect(res.status).toBe(200);
    expect(await usageOf(A)).toBe(1);
    expect(await usageOf(B)).toBe(0);
  });

  it("B 调用时在请求体里伪造 userId: A：仍记在 B 名下，A 的额度不被再扣", async () => {
    // A 今天已经用过 1 次：B 的调用不该把它推高（哪怕请求体里写着 userId: A）
    await seedUsage(A, 1);

    const res = await generate(await tokenFor(B), { userId: A });

    expect(res.status).toBe(200);
    expect(await usageOf(B)).toBe(1);
    expect(await usageOf(A)).toBe(1);
  });

  it("A 的额度耗尽后 A 被 403 拦住，同一时刻 B 仍能正常生成", async () => {
    // A 今日 ai_chat 用量已到 free 套餐上限（模拟"他人已经用完了自己的"），
    // B 已用 1 次：本用例验证 A 用满不影响 B 继续扣自己的额度
    await seedUsage(A, FREE_AI_CHAT_LIMIT);
    await seedUsage(B, 1);

    const blocked = await generate(await tokenFor(A));
    expect(blocked.status).toBe(403);
    expect(await blocked.text()).toContain("配额不足");

    // 对照：B 的额度按用户独立计算，不受 A 用满影响
    const allowed = await generate(await tokenFor(B));
    expect(allowed.status).toBe(200);
    expect(await usageOf(B)).toBe(2);
    expect(await usageOf(A)).toBe(FREE_AI_CHAT_LIMIT);
  });
});
