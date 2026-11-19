// @vitest-environment node
/**
 * 题目内容级去重（P1-1）：归一化/哈希 + 导入路径跨来源去重。
 *
 * 线上库 2026-11-14 快照：81 组同题干重复，根因是只按 external_id 去重。
 * 这里固定两件事：哈希对格式差异稳定；同题干不同 external_id 的第二次导入不再新增题目。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// 粉笔导入末尾会调用 SRS 同步；本机 libsql 下会触发 SQLITE_BUSY，与幂等测试同样隔离
vi.mock("../srs", () => ({
  srsService: { syncFromPracticeLogs: vi.fn().mockResolvedValue(0) },
}));

const dbFile = `test-question-dedup-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

type DbModule = typeof import("../../db");
let dbm: DbModule;
let importService: (typeof import("../import-service"))["importService"];

const payload = (sourceKey: string, externalId: string) =>
  ({
    sessionName: "去重测试",
    sourceKey,
    totalCount: 1,
    correctCount: 1,
    errorCount: 0,
    statsCount: 0,
    questions: [
      {
        externalId,
        content: "下列属于教育目的的功能的有（　　）",
        contentHtml: "<p>下列属于教育目的的功能的有（　　）</p>",
        options: ["导向功能", "选择功能", "激励功能", "评价功能"],
        answer: '["A","B","C","D"]',
        explanation: "解析",
        explanationHtml: "<p>解析</p>",
        tags: ["教育目的"],
        source: "fenbi_import",
        type: "multi",
        dimension: "knowledge",
      },
    ],
    records: [
      { externalId, userAnswer: '["A","B","C","D"]', isCorrect: true, durationMs: 1000 },
    ],
  }) as never;

describe("题目内容级去重", () => {
  beforeAll(async () => {
    dbm = await import("../../db");
    await dbm.initDatabase();
    await dbm.drizzleDb.run(
      "INSERT INTO users (id, username, password_hash) VALUES (1, 'dedup-tester', 'x')" as never,
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

  it("归一化对全角/标点/空白稳定", async () => {
    const { normalizeQuestionContent, contentHash } = await import(
      "../question-dedup"
    );
    expect(normalizeQuestionContent("（Ａ）　教育，目的。")).toBe(
      normalizeQuestionContent("(A)教育目的"),
    );
    expect(contentHash("教育目的（　）")).toBe(contentHash("教育目的()"));
  });

  it("同题干不同 external_id 的第二次导入不新增题目，日志照常记录", async () => {
    await importService.importFenbiData(1, payload("dedup-src-1", "dedup-ext-1"));
    const first = await dbm.drizzleDb.all(
      "SELECT id, content_hash FROM questions WHERE content LIKE '下列属于教育目的的功能的有%'" as never,
    );
    expect(first.length).toBe(1);
    expect((first[0] as { content_hash: string }).content_hash).toBeTruthy();

    await importService.importFenbiData(1, payload("dedup-src-2", "dedup-ext-2"));
    const after = await dbm.drizzleDb.all(
      "SELECT id FROM questions WHERE content LIKE '下列属于教育目的的功能的有%'" as never,
    );
    expect(after.length).toBe(1);

    const logs = await dbm.drizzleDb.all(
      "SELECT count(*) AS n FROM practice_logs WHERE question_id = (SELECT id FROM questions WHERE content LIKE '下列属于教育目的的功能的有%')" as never,
    );
    expect(Number((logs[0] as { n: number }).n)).toBe(2);
  });
});
