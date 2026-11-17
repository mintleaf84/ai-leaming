// @vitest-environment node
/**
 * 练习历史服务（真实 SQLite + 真实迁移，不 mock 查询构造器）。
 *
 * 原先这组测试把整条 drizzle 链换成 Proxy mock，只验证了「SQL 被调用了」。
 * 按 `docs/engineering.md` 规则 3（禁止用 mock 数据库冒充验证），这里改为
 * 往真库里插会话/日志/回顾，断言：
 *   - 分页的 total / totalPages 来自库内 COUNT，accuracy 由行内数字算出；
 *   - 日期、正确率、模式的筛选真的作用在 SQL 层（改断言数值而非「被调用」）；
 *   - 会话详情只返回本用户的数据，JSON 字段解析与 review 关联真的成立；
 *   - deleteSession 的级联删除在事务里真的把三张表清了。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";

const dbFile = `test-history-service-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

type DbModule = typeof import("../../db");
type HistoryModule = typeof import("../history");

let dbm: DbModule;
let historyService: HistoryModule["historyService"];

const USER_A = 810;
const USER_B = 811;

const Q_PARSE = 9001; // 答对
const Q_FAIL = 9002; // 答错（带回顾数据）

/** "2026-03-<day> 10:00:00"（SQLite CURRENT_TIMESTAMP 同款 UTC 文本格式） */
function ts(day: number): string {
  return `2026-03-${String(day).padStart(2, "0")} 10:00:00`;
}

/**
 * 25 条会话：
 *   1..10  正确 10/10 → 100%
 *   11..20 正确  5/10 →  50%
 *   21..25 正确  8/10 →  80%
 * 另给 USER_B 3 条，用于验证用户隔离。
 */
async function seedSessions(): Promise<void> {
  const { practice_sessions } = dbm.drizzleSchema;

  const rows = Array.from({ length: 25 }, (_, i) => {
    const day = i + 1;
    const correct = day <= 10 ? 10 : day <= 20 ? 5 : 8;
    return {
      id: `hs-${String(day).padStart(2, "0")}`,
      user_id: USER_A,
      session_name: `会话 ${day}`,
      total_questions: 10,
      correct_count: correct,
      review_count: 0,
      practice_mode: day <= 20 ? "random" : "wrong",
      created_at: ts(day),
    };
  });

  await dbm.drizzleDb
    .insert(practice_sessions)
    .values([
      ...rows,
      {
        id: "hs-b1",
        user_id: USER_B,
        session_name: "别人的会话",
        total_questions: 2,
        correct_count: 0,
        practice_mode: "random",
        created_at: ts(26),
      },
    ])
    .onConflictDoNothing();
}

beforeAll(async () => {
  dbm = await import("../../db");
  await dbm.initDatabase();

  const { users, questions } = dbm.drizzleSchema;
  await dbm.drizzleDb
    .insert(users)
    .values([
      { id: USER_A, username: "history-a", password_hash: "x" },
      { id: USER_B, username: "history-b", password_hash: "x" },
    ])
    .onConflictDoNothing();

  await dbm.drizzleDb
    .insert(questions)
    .values([
      {
        id: Q_PARSE,
        content: "光合作用的场所是？",
        options: '["A. 线粒体","B. 叶绿体"]',
        answer: "B",
        explanation: "叶绿体",
        tags: '["细胞","代谢"]',
        dimension: "knowledge",
        type: "single",
        external_id: "history-ext-9001",
      },
      {
        id: Q_FAIL,
        content: "第一次工业革命的起点是？",
        options: '["A. 英国","B. 法国"]',
        answer: "A",
        explanation: "英国",
        tags: '["历史"]',
        dimension: "understanding",
        type: "single",
        external_id: "history-ext-9002",
      },
    ])
    .onConflictDoNothing();

  historyService = (await import("../history")).historyService;
});

beforeEach(async () => {
  const { practice_sessions, practice_logs, session_reviews } =
    dbm.drizzleSchema;
  await dbm.drizzleDb.delete(session_reviews);
  await dbm.drizzleDb.delete(practice_logs);
  await dbm.drizzleDb.delete(practice_sessions);
  await seedSessions();
});

afterAll(async () => {
  await dbm.closeDrizzle();
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
      force: true,
    });
  }
});

/** 给某个会话插入两条日志 + 一条回顾，返回会话 id */
async function seedLogs(sessionId: string, userId = USER_A): Promise<void> {
  const { practice_logs, session_reviews } = dbm.drizzleSchema;
  await dbm.drizzleDb.insert(practice_logs).values([
    {
      session_id: sessionId,
      user_id: userId,
      question_id: Q_PARSE,
      user_answer: "B",
      is_correct: true,
      duration_ms: 3200,
    },
    {
      session_id: sessionId,
      user_id: userId,
      question_id: Q_FAIL,
      user_answer: "B",
      is_correct: false,
      duration_ms: 5100,
    },
  ]);
  await dbm.drizzleDb.insert(session_reviews).values({
    session_id: sessionId,
    question_id: Q_FAIL,
    review_data: '{"note":"回看英国工业革命"}',
  });
}

describe("getHistory", () => {
  it("分页统计来自库内：total=25、totalPages=3，accuracy 由行内数字算出", async () => {
    const result = await historyService.getHistory(USER_A, {
      page: 1,
      pageSize: 10,
    });

    expect(result.total).toBe(25);
    expect(result.totalPages).toBe(3);
    expect(result.page).toBe(1);
    expect(result.items).toHaveLength(10);

    // 按 created_at DESC：最新的是 3 月 25 日那条（8/10）
    expect(result.items[0].id).toBe("hs-25");
    expect(result.items[0].accuracy).toBe(80);
    expect(result.items[0].createdAt).toBe("2026-03-25T10:00:00.000Z");
    // 3 月 20 日那条是 5/10
    expect(result.items[5].id).toBe("hs-20");
    expect(result.items[5].accuracy).toBe(50);
  });

  it("最后一页只返回剩余行", async () => {
    const result = await historyService.getHistory(USER_A, {
      page: 3,
      pageSize: 10,
    });

    expect(result.items).toHaveLength(5);
    expect(result.total).toBe(25);
    expect(result.items.map((item) => item.id)).toEqual([
      "hs-05",
      "hs-04",
      "hs-03",
      "hs-02",
      "hs-01",
    ]);
  });

  it("dateFrom 过滤只保留该日期之后的会话", async () => {
    // 先删掉 3-20 那条：本用例要对「边界日」断言，而生产代码把纯日期按本地零点
    // 转 UTC（北京时区下 dateFrom 会前移一天，见下一个 it.fails）。没有 3-20 的行时，
    // 两种时区解释结果一致，本用例才不会在 CI(UTC) 与本机(CST) 之间摇摆。
    await dbm.drizzleDb
      .delete(dbm.drizzleSchema.practice_sessions)
      .where(eq(dbm.drizzleSchema.practice_sessions.id, "hs-20"));

    const result = await historyService.getHistory(USER_A, {
      dateFrom: "2026-03-21",
    });

    expect(result.total).toBe(5);
    expect(result.items.map((item) => item.id)).toEqual([
      "hs-25",
      "hs-24",
      "hs-23",
      "hs-22",
      "hs-21",
    ]);
  });

  // 已知缺陷（本任务只固定、不修）：history.ts:141/150 的 accuracy 过滤条件
  // sql 模板里多写了一个右括号，`and()` 再包一层后生成
  //   where (... and (CASE ... END) >= ?))
  // → SQLITE_ERROR: near ")"，即任何带 accuracyMin/accuracyMax 的历史查询都 500。
  // 生成语句见下面的错误信息；修复后这两个用例会因「意外通过」而失败，届时去掉 it.fails。
  it.fails(
    "accuracyMin 在 SQL 层过滤：只留下 100% 的 10 条（已知缺陷：SQL 多一个右括号）",
    async () => {
      const result = await historyService.getHistory(USER_A, {
        accuracyMin: 90,
      });

      expect(result.total).toBe(10);
      expect(result.items).toHaveLength(10);
      expect(result.items.every((item) => item.accuracy === 100)).toBe(true);
    },
  );

  it.fails(
    "dateFrom + accuracyMax 组合过滤（已知缺陷：SQL 多一个右括号）",
    async () => {
      const result = await historyService.getHistory(USER_A, {
        dateFrom: "2026-03-21",
        accuracyMax: 80,
      });

      expect(result.total).toBe(5);
    },
  );

  // 已知缺陷（固定、不修）：listSessions 用 `dayjs(dateFrom).utc()` 把「纯日期」
  // 当成本地零点再转 UTC。北京时区下 "2026-03-21" → UTC "2026-03-20"，
  // 于是 dateFrom 多包含前一天、dateTo 少包含当天（各差一天）。
  it.fails(
    "北京时区下 dateFrom 边界差一天（已知缺陷：dayjs(dateOnly).utc() 把本地零点当基准）",
    async () => {
      const originalTz = process.env.TZ;
      process.env.TZ = "Asia/Shanghai";
      try {
        const result = await historyService.getHistory(USER_A, {
          dateFrom: "2026-03-22",
        });
        // 期望只含 3-22..3-25 共 4 条；实际把 3-21 也算进来了（5 条）
        expect(result.items.map((item) => item.id)).toEqual([
          "hs-25",
          "hs-24",
          "hs-23",
          "hs-22",
        ]);
      } finally {
        if (originalTz === undefined) delete process.env.TZ;
        else process.env.TZ = originalTz;
      }
    },
  );

  it("practiceMode 过滤只命中该模式的会话", async () => {
    const result = await historyService.getHistory(USER_A, { mode: "wrong" });

    expect(result.total).toBe(5);
    expect(result.items.every((item) => item.practiceMode === "wrong")).toBe(
      true,
    );
  });

  it("用户隔离：别人的会话不会出现在我的历史里", async () => {
    const mine = await historyService.getHistory(USER_A, {});
    const others = await historyService.getHistory(USER_B, {});

    expect(mine.total).toBe(25);
    expect(others.total).toBe(1);
    expect(others.items[0].id).toBe("hs-b1");
  });
});

describe("getSessionDetail", () => {
  it("返回会话与日志：JSON 字段解析、isCorrect 布尔化、回顾关联成立", async () => {
    await seedLogs("hs-25");

    const detail = await historyService.getSessionDetail(USER_A, "hs-25");

    expect(detail).not.toBeNull();
    expect(detail!.session.id).toBe("hs-25");
    expect(detail!.session.totalQuestions).toBe(10);
    expect(detail!.session.correctCount).toBe(8);
    expect(detail!.session.accuracy).toBe(80);
    expect(detail!.session.createdAt).toBe("2026-03-25T10:00:00.000Z");

    expect(detail!.logs).toHaveLength(2);

    const correct = detail!.logs.find((l) => l.questionId === Q_PARSE)!;
    expect(correct.questionContent).toBe("光合作用的场所是？");
    expect(correct.options).toEqual(["A. 线粒体", "B. 叶绿体"]);
    expect(correct.correctAnswer).toBe("B");
    expect(correct.userAnswer).toBe("B");
    expect(correct.isCorrect).toBe(true);
    expect(correct.tags).toEqual(["细胞", "代谢"]);
    expect(correct.duration).toBe(3200);
    expect(correct.reviewData).toBeNull();

    const wrong = detail!.logs.find((l) => l.questionId === Q_FAIL)!;
    expect(wrong.isCorrect).toBe(false);
    expect(wrong.reviewData).toEqual({ note: "回看英国工业革命" });
  });

  it("会话属于别人时返回 null", async () => {
    await seedLogs("hs-25");

    const detail = await historyService.getSessionDetail(USER_B, "hs-25");

    expect(detail).toBeNull();
  });

  it("会话不存在时返回 null", async () => {
    const detail = await historyService.getSessionDetail(USER_A, "hs-nope");
    expect(detail).toBeNull();
  });
});

describe("deleteSession / getAvailableModes", () => {
  it("删除会话时连带清掉日志与回顾，其他会话不受影响", async () => {
    await seedLogs("hs-25");
    await seedLogs("hs-24");

    const ok = await historyService.deleteSession(USER_A, "hs-25");
    expect(ok).toBe(true);

    const { practice_logs, session_reviews } = dbm.drizzleSchema;

    // 表内只剩 24 条会话，且 hs-25 的日志/回顾都没了
    const remaining = await historyService.getHistory(USER_A, {
      pageSize: 100,
    });
    expect(remaining.total).toBe(24);
    expect(remaining.items.some((item) => item.id === "hs-25")).toBe(false);

    const logsLeft = await dbm.drizzleDb
      .select()
      .from(practice_logs)
      .where(eq(practice_logs.session_id, "hs-25"));
    expect(logsLeft).toHaveLength(0);

    const reviewsLeft = await dbm.drizzleDb
      .select()
      .from(session_reviews)
      .where(eq(session_reviews.session_id, "hs-25"));
    expect(reviewsLeft).toHaveLength(0);

    // hs-24 的数据仍然完整
    const keptLogs = await dbm.drizzleDb
      .select()
      .from(practice_logs)
      .where(eq(practice_logs.session_id, "hs-24"));
    expect(keptLogs).toHaveLength(2);
  });

  it("删别人的会话返回 false 且库里数据结构不变", async () => {
    const ok = await historyService.deleteSession(USER_B, "hs-25");
    expect(ok).toBe(false);

    const detail = await historyService.getSessionDetail(USER_A, "hs-25");
    expect(detail).not.toBeNull();
  });

  it("getAvailableModes 返回库内真实出现过的模式", async () => {
    const modes = await historyService.getAvailableModes(USER_A);
    expect(modes.sort()).toEqual(["random", "wrong"]);
  });
});
