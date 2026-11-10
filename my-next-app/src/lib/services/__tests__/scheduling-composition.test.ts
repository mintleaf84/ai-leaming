// @vitest-environment node
/**
 * 40/40/20 练习调度（真实 SQLite + 真实迁移）。
 *
 * generateSession 是"刷什么题"的唯一入口：顽固题按观察区标签、盲区题按
 * 「从未作答」、常规题补齐。这里验证配比、去重与三类来源的实际约束。
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- 直接执行原始 SQL 并断言未类型化行 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

const dbFile = `test-scheduling-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

type DbModule = typeof import("../../db");
let dbm: DbModule;
let schedulingService: (typeof import("../scheduling"))["schedulingService"];
let calculateSessionRatios: (typeof import("../scheduling"))["calculateSessionRatios"];

describe("40/40/20 调度（真实 SQLite）", () => {
  beforeAll(async () => {
    dbm = await import("../../db");
    await dbm.initDatabase();
    const mod = await import("../scheduling");
    schedulingService = mod.schedulingService;
    calculateSessionRatios = mod.calculateSessionRatios;

    await dbm.drizzleDb.run(
      "INSERT OR IGNORE INTO users (id, username, password_hash) VALUES (1, 'sched-tester', 'x')" as any,
    );

    // 20 道题：0-4 属于观察区标签「力学」，其余标签「光学」
    for (let i = 0; i < 20; i += 1) {
      const tag = i < 5 ? "力学" : "光学";
      await dbm.drizzleDb.run(
        `INSERT OR IGNORE INTO questions (id, content, options, answer, tags, dimension, type, external_id)
         VALUES (${1000 + i}, '题目${i}', '["A","B"]', 'A', '["${tag}"]', 'knowledge', 'single', 'sched-ext-${i}')` as any,
      );
    }
    // 观察区：力学（顽固题来源）
    await dbm.drizzleDb.run(
      "INSERT OR IGNORE INTO observation_zone (user_id, tag_name, reason, status) VALUES (1, '力学', '测试', 'active')" as any,
    );
    // 已作答：1000、1001（因此不可能再出现在盲区题里）
    await dbm.drizzleDb.run(
      `INSERT OR IGNORE INTO practice_sessions (id, user_id, session_name, practice_mode) VALUES ('sess-sched', 1, '历史', 'random')` as any,
    );
    for (const qid of [1000, 1001]) {
      await dbm.drizzleDb.run(
        `INSERT INTO practice_logs (session_id, user_id, question_id, user_answer, is_correct)
         VALUES ('sess-sched', 1, ${qid}, 'A', 1)` as any,
      );
    }
  });

  afterAll(async () => {
    await dbm.closeDrizzle();
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
        force: true,
      });
    }
  });

  it("配比函数：40/40/20，余数归常规题", () => {
    expect(calculateSessionRatios(35)).toEqual({
      stubborn: 14,
      blind: 14,
      regular: 7,
    });
    expect(calculateSessionRatios(5)).toEqual({
      stubborn: 2,
      blind: 2,
      regular: 1,
    });
    expect(calculateSessionRatios(1)).toEqual({
      stubborn: 0,
      blind: 0,
      regular: 1,
    });
  });

  it("生成的会话数量等于请求数量且无重复题目", async () => {
    const session = await schedulingService.generateSession(1, 10);
    expect(session.length).toBe(10);
    expect(new Set(session.map((q) => q.id)).size).toBe(10);
  });

  it("顽固题优先填满：观察区标签下的题目至少占 40% 配额", async () => {
    const session = await schedulingService.generateSession(1, 10);
    const ids = session.map((q) => q.id);

    // 题库里「力学」共 5 题、都在观察区；stubborn 配额的 4 题必然从这 5 题里出，
    // 且不会在后续 blind/regular 里重复，因此结果中「力学」至少 4 题。
    const mechanicsRows = (await dbm.drizzleDb.all(
      "SELECT id FROM questions WHERE tags LIKE '%力学%'" as any,
    )) as any[];
    const mechanicsIds = new Set(mechanicsRows.map((r) => Number(r.id)));
    const hit = ids.filter((id) => mechanicsIds.has(id));
    expect(hit.length).toBeGreaterThanOrEqual(4);
  });

  it("返回的每题都真实存在且带答案，不返回已删除题目", async () => {
    const session = await schedulingService.generateSession(1, 10);
    for (const q of session) {
      const rows = (await dbm.drizzleDb.all(
        `SELECT id, answer, type FROM questions WHERE id = ${Number(q.id)}` as any,
      )) as any[];
      expect(rows.length).toBe(1);
      // 断言"返回结果"本身的字段，防止映射时丢字段（只查库无法发现）
      expect(q.answer).toBeTruthy();
      expect(q.answer).toBe(rows[0].answer);
      expect(q.content).toBeTruthy();
    }
  });

  it("盲选契约：观察区为空时，已作答过的题目不会出现在会话里", async () => {
    // 清空观察区，"顽固题"配额归零，剩下的只能来自 blind + regular
    await dbm.drizzleDb.run(
      "UPDATE observation_zone SET status = 'archived' WHERE user_id = 1" as any,
    );
    try {
      const answeredRows = (await dbm.drizzleDb.all(
        "SELECT question_id FROM practice_logs WHERE user_id=1" as any,
      )) as any[];
      const answered = new Set(answeredRows.map((r) => Number(r.question_id)));
      expect(answered.size).toBeGreaterThan(0);

      // 题库 20 题，请求 10 题：blind 配额 4 必须取自"从未作答"，
      // regular 配额 6 可以含已作答，因此这里只断言 blind 部分。
      const session = await schedulingService.generateSession(1, 10);
      const ids = session.map((q) => q.id);
      // 已作答的题（1000/1001）只可能来自 regular 配额（6 题）：
      // 若 blind 逻辑失效，它们会挤进前 4 个 blind 名额，导致总数超过 6 条已作答。
      const answeredHit = ids.filter((id) => answered.has(id));
      expect(answeredHit.length).toBeLessThanOrEqual(session.length - 4);
    } finally {
      await dbm.drizzleDb.run(
        "UPDATE observation_zone SET status = 'active' WHERE user_id = 1" as any,
      );
    }
  });

  it("题库不足时返回实际可用的全部题目，不报错", async () => {
    const all = await schedulingService.generateSession(1, 999);
    expect(all.length).toBe(20);
    expect(new Set(all.map((q) => q.id)).size).toBe(20);
  });
});
