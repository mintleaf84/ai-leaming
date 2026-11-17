// @vitest-environment node
/**
 * 设置服务（真实 SQLite + 真实迁移）。
 *
 * 原来把 select/insert/delete/transaction 全部 mock 掉，断言只能停在
 * 「insert 被调用 3 次」——即使 upsert 的 conflict target 写错、事务里少删一张表，
 * 测试也照样绿。这里改为真库：
 *   - getSettings 读的是 system_settings 里真实存在的行；
 *   - updateSettings 后回查每一行的 value，并验「重复更新不产生第二行」；
 *   - resetUserData 断言 6 张表的行真的空了，且别的用户的数据一行没动。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import type { SystemSettings } from "../settings";

const dbFile = `test-settings-service-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

type DbModule = typeof import("../../db");
type SettingsModule = typeof import("../settings");

let dbm: DbModule;
let settingsService: SettingsModule["settingsService"];

const USER_A = 840;
const USER_B = 841;

let questionId = 0;

/** system_settings 里某用户的全部键值对 */
async function settingRows(userId: number) {
  return dbm.drizzleDb
    .select()
    .from(dbm.drizzleSchema.system_settings)
    .where(eq(dbm.drizzleSchema.system_settings.user_id, userId));
}

/** resetUserData 声称会清的 6 张表 */
const RESET_TABLES = [
  "practice_logs",
  "practice_sessions",
  "user_mastery",
  "observation_zone",
  "chat_sessions",
  "knowledge_cards",
] as const;

/** 直接用 SQL 数行，避免为每张表各写一份 drizzle 查询 */
async function countRows(
  table: (typeof RESET_TABLES)[number],
  userId: number,
): Promise<number> {
  const rows = (await dbm.drizzleDb.all(
    sql`SELECT COUNT(*) AS n FROM ${sql.raw(table)} WHERE user_id = ${userId}`,
  )) as Array<{ n: number }>;
  return Number(rows[0].n);
}

/** 给某个用户在 6 张「重置」表里各放一行，用于验证 resetUserData 的覆盖范围 */
async function seedUserLearningData(userId: number, suffix: string) {
  const s = dbm.drizzleSchema;
  await dbm.drizzleDb.insert(s.practice_sessions).values({
    id: `settings-sess-${suffix}`,
    user_id: userId,
    session_name: "设置测试会话",
    total_questions: 1,
    correct_count: 1,
  });
  await dbm.drizzleDb.insert(s.practice_logs).values({
    session_id: `settings-sess-${suffix}`,
    user_id: userId,
    question_id: questionId,
    user_answer: "A",
    is_correct: true,
  });
  await dbm.drizzleDb.insert(s.user_mastery).values({
    user_id: userId,
    tag_name: `标签-${suffix}`,
    score: 60,
  });
  await dbm.drizzleDb.insert(s.observation_zone).values({
    user_id: userId,
    tag_name: `观察-${suffix}`,
    reason: "连续错 3 次",
  });
  await dbm.drizzleDb.insert(s.chat_sessions).values({
    user_id: userId,
    title: `会话-${suffix}`,
  });
  await dbm.drizzleDb.insert(s.knowledge_cards).values({
    user_id: userId,
    title: `卡片-${suffix}`,
    tags: "[]",
    key_points: "[]",
  });
}

beforeAll(async () => {
  dbm = await import("../../db");
  await dbm.initDatabase();

  await dbm.drizzleDb
    .insert(dbm.drizzleSchema.users)
    .values([
      { id: USER_A, username: "settings-a", password_hash: "x" },
      { id: USER_B, username: "settings-b", password_hash: "x" },
    ])
    .onConflictDoNothing();

  const [question] = await dbm.drizzleDb
    .insert(dbm.drizzleSchema.questions)
    .values({
      content: "设置测试题",
      options: '["A","B"]',
      answer: "A",
      tags: "[]",
      dimension: "knowledge",
      type: "single",
      external_id: "settings-ext-001",
    })
    .returning({ id: dbm.drizzleSchema.questions.id });
  questionId = question.id;

  const svc = await import("../settings");
  settingsService = svc.settingsService;
});

beforeEach(async () => {
  const s = dbm.drizzleSchema;
  for (const table of [
    s.practice_logs,
    s.practice_sessions,
    s.user_mastery,
    s.observation_zone,
    s.chat_sessions,
    s.knowledge_cards,
    s.system_settings,
  ]) {
    await dbm.drizzleDb.delete(table);
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

describe("getSettings", () => {
  it("库里没有该用户的行时返回默认值", async () => {
    const result = await settingsService.getSettings(USER_A);

    expect(result).toEqual({
      reviewThreshold: 60,
      aiSeverity: "medium",
      darkMode: false,
    });
    expect(await settingRows(USER_A)).toHaveLength(0);
  });

  it("返回库里真实存储的值（含 dark_mode 字符串布尔）", async () => {
    await dbm.drizzleDb.insert(dbm.drizzleSchema.system_settings).values([
      { user_id: USER_A, key: "review_threshold", value: "80" },
      { user_id: USER_A, key: "ai_severity", value: "high" },
      { user_id: USER_A, key: "dark_mode", value: "true" },
    ]);

    const result = await settingsService.getSettings(USER_A);

    expect(result.reviewThreshold).toBe(80);
    expect(result.aiSeverity).toBe("high");
    expect(result.darkMode).toBe(true);
  });

  it("部分键缺失时逐项回退默认值", async () => {
    await dbm.drizzleDb
      .insert(dbm.drizzleSchema.system_settings)
      .values({ user_id: USER_A, key: "review_threshold", value: "75" });

    const result = await settingsService.getSettings(USER_A);

    expect(result.reviewThreshold).toBe(75);
    expect(result.aiSeverity).toBe("medium");
    expect(result.darkMode).toBe(false);
  });

  it('dark_mode 存 "false" 时解析为 false', async () => {
    await dbm.drizzleDb
      .insert(dbm.drizzleSchema.system_settings)
      .values({ user_id: USER_A, key: "dark_mode", value: "false" });

    expect((await settingsService.getSettings(USER_A)).darkMode).toBe(false);
  });

  it("只读本用户的行：别人的设置不会串味", async () => {
    await dbm.drizzleDb.insert(dbm.drizzleSchema.system_settings).values([
      { user_id: USER_A, key: "review_threshold", value: "70" },
      { user_id: USER_B, key: "review_threshold", value: "95" },
    ]);

    expect((await settingsService.getSettings(USER_A)).reviewThreshold).toBe(
      70,
    );
    expect((await settingsService.getSettings(USER_B)).reviewThreshold).toBe(
      95,
    );
  });
});

describe("updateSettings", () => {
  it("单个设置写入后回查库里那一行", async () => {
    await settingsService.updateSettings(USER_A, { reviewThreshold: 85 });

    const rows = await settingRows(USER_A);
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("review_threshold");
    expect(rows[0].value).toBe("85");
    expect((await settingsService.getSettings(USER_A)).reviewThreshold).toBe(
      85,
    );
  });

  it("多个设置各落一行，键名映射正确", async () => {
    await settingsService.updateSettings(USER_A, {
      reviewThreshold: 90,
      aiSeverity: "high",
      darkMode: true,
    });

    const rows = await settingRows(USER_A);
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(rows).toHaveLength(3);
    expect(map).toEqual({
      review_threshold: "90",
      ai_severity: "high",
      dark_mode: "true",
    });
  });

  it("重复更新是 upsert：值被覆盖、行数不增加", async () => {
    await settingsService.updateSettings(USER_A, { reviewThreshold: 70 });
    await settingsService.updateSettings(USER_A, { reviewThreshold: 95 });

    const rows = await settingRows(USER_A);
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe("95");
  });

  it("空对象不写任何行", async () => {
    await settingsService.updateSettings(USER_A, {});

    expect(await settingRows(USER_A)).toHaveLength(0);
  });

  it("undefined 字段被跳过：只写传了的那个键", async () => {
    const partial: Partial<SystemSettings> = {
      reviewThreshold: 70,
    };

    await settingsService.updateSettings(USER_A, partial);

    const rows = await settingRows(USER_A);
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("review_threshold");
  });

  it("写入只影响本用户", async () => {
    await settingsService.updateSettings(USER_A, { reviewThreshold: 70 });

    expect(await settingRows(USER_B)).toHaveLength(0);
  });
});

describe("resetUserData", () => {
  it("清空 6 张表的本用户数据，别的用户一行不动", async () => {
    await seedUserLearningData(USER_A, "a");
    await seedUserLearningData(USER_B, "b");

    // 前置：6 张表各自都有 A 的行
    for (const table of RESET_TABLES) {
      expect(await countRows(table, USER_A)).toBe(1);
    }

    const result = await settingsService.resetUserData(USER_A);
    expect(result).toBe(true);

    for (const table of RESET_TABLES) {
      expect(await countRows(table, USER_A)).toBe(0);
      expect(await countRows(table, USER_B)).toBe(1);
    }
  });

  it("无数据用户调用也不报错（幂等）", async () => {
    expect(await settingsService.resetUserData(USER_A)).toBe(true);
    expect(await settingsService.resetUserData(USER_A)).toBe(true);
  });

  it("不碰 system_settings（重置学习数据不等于恢复默认配置）", async () => {
    await settingsService.updateSettings(USER_A, { reviewThreshold: 88 });

    await settingsService.resetUserData(USER_A);

    const rows = await settingRows(USER_A);
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe("88");
  });
});

// 保持 SystemSettings 类型导出被使用，避免 no-unused-vars
describe("SystemSettings 类型", () => {
  it("服务返回结构满足该类型", async () => {
    const settings: SystemSettings = await settingsService.getSettings(USER_A);
    expect(typeof settings.reviewThreshold).toBe("number");
    expect(["low", "medium", "high"]).toContain(settings.aiSeverity);
    expect(typeof settings.darkMode).toBe("boolean");
  });
});

// and 仅用于确认多条件查询可用（真实库上的复合 where）
describe("system_settings 复合主键", () => {
  it("同一 (user, key) 重复插入被主键拒绝", async () => {
    await dbm.drizzleDb
      .insert(dbm.drizzleSchema.system_settings)
      .values({ user_id: USER_A, key: "dark_mode", value: "true" });

    await expect(
      dbm.drizzleDb
        .insert(dbm.drizzleSchema.system_settings)
        .values({ user_id: USER_A, key: "dark_mode", value: "false" }),
    ).rejects.toThrow();

    const rows = await dbm.drizzleDb
      .select()
      .from(dbm.drizzleSchema.system_settings)
      .where(
        and(
          eq(dbm.drizzleSchema.system_settings.user_id, USER_A),
          eq(dbm.drizzleSchema.system_settings.key, "dark_mode"),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe("true");
  });
});
