/* eslint-disable @typescript-eslint/no-explicit-any -- 集成测试需要直接执行原始 SQL 并断言未类型化的行 */
// @vitest-environment node
/**
 * 导入幂等性集成测试（真实 SQLite + 真实迁移，不 mock SQL）
 *
 * 背景：v6 油猴脚本支持"自动推送 + 批量导入"，同一套粉笔练习可能被重复推送，
 * 或推送超时后重试。旧实现每次都会新建 practice_sessions、全量写
 * practice_logs，并对 user_mastery 做加法累加 —— 重复导入会虚高掌握度分数。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

const dbFile = `test-import-idempotency-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

type DbModule = typeof import("../../db");
type ImportServiceModule = typeof import("../import-service");

// SRS 同步是导入的旁路副作用，与本测试关注的幂等性无关；
// 且其 question_srs 写入在本机真实 SQLite 上会触发 SQLITE_BUSY 回滚，故隔离。
vi.mock("../srs", () => ({
  srsService: { syncFromPracticeLogs: vi.fn().mockResolvedValue(0) },
}));

let dbm: DbModule;
let importService: ImportServiceModule["importService"];

const payload = (sourceKey: string) =>
  ({
    sessionName: "粉笔练习 A",
    sourceKey,
    totalCount: 1,
    correctCount: 1,
    errorCount: 0,
    statsCount: 0,
    questions: [
      {
        externalId: "ext-dup-1",
        content: "题目内容",
        contentHtml: "<p>题目内容</p>",
        options: ["A", "B"],
        answer: "A",
        explanation: "解析",
        explanationHtml: "<p>解析</p>",
        tags: ["历史"],
        source: "fenbi_import",
        type: "single",
        dimension: "knowledge",
      },
    ],
    records: [
      {
        externalId: "ext-dup-1",
        userAnswer: "A",
        isCorrect: true,
        durationMs: 1000,
      },
    ],
  }) as any;

async function scalar(sqlText: string): Promise<number> {
  const rows = (await dbm.drizzleDb.all(sqlText as any)) as any[];
  return Number(Object.values(rows[0])[0]);
}

describe("粉笔导入幂等性（真实 SQLite）", () => {
  beforeAll(async () => {
    dbm = await import("../../db");
    await dbm.initDatabase();
    // 幂等测试要固定用 user_id=1，确保外键存在
    await dbm.drizzleDb.run(
      "INSERT OR IGNORE INTO users (id, username, password_hash) VALUES (1, 'idempotency-tester', 'x')" as any,
    );
    importService = (await import("../import-service")).importService;
  });

  afterAll(async () => {
    await dbm.closeDrizzle();
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
        force: true,
      });
    }
  });

  it("迁移已为 practice_sessions 建立 source_key 唯一索引", async () => {
    const rows = (await dbm.drizzleDb.all(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='uq_practice_sessions_user_source'" as any,
    )) as any[];
    expect(rows.length).toBe(1);
  });

  it("同一 sourceKey 导入两次只落一条会话、一份日志、一次掌握度累加", async () => {
    const first = await importService.importFenbiData(
      1,
      payload("fenbi:key-1"),
    );
    expect(first.duplicated).toBe(false);
    expect(first.importedCount).toBe(1);

    const masteryAfterFirst = await scalar(
      "SELECT total_count AS c FROM user_mastery WHERE tag_name = '历史'",
    );

    const second = await importService.importFenbiData(
      1,
      payload("fenbi:key-1"),
    );
    expect(second.duplicated).toBe(true);
    expect(second.importedCount).toBe(0);
    expect(second.sessionId).toBe(first.sessionId);

    expect(
      await scalar(
        "SELECT COUNT(*) AS c FROM practice_sessions WHERE source_key = 'fenbi:key-1'",
      ),
    ).toBe(1);
    expect(
      await scalar(
        "SELECT COUNT(*) AS c FROM practice_logs WHERE session_id = (SELECT id FROM practice_sessions WHERE source_key = 'fenbi:key-1')",
      ),
    ).toBe(1);
    // 关键：掌握度不得因重复导入再次累加
    expect(
      await scalar(
        "SELECT total_count AS c FROM user_mastery WHERE tag_name = '历史'",
      ),
    ).toBe(masteryAfterFirst);
  });

  it("唯一约束冲突的判定能穿透 drizzle 的包装错误", async () => {
    // drizzle 把 SqliteError 包一层：外层 message 是 "Failed query: ..."，
    // code 在 cause 上。这里直接构造两种形态，确保判定不依赖调用顺序。
    const { isUniqueViolation } = await import("../import-service").then(
      (m) => {
        const hook = (m as any).__test__?.isUniqueViolation;
        // 钩子缺失时直接失败，避免用例空转通过
        expect(typeof hook).toBe("function");
        return { isUniqueViolation: hook };
      },
    );
    expect(
      isUniqueViolation({
        message: "Failed query: insert into practice_sessions ...",
        cause: { code: "SQLITE_CONSTRAINT_UNIQUE" },
      }),
    ).toBe(true);
    expect(
      isUniqueViolation({
        message: "Failed query: x",
        cause: {
          message: "UNIQUE constraint failed: practice_sessions.source_key",
        },
      }),
    ).toBe(true);
    expect(isUniqueViolation({ message: "Failed query: x" })).toBe(false);
  });

  it("并发导入同一 sourceKey：只落一条会话，另一个走唯一索引兜底", async () => {
    const [a, b] = await Promise.all([
      importService.importFenbiData(1, payload("fenbi:race-key")),
      importService.importFenbiData(1, payload("fenbi:race-key")),
    ]);

    // 一个真正写入，另一个命中预检或唯一索引后按重复处理
    expect([a.duplicated, b.duplicated].filter(Boolean).length).toBe(1);
    expect(a.sessionId).toBe(b.sessionId);
    expect(
      await scalar(
        "SELECT COUNT(*) AS c FROM practice_sessions WHERE source_key = 'fenbi:race-key'",
      ),
    ).toBe(1);
    expect(
      await scalar(
        "SELECT COUNT(*) AS c FROM practice_logs WHERE session_id = (SELECT id FROM practice_sessions WHERE source_key = 'fenbi:race-key')",
      ),
    ).toBe(1);
  });

  it("不同 sourceKey 视为两次独立练习", async () => {
    const other = await importService.importFenbiData(
      1,
      payload("fenbi:key-2"),
    );
    expect(other.duplicated).toBe(false);
    expect(
      await scalar(
        "SELECT COUNT(*) AS c FROM practice_sessions WHERE source_key IN ('fenbi:key-1','fenbi:key-2')",
      ),
    ).toBe(2);
  });
});
