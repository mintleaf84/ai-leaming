// @vitest-environment node
/**
 * 掌握度服务（真实 SQLite + 真实迁移）。
 *
 * 原实现用 `setupTestDb()` 造库，再把 `@/lib/db` 整个 mock 成 Proxy，服务里的
 * drizzleDb 并不是真连接，等于「库是真的、服务拿到的是假的」，事务与真实连接
 * 都被绕过了。
 * 这里改成和服务一致的真实入口（DB_FILENAME + initDatabase() + 真迁移），
 * 断言一律落到库里的行上：score / correct_count / total_count / COUNT / AVG。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";

const dbFile = `test-mastery-service-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

type DbModule = typeof import("../../db");
type MasteryModule = typeof import("../mastery");

let dbm: DbModule;
let masteryService: MasteryModule["masteryService"];

const USER_A = 820;
const USER_B = 821;

/** 读一行 user_mastery（不存在返回 undefined） */
async function masteryRow(userId: number, tagName: string) {
  const { user_mastery } = dbm.drizzleSchema;
  const [row] = await dbm.drizzleDb
    .select()
    .from(user_mastery)
    .where(
      and(eq(user_mastery.user_id, userId), eq(user_mastery.tag_name, tagName)),
    )
    .limit(1);
  return row;
}

async function insertMastery(
  userId: number,
  tagName: string,
  score: number,
  correct = 0,
  total = 0,
) {
  await dbm.drizzleDb.insert(dbm.drizzleSchema.user_mastery).values({
    user_id: userId,
    tag_name: tagName,
    score,
    correct_count: correct,
    total_count: total,
  });
}

beforeAll(async () => {
  dbm = await import("../../db");
  await dbm.initDatabase();

  await dbm.drizzleDb
    .insert(dbm.drizzleSchema.users)
    .values([
      { id: USER_A, username: "mastery-a", password_hash: "x" },
      { id: USER_B, username: "mastery-b", password_hash: "x" },
    ])
    .onConflictDoNothing();

  masteryService = (await import("../mastery")).masteryService;
});

beforeEach(async () => {
  const { user_mastery } = dbm.drizzleSchema;
  await dbm.drizzleDb.delete(user_mastery);
});

afterAll(async () => {
  await dbm.closeDrizzle();
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
      force: true,
    });
  }
});

describe("updateMastery", () => {
  it("首次答对：库里真的落了一行 100 分 / 1 对 1 次", async () => {
    await masteryService.updateMastery(USER_A, "教育心理学", "knowledge", true);

    const row = await masteryRow(USER_A, "教育心理学");
    expect(row).toBeTruthy();
    expect(row!.score).toBe(100);
    expect(row!.correct_count).toBe(1);
    expect(row!.total_count).toBe(1);
  });

  it("1 对 2 错后分数为 33.33（准确率按累计计数算）", async () => {
    await masteryService.updateMastery(USER_A, "教育心理学", "knowledge", true);
    await masteryService.updateMastery(USER_A, "教育心理学", "knowledge", false);
    await masteryService.updateMastery(USER_A, "教育心理学", "knowledge", false);

    const row = await masteryRow(USER_A, "教育心理学");
    expect(row!.score).toBeCloseTo(33.33, 1);
    expect(row!.correct_count).toBe(1);
    expect(row!.total_count).toBe(3);
  });

  it("isMonitoredCorrect 只加总次数、不加正确数（0/1）", async () => {
    await masteryService.updateMastery(
      USER_A,
      "教育心理学",
      "knowledge",
      true,
      true,
    );

    const row = await masteryRow(USER_A, "教育心理学");
    expect(row!.score).toBe(0);
    expect(row!.correct_count).toBe(0);
    expect(row!.total_count).toBe(1);
  });

  it("返回的 previousScore / change 取自库内前值", async () => {
    const first = await masteryService.updateMastery(
      USER_A,
      "教育学原理",
      "knowledge",
      true,
    );
    expect(first[0].previousScore).toBe(0);
    expect(first[0].newScore).toBe(100);
    expect(first[0].change).toBe(100);

    const second = await masteryService.updateMastery(
      USER_A,
      "教育学原理",
      "knowledge",
      false,
    );
    expect(second[0].previousScore).toBe(100);
    expect(second[0].newScore).toBe(50);
    expect(second[0].change).toBe(-50);

    const row = await masteryRow(USER_A, "教育学原理");
    expect(row!.score).toBe(50);
    expect(row!.total_count).toBe(2);
  });

  it("同一标签只保留一行（复合主键 upsert，不产生重复）", async () => {
    await masteryService.updateMastery(USER_A, "教育心理学", "knowledge", true);
    await masteryService.updateMastery(USER_A, "教育心理学", "knowledge", true);

    const { user_mastery } = dbm.drizzleSchema;
    const rows = await dbm.drizzleDb
      .select()
      .from(user_mastery)
      .where(eq(user_mastery.user_id, USER_A));
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(100);
    expect(rows[0].total_count).toBe(2);
  });
});

describe("getHierarchyMastery", () => {
  beforeEach(async () => {
    await insertMastery(USER_A, "教育心理学", 80);
    await insertMastery(USER_A, "教育心理学/学习动机", 60);
    await insertMastery(USER_A, "教育心理学/学习动机/强化理论", 100);
    await insertMastery(USER_A, "教育学原理", 40);
    // 同名前缀但不同用户：不应被算进 USER_A 的聚合
    await insertMastery(USER_B, "教育心理学/别人的子节点", 0);
  });

  it("按 LIKE 前缀统计父子层级：3 条，平均 80", async () => {
    const result = await masteryService.getHierarchyMastery(
      USER_A,
      "教育心理学",
    );

    expect(result.count).toBe(3);
    expect(result.avgScore).toBe(80); // (80+60+100)/3
  });

  it("没有匹配项时 AVG 为 null，服务归一成 0/0", async () => {
    const result = await masteryService.getHierarchyMastery(
      USER_A,
      "不存在的路径",
    );
    expect(result.avgScore).toBe(0);
    expect(result.count).toBe(0);
  });
});

describe("getMastery", () => {
  it("返回库内分数；标签不存在返回 0", async () => {
    await insertMastery(USER_A, "心理学", 66.5);

    expect(await masteryService.getMastery(USER_A, "心理学")).toBe(66.5);
    expect(await masteryService.getMastery(USER_A, "没学过")).toBe(0);
  });
});

describe("getMasteryEntries", () => {
  it("分页按标签升序，accuracy 由 correct/total 算出，total 为库内 COUNT", async () => {
    await insertMastery(USER_A, "B/二", 50, 3, 6);
    await insertMastery(USER_A, "A/一", 100, 2, 2);
    await insertMastery(USER_A, "C/三", 0, 0, 4);

    const page1 = await masteryService.getMasteryEntries(USER_A, {
      limit: 2,
      offset: 0,
    });

    expect(page1.total).toBe(3);
    expect(page1.items.map((item) => item.tag)).toEqual(["A/一", "B/二"]);
    expect(page1.items[0].accuracy).toBe(100);
    expect(page1.items[1].accuracy).toBe(50);
    expect(page1.items[1].score).toBe(50);

    const page2 = await masteryService.getMasteryEntries(USER_A, {
      limit: 2,
      offset: 2,
    });
    expect(page2.items.map((item) => item.tag)).toEqual(["C/三"]);
    expect(page2.items[0].accuracy).toBe(0);
  });
});

describe("getMasteryTree", () => {
  it("把分级路径还原成树：A → B → C，叶子带分数", async () => {
    await insertMastery(USER_A, "A", 10);
    await insertMastery(USER_A, "A/B", 20);
    await insertMastery(USER_A, "A/B/C", 30);

    const tree = await masteryService.getMasteryTree(USER_A);

    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("A");
    expect(tree[0].path).toBe("A");
    expect(tree[0].children[0].name).toBe("B");
    expect(tree[0].children[0].children[0].name).toBe("C");
    expect(tree[0].children[0].children[0].score).toBe(30);
  });

  it("父节点缺失时把该节点当作根", async () => {
    await insertMastery(USER_A, "X/Y/Z", 100);

    const tree = await masteryService.getMasteryTree(USER_A);

    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("Z");
    expect(tree[0].level).toBe(2);
  });

  it("只返回本用户的节点", async () => {
    await insertMastery(USER_A, "A", 10);
    await insertMastery(USER_B, "B", 90);

    const tree = await masteryService.getMasteryTree(USER_A);

    expect(tree.map((node) => node.name)).toEqual(["A"]);
  });
});

describe("user_mastery 表约束（真实迁移的复合主键）", () => {
  it("同一 (user, tag) 重复插入会被主键拒绝 —— 说明 upsert 目标列确实唯一", async () => {
    await insertMastery(USER_A, "重复", 10);
    await expect(
      dbm.drizzleDb
        .insert(dbm.drizzleSchema.user_mastery)
        .values({ user_id: USER_A, tag_name: "重复", score: 20 }),
    ).rejects.toThrow();

    const [row] = await dbm.drizzleDb
      .select({ count: sql<number>`COUNT(*)` })
      .from(dbm.drizzleSchema.user_mastery)
      .where(eq(dbm.drizzleSchema.user_mastery.user_id, USER_A));
    expect(Number(row.count)).toBe(1);
  });
});
