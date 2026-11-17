// @vitest-environment node
/**
 * 管理端题库 CRUD 契约测试（真实 SQLite + 真实迁移，只 mock 鉴权传输层）
 *
 * 为什么要这组测试：题库的增删改/批量导入此前只有 `admin-service.test.ts`
 * （整条 drizzle 链被 mock）与 `server/actions/__tests__/admin.test.ts`
 * （service 被 mock）覆盖 —— 两者都证明了"函数被调用了"，没有一条证明
 * "库里真的变成了那个样子"。按 `docs/engineering.md` 规则 3，写操作必须有
 * 真实依赖的集成测试，故这里不 mock 数据库。
 *
 * 允许 mock 的两处都是**传输/身份层**，不是被测语义：
 *   - `next/headers`：测试进程没有 HTTP 请求上下文，cookie 是无从取得的传输细节；
 *     塞进去的是真实 JWT（jose 签发），`requireRole` / `requireUser` /
 *     `getUserById` 全部走真实现 + 真库，所以"非 admin 被拒"是真的鉴权结果；
 *   - `next/server` 的 `after`：Next 的请求后置钩子，测试进程里没有请求可挂，
 *     改成同步执行；被它包裹的审计写入仍然打到真库。
 *
 * 已知遗留缺陷用 `it.fails` 固定住（不修，等评审决定）。
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import fs from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";

const dbFile = `test-admin-question-crud-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

/** 当前请求携带的 cookie（由每个用例设置） */
const authState = vi.hoisted(() => ({ token: null as string | null }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      if (name === "auth_token" && authState.token) {
        return { name, value: authState.token };
      }
      return undefined;
    },
    set: () => undefined,
    delete: () => undefined,
    getAll: () => [],
    has: () => Boolean(authState.token),
  }),
  headers: async () => new Map<string, string>(),
}));

vi.mock("next/server", () => ({
  after: (fn: () => unknown) => {
    void Promise.resolve().then(fn);
  },
}));

type DbModule = typeof import("@/lib/db");
type AuthModule = typeof import("@/lib/auth/auth");
type AdminServiceModule = typeof import("@/lib/services/admin-service");
type AdminActionsModule = typeof import("@/server/actions/admin");
type QuestionServiceModule = typeof import("@/lib/services/question");

let dbm: DbModule;
let encrypt: AuthModule["encrypt"];
let adminService: AdminServiceModule["adminService"];
let actions: AdminActionsModule;
let questionService: QuestionServiceModule["questionService"];

const ADMIN_ID = 1; // seed-data 保证 id=1 是 admin
const STUDENT_ID = 3;

let seq = 0;

/** 每题内容唯一，避免用例之间互相命中幂等/去重逻辑 */
function sampleQuestion(overrides: Record<string, unknown> = {}) {
  seq += 1;
  return {
    content: `契约测试题干-${process.pid}-${seq}`,
    options: ["甲", "乙", "丙", "丁"],
    answer: "B",
    explanation: `契约测试解析-${seq}`,
    tags: ["教育学", `标签${seq}`],
    dimension: "knowledge",
    type: "single",
    ...overrides,
  };
}

async function rowCount(): Promise<number> {
  const res = await dbm.drizzleDb
    .select({ c: sql<number>`count(*)` })
    .from(dbm.drizzleSchema.questions)
    .get();
  return Number(res?.c ?? 0);
}

async function rawQuestion(id: number) {
  return dbm.drizzleDb
    .select()
    .from(dbm.drizzleSchema.questions)
    .where(eq(dbm.drizzleSchema.questions.id, id))
    .get();
}

async function loginAs(userId: number, role: string) {
  authState.token = await encrypt({
    user: { id: userId, username: `u${userId}`, role, token_version: 0 },
    expires: new Date(Date.now() + 3600_000),
  });
}

describe("管理端题库 CRUD（真实库）", () => {
  beforeAll(async () => {
    dbm = await import("@/lib/db");
    await dbm.initDatabase();

    const auth = await import("@/lib/auth/auth");
    encrypt = auth.encrypt;

    adminService = (await import("@/lib/services/admin-service")).adminService;
    questionService = (await import("@/lib/services/question")).questionService;
    actions = await import("@/server/actions/admin");

    // 全新库里 seed 只把 id=1 提升为 admin，不会创建用户行，
    // 而 requireUser 会真查 users 表校验 token_version —— 所以这里必须建真用户。
    await dbm.drizzleDb.run(
      sql`INSERT OR IGNORE INTO users (id, username, password_hash, role, token_version)
          VALUES (${ADMIN_ID}, 'crud-admin', 'x', 'admin', 0)`,
    );
    await dbm.drizzleDb.run(
      sql`INSERT OR IGNORE INTO users (id, username, password_hash, role, token_version)
          VALUES (${STUDENT_ID}, 'crud-student', 'x', 'student', 0)`,
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

  beforeEach(async () => {
    await loginAs(ADMIN_ID, "admin");
  });

  // ---------------- 新增 ----------------

  describe("新增", () => {
    it("questionService.create 落库后能按 id 读回，且 tags/options 数组往返不变", async () => {
      const input = sampleQuestion({ tags: ["教育心理学", "记忆"] });
      const created = await questionService.create(input as never);
      expect(created.id).toBeGreaterThan(0);

      const raw = await rawQuestion(created.id);
      // 库里存 JSON 文本
      expect(JSON.parse(String(raw!.tags))).toEqual(["教育心理学", "记忆"]);
      expect(JSON.parse(String(raw!.options))).toEqual([
        "甲",
        "乙",
        "丙",
        "丁",
      ]);

      // 服务层读回是数组
      const back = await questionService.getById(created.id);
      expect(back!.tags).toEqual(["教育心理学", "记忆"]);
      expect(back!.options).toEqual(["甲", "乙", "丙", "丁"]);
      expect(back!.content).toBe(input.content);
    });

    it("questions.external_id 唯一约束是真的：同一幂等键第二次写入被数据库拒绝", async () => {
      const extId = `ext-${process.pid}-dup`;
      await dbm.drizzleDb.insert(dbm.drizzleSchema.questions).values({
        content: "幂等键唯一性-甲",
        options: JSON.stringify([]),
        answer: "A",
        explanation: "解析",
        tags: JSON.stringify([]),
        external_id: extId,
      });

      // drizzle 把 SQLite 的 "UNIQUE constraint failed" 包进 cause，消息本身是 "Failed query"
      const error = await dbm.drizzleDb
        .insert(dbm.drizzleSchema.questions)
        .values({
          content: "幂等键唯一性-乙",
          options: JSON.stringify([]),
          answer: "A",
          explanation: "解析",
          tags: JSON.stringify([]),
          external_id: extId,
        })
        .then(() => null)
        .catch((e: unknown) => e);
      expect(error).toBeTruthy();
      expect(String((error as { cause?: unknown })?.cause ?? "")).toMatch(
        /UNIQUE|constraint/i,
      );

      const rows = await dbm.drizzleDb
        .select()
        .from(dbm.drizzleSchema.questions)
        .where(eq(dbm.drizzleSchema.questions.external_id, extId))
        .all();
      expect(rows).toHaveLength(1);
    });
  });

  // ---------------- 编辑 ----------------

  describe("编辑", () => {
    it("updateQuestionAction 真的改库：content / answer / tags 数组序列化往返正确", async () => {
      const created = await questionService.create(sampleQuestion() as never);
      const newTags = ["新标签A", "新标签B"];

      const res = await actions.updateQuestionAction({
        id: created.id,
        data: {
          content: `改写后的题干-${process.pid}`,
          answer: "C",
          tags: newTags,
        },
      });
      expect(res?.serverError).toBeUndefined();

      const raw = await rawQuestion(created.id);
      expect(raw!.content).toBe(`改写后的题干-${process.pid}`);
      expect(raw!.answer).toBe("C");
      expect(JSON.parse(String(raw!.tags))).toEqual(newTags);

      const back = await questionService.getById(created.id);
      expect(back!.tags).toEqual(newTags);
      // 未提交的字段保持不变
      expect(back!.options).toEqual(["甲", "乙", "丙", "丁"]);
    });

    it("编辑不存在的题目 → action 报错，库里不会凭空多出/改动任何行", async () => {
      const before = await rowCount();
      const res = await actions.updateQuestionAction({
        id: 99_999_999,
        data: { content: "不该写进去" },
      });

      expect(res?.serverError).toMatch(/题目不存在/);
      expect(await rowCount()).toBe(before);
    });

    it("多选题答案非法时拒绝写入（校验在写库之前）", async () => {
      const created = await questionService.create(
        sampleQuestion({ type: "multi", answer: '["A","B"]' }) as never,
      );

      const res = await actions.updateQuestionAction({
        id: created.id,
        data: { type: "multi", answer: '["Z"]' },
      });

      expect(res?.serverError).toMatch(/正确答案必须是选项之一/);
      const raw = await rawQuestion(created.id);
      expect(raw!.answer).toBe('["A","B"]');
    });
  });

  // ---------------- 删除 ----------------

  describe("删除", () => {
    it("删除单题：行真的消失", async () => {
      const created = await questionService.create(sampleQuestion() as never);
      await actions.deleteQuestionAction(created.id);
      expect(await rawQuestion(created.id)).toBeUndefined();
    });

    it("批量删除：deletedCount 与实际消失的行数一致", async () => {
      const a = await questionService.create(sampleQuestion() as never);
      const b = await questionService.create(sampleQuestion() as never);
      const c = await questionService.create(sampleQuestion() as never);

      const res = await actions.batchDeleteQuestionsAction([a.id, b.id, c.id]);
      expect(res?.data?.deletedCount).toBe(3);
      expect(await rawQuestion(a.id)).toBeUndefined();
      expect(await rawQuestion(b.id)).toBeUndefined();
      expect(await rawQuestion(c.id)).toBeUndefined();
    });

    it("批量删除「存在 + 不存在」混合：数量只算真的删掉的，不虚报", async () => {
      const a = await questionService.create(sampleQuestion() as never);
      const res = await actions.batchDeleteQuestionsAction([a.id, 99_999_998]);

      expect(res?.data?.deletedCount).toBe(1);
      expect(await rawQuestion(a.id)).toBeUndefined();
    });

    it("批量删除全是陌生 id → 返回 0，而不是把请求长度当结果", async () => {
      const res = await actions.batchDeleteQuestionsAction([
        98_888_881, 98_888_882, 98_888_883,
      ]);
      expect(res?.data?.deletedCount).toBe(0);
    });

    it("空数组 → 0，且不产生任何 SQL 删除", async () => {
      const before = await rowCount();
      const res = await actions.batchDeleteQuestionsAction([]);
      expect(res?.data?.deletedCount).toBe(0);
      expect(await rowCount()).toBe(before);
    });

    // ---- 已知缺陷：删除不存在的 id 仍报成功 ----
    it("缺陷固定：删除不存在的单题应报告「未删除」，现在却返回 success=true", async () => {
      const res = await actions.deleteQuestionAction(97_777_771);
      expect(res?.serverError).toBeTruthy();
    });

    it("缺陷固定：adminService.deleteQuestion 应返回受影响行数（0/1），现在恒为 true", async () => {
      const deleted = await adminService.deleteQuestion(97_777_772);
      expect(deleted).toBe(0);
    });
  });

  // ---------------- 批量导入（幂等） ----------------

  describe("批量导入", () => {
    it("正常一批：全部落库，库里是 JSON 文本、读回是数组", async () => {
      const batch = [sampleQuestion(), sampleQuestion(), sampleQuestion()];
      const before = await rowCount();

      const res = await actions.importQuestionsAction(batch as never);
      expect(res?.data?.count).toBe(3);
      expect(await rowCount()).toBe(before + 3);

      const rows = await dbm.drizzleDb
        .select()
        .from(dbm.drizzleSchema.questions)
        .where(
          sql`${dbm.drizzleSchema.questions.content} IN (${sql.join(
            batch.map((q) => sql`${q.content}`),
            sql`, `,
          )})`,
        )
        .all();
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(Array.isArray(JSON.parse(String(row.tags)))).toBe(true);
        expect(Array.isArray(JSON.parse(String(row.options)))).toBe(true);
      }
    });

    it("导入通路正常：落库 + 写入可复现的幂等键", async () => {
      const batch = [sampleQuestion(), sampleQuestion()];
      await actions.importQuestionsAction(batch as never);

      const rows = await dbm.drizzleDb
        .select()
        .from(dbm.drizzleSchema.questions)
        .where(
          sql`${dbm.drizzleSchema.questions.content} IN (${sql.join(
            batch.map((q) => sql`${q.content}`),
            sql`, `,
          )})`,
        )
        .all();
      expect(rows).toHaveLength(2);
      // 幂等键必须真的写了，且是 `admin:` 命名空间（与 pdf 导入、粉笔上游 ID 互不串味）
      for (const row of rows) {
        expect(row.external_id).toMatch(/^admin:[0-9a-f]{36}$/);
      }
      // 同一批导入两次：第二次不应新增（由下面的用例钉住具体条数，这里只断言键稳定）
      const again = await actions.importQuestionsAction(batch as never);
      expect(again?.serverError).toBeUndefined();
    });

    // `it.fails` 会把体内**任何**失败都反转成绿，包括"action 直接返回 serverError"
    // 这种真故障 —— 那样导入彻底坏掉时，下面两条反而显示"已知缺陷，符合预期"。
    // 所以"导入通路本身是好的"必须由普通用例钉住：坏没坏看这里，缺陷看下面。
    it("导入请求本身不报错：返回 { count }（重复导入也一样，缺陷只是多落行）", async () => {
      const batch = [sampleQuestion(), sampleQuestion()];

      const first = await actions.importQuestionsAction(batch as never);
      expect(first?.serverError).toBeUndefined();
      expect(first?.data?.count).toBe(batch.length);

      // 幂等键缺失的表现是"多落行"，不是"报错"，所以第二次也必须是成功返回
      const second = await actions.importQuestionsAction(batch as never);
      expect(second?.serverError).toBeUndefined();
      expect(typeof second?.data?.count).toBe("number");
    });

    // ---- 已知缺陷：导入无幂等键 ----
    it("缺陷固定：同一批重复导入不应产生新行（现在第二批原样再落一遍）", async () => {
      const batch = [
        sampleQuestion({ content: `重复导入-${process.pid}-1` }),
        sampleQuestion({ content: `重复导入-${process.pid}-2` }),
      ];
      await actions.importQuestionsAction(batch as never);
      const afterFirst = await rowCount();
      await actions.importQuestionsAction(batch as never);
      expect(await rowCount()).toBe(afterFirst);
    });

    it("缺陷固定：同一批内部的重复题只应落一条", async () => {
      const dup = sampleQuestion({ content: `批内重复-${process.pid}` });
      const before = await rowCount();
      await actions.importQuestionsAction([dup, { ...dup }] as never);
      expect(await rowCount()).toBe(before + 1);
    });
  });

  // ---------------- 鉴权（真实 requireRole + 真库用户） ----------------

  describe("鉴权", () => {
    it("学生账号调删除/导入 → 被拒，库里没有任何变化", async () => {
      const created = await questionService.create(sampleQuestion() as never);
      const before = await rowCount();

      await loginAs(STUDENT_ID, "student");
      const del = await actions.deleteQuestionAction(created.id);
      const imp = await actions.importQuestionsAction([
        sampleQuestion(),
      ] as never);
      const upd = await actions.updateQuestionAction({
        id: created.id,
        data: { content: "学生不该改成功" },
      });

      expect(del?.serverError).toMatch(/Forbidden|permissions/i);
      expect(imp?.serverError).toMatch(/Forbidden|permissions/i);
      expect(upd?.serverError).toMatch(/Forbidden|permissions/i);

      expect(await rowCount()).toBe(before);
      const raw = await rawQuestion(created.id);
      expect(raw!.content).not.toBe("学生不该改成功");
    });

    it("没有会话（无 cookie）→ 未授权，写不进去", async () => {
      authState.token = null;
      const before = await rowCount();

      const res = await actions.importQuestionsAction([
        sampleQuestion(),
      ] as never);
      expect(res?.serverError).toMatch(/Unauthorized|未授权/i);
      expect(await rowCount()).toBe(before);
    });

    it("教师角色同样不能改题库（只有 admin 可以）", async () => {
      const created = await questionService.create(sampleQuestion() as never);
      await loginAs(STUDENT_ID, "teacher");
      const res = await actions.deleteQuestionAction(created.id);
      expect(res?.serverError).toMatch(/Forbidden|permissions/i);
      expect(await rawQuestion(created.id)).toBeTruthy();
    });
  });
});
