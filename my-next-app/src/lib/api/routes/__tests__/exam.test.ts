// @vitest-environment node
/**
 * 试卷 / 模考 REST 集成测试（docs/exam-paper-plan.md §2–§4）。
 *
 * 真实依赖：真实 SQLite（独立临时库 + 真实迁移）、真实 `authMiddleware`（真 JWT）、
 * 真实服务层（`services/exam.ts`）。不 mock 数据库，也不 mock 判分 ——
 * 判分必须走 `checkAnswerCorrectness` 的唯一实现（多选集合比较在这里验证）。
 *
 * 覆盖的边界：
 * - 手工组卷：去重/顺序、缺 id 与主观题 → 400 列出明细、限时卷参数约束；
 * - 列表统计（attemptCount/bestScore/lastAttemptAt）、详情、PATCH、DELETE（有作答 → 409）；
 * - 自动组卷：正常出卷、候选不足 → 400 带 shortfall、三段权重（wrong/weak/fresh）
 *   确实按段取题；
 * - 作答：未交卷 answer 置空（防作弊）→ 交卷判分 → practice_logs（origin=exam、
 *   未答 skipped）→ 会话汇总；
 * - 幂等：同 sessionId 重放 duplicate=true 且不写库；
 * - 限时卷：deadline 已过仍可交，overtimeMs > 0；
 * - 跨用户：他人的试卷 / 他人的作答一律 404（不是 403，不泄露 id 是否存在）。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { sign } from "hono/jwt";

const dbFile = `test-exam-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

/** 用户 A（试卷所有者）与用户 B（跨用户访客） */
const A = 941;
const B = 942;

// 手工卷用的四种客观题 + 一道主观题（必须被拒绝）
const Q_SINGLE = 9101;
const Q_MULTI = 9102;
const Q_TRUE = 9103;
const Q_FILL = 9104;
const Q_ESSAY = 9105;

/** 自动组卷：普通候选池（6 道，足够组 4 题） */
const AUTO_POOL = [9111, 9112, 9113, 9114, 9115, 9116];
/** 错题池：W1/W2 做错过，W3/W4 从未作答 */
const Q_W1 = 9121;
const Q_W2 = 9122;
const Q_W3 = 9123;
const Q_W4 = 9124;
/** 弱项池：A 对该 tag 的掌握度只有 20（阈值 60） */
const Q_K1 = 9131;
const Q_K2 = 9132;

const OPTIONS = JSON.stringify(["甲", "乙", "丙", "丁"]);

type DbModule = typeof import("@/lib/db");
let dbm: DbModule;
let app: (typeof import("../exam"))["default"];

async function tokenFor(userId: number): Promise<string> {
  return sign(
    {
      user: {
        id: userId,
        username: `exam-user-${userId}`,
        role: "student",
        token_version: 0,
      },
    },
    process.env.JWT_SECRET as string,
    "HS256",
  );
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

interface PaperSummary {
  id: number;
  title: string;
  kind: "fixed" | "timed";
  durationMinutes: number | null;
  source: "manual" | "auto";
  totalQuestions: number;
  attemptCount: number;
  bestScore: number | null;
  lastScore: number | null;
  lastAttemptAt: string | null;
}

/** 试卷预览的题目（GET /papers/{id}）：不含 answer / explanation */
interface QuestionPreview {
  id: number;
  content: string;
  options: string[];
  tags: string[];
  dimension: string | null;
  type: string | null;
  material: string | null;
}

interface PaperListBody {
  data: PaperSummary[];
  meta: { limit: number; offset: number; total: number };
}

interface QuestionPayload {
  id: number;
  content: string;
  options: string[];
  answer: string;
  explanation: string;
  tags: string[];
  dimension: string | null;
  type: string | null;
  material: string | null;
}

interface PaperDetail {
  paper: PaperSummary;
  items: Array<{ position: number; question: QuestionPreview }>;
  lastAttempt: { sessionId: string; score: number; submittedAt: string } | null;
}

interface AttemptStart {
  sessionId: string;
  paperId: number;
  deadlineAt: string | null;
  questions: QuestionPayload[];
}

interface AttemptDetail {
  sessionId: string;
  paper: PaperSummary;
  deadlineAt: string | null;
  submittedAt: string | null;
  questions: QuestionPayload[];
  answers: Array<{ questionId: number; userAnswer: string }>;
  result?: SubmitResult;
}

interface SubmitResult {
  score: number;
  correctCount: number;
  totalQuestions: number;
  durationMs: number;
  overtimeMs: number;
  overtime: boolean;
  duplicate: boolean;
  perQuestion: Array<{
    questionId: number;
    isCorrect: boolean;
    correctAnswer: string;
    explanation: string;
  }>;
}

async function api(
  token: string,
  routePath: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  return app.request(routePath, {
    method: init.method ?? "GET",
    headers: headers(token),
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

async function countLogs(sessionId: string): Promise<number> {
  const row = await dbm.drizzleDb.get<{ c: number }>(
    sql`SELECT COUNT(*) AS c FROM practice_logs WHERE session_id = ${sessionId}`,
  );
  return Number(row?.c ?? 0);
}

async function sessionRow(sessionId: string) {
  return dbm.drizzleDb.get<{
    exam_score: number | null;
    exam_submitted_at: string | null;
    correct_count: number | null;
    total_questions: number | null;
  }>(
    sql`SELECT exam_score, exam_submitted_at, correct_count, total_questions
        FROM practice_sessions WHERE id = ${sessionId}`,
  );
}

describe("试卷 / 模考 API", () => {
  beforeAll(async () => {
    dbm = await import("@/lib/db");
    await dbm.initDatabase();
    app = (await import("../exam")).default;

    for (const [id, name] of [
      [A, "exam-owner"],
      [B, "exam-intruder"],
    ] as const) {
      await dbm.drizzleDb.run(
        sql`INSERT OR IGNORE INTO users (id, username, password_hash, token_version)
            VALUES (${id}, ${name}, 'x', 0)`,
      );
    }

    const rows: Array<{
      id: number;
      content: string;
      options: string;
      answer: string;
      tags: string;
      dimension: string;
      type: string;
    }> = [
      {
        id: Q_SINGLE,
        content: "单选题：以下哪个是认知风格维度",
        options: OPTIONS,
        answer: "乙",
        tags: JSON.stringify(["exam-core"]),
        dimension: "knowledge",
        type: "single",
      },
      {
        id: Q_MULTI,
        content: "多选题：以下哪些属于学习策略",
        options: OPTIONS,
        answer: JSON.stringify(["甲", "丁"]),
        tags: JSON.stringify(["exam-core"]),
        dimension: "understanding",
        type: "multi",
      },
      {
        id: Q_TRUE,
        content: "判断题：课堂管理需要预防性策略",
        options: JSON.stringify(["正确", "错误"]),
        answer: "A",
        tags: JSON.stringify(["exam-core"]),
        dimension: "application",
        type: "truefalse",
      },
      {
        id: Q_FILL,
        content: "填空题：植物制造有机物的过程叫____",
        options: JSON.stringify([]),
        answer: "光合作用",
        tags: JSON.stringify(["exam-core"]),
        dimension: "knowledge",
        type: "fill_blank",
      },
      {
        id: Q_ESSAY,
        content: "简答题：谈谈你的教学观",
        options: JSON.stringify([]),
        answer: "参考答案",
        tags: JSON.stringify(["exam-core"]),
        dimension: "application",
        type: "short_answer",
      },
      ...AUTO_POOL.map((id, index) => ({
        id,
        content: `自动组卷候选题 ${index + 1}`,
        options: OPTIONS,
        answer: "甲",
        tags: JSON.stringify(["exam-auto"]),
        dimension: "knowledge",
        type: "single",
      })),
      ...[Q_W1, Q_W2, Q_W3, Q_W4].map((id, index) => ({
        id,
        content: `错题池候选题 ${index + 1}`,
        options: OPTIONS,
        answer: "甲",
        tags: JSON.stringify(["exam-wrong"]),
        dimension: "knowledge",
        type: "single",
      })),
      ...[Q_K1, Q_K2].map((id, index) => ({
        id,
        content: `弱项池候选题 ${index + 1}`,
        options: OPTIONS,
        answer: "甲",
        tags: JSON.stringify(["exam-weak"]),
        dimension: "knowledge",
        type: "single",
      })),
    ];

    for (const row of rows) {
      await dbm.drizzleDb.run(
        sql`INSERT OR IGNORE INTO questions
              (id, content, options, answer, explanation, tags, dimension, type)
            VALUES (${row.id}, ${row.content}, ${row.options}, ${row.answer},
                    '测试解析内容（长度满足 schema 约束）', ${row.tags},
                    ${row.dimension}, ${row.type})`,
      );
    }

    // A 做错过 W1/W2（错题池的来源）；W3/W4 保持"从未作答"
    for (const qId of [Q_W1, Q_W2]) {
      await dbm.drizzleDb.run(
        sql`INSERT INTO practice_logs
              (session_id, user_id, question_id, user_answer, is_correct, duration_ms, status)
            VALUES (NULL, ${A}, ${qId}, '丁', 0, 3000, 'answered')`,
      );
    }

    // A 在 exam-weak 这个 tag 上掌握度很低（弱项池的来源）
    await dbm.drizzleDb.run(
      sql`INSERT INTO user_mastery (user_id, tag_name, score, correct_count, total_count)
          VALUES (${A}, 'exam-weak', 20, 1, 5)`,
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

  describe("手工组卷", () => {
    it("questionIds 去重且顺序即作答顺序", async () => {
      const res = await api(await tokenFor(A), "/papers", {
        method: "POST",
        body: {
          title: "固定卷 A",
          kind: "fixed",
          questionIds: [Q_SINGLE, Q_MULTI, Q_SINGLE, Q_TRUE],
        },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        paper: PaperSummary;
        items: Array<{ position: number; questionId: number }>;
      };

      expect(body.paper).toMatchObject({
        title: "固定卷 A",
        kind: "fixed",
        source: "manual",
        totalQuestions: 3,
        durationMinutes: null,
      });
      expect(body.items).toEqual([
        { position: 1, questionId: Q_SINGLE },
        { position: 2, questionId: Q_MULTI },
        { position: 3, questionId: Q_TRUE },
      ]);
    });

    it("缺 id / 主观题 → 400 并列出具体 id", async () => {
      const res = await api(await tokenFor(A), "/papers", {
        method: "POST",
        body: {
          title: "有问题的卷",
          questionIds: [Q_SINGLE, 999999, Q_ESSAY],
        },
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as {
        error: string;
        missingQuestionIds: number[];
        unsupportedQuestionIds: number[];
      };
      expect(body.missingQuestionIds).toEqual([999999]);
      expect(body.unsupportedQuestionIds).toEqual([Q_ESSAY]);
      expect(body.error).toContain("999999");
    });

    it("限时卷必须带 durationMinutes，固定卷强制不限时", async () => {
      const token = await tokenFor(A);

      const missingDuration = await api(token, "/papers", {
        method: "POST",
        body: { title: "缺时长", kind: "timed", questionIds: [Q_SINGLE] },
      });
      // 路由 schema 允许缺省，由服务层给出可读的 400
      expect(missingDuration.status).toBe(400);

      const fixedWithDuration = await api(token, "/papers", {
        method: "POST",
        body: {
          title: "固定卷忽略时长",
          kind: "fixed",
          durationMinutes: 30,
          questionIds: [Q_SINGLE],
        },
      });
      expect(fixedWithDuration.status).toBe(200);
      const body = (await fixedWithDuration.json()) as { paper: PaperSummary };
      expect(body.paper.durationMinutes).toBeNull();
    });

    it("详情 / PATCH / 列表统计 / DELETE(409)", async () => {
      const token = await tokenFor(A);

      // 1. 建卷 + 改元信息
      const created = await api(token, "/papers", {
        method: "POST",
        body: { title: "统计卷", questionIds: [Q_SINGLE, Q_TRUE] },
      });
      const paperId = ((await created.json()) as { paper: PaperSummary }).paper
        .id;

      const patched = await api(token, `/papers/${paperId}`, {
        method: "PATCH",
        body: { title: "统计卷（改名）", kind: "timed", durationMinutes: 45 },
      });
      expect(patched.status).toBe(200);
      const patchedBody = (await patched.json()) as { paper: PaperSummary };
      expect(patchedBody.paper).toMatchObject({
        title: "统计卷（改名）",
        kind: "timed",
        durationMinutes: 45,
      });

      // 2. 详情：items 带完整题目（含 answer，卷主可见）
      const detail = await api(token, `/papers/${paperId}`);
      expect(detail.status).toBe(200);
      const detailBody = (await detail.json()) as PaperDetail;
      expect(detailBody.items.map((i) => i.question.id)).toEqual([
        Q_SINGLE,
        Q_TRUE,
      ]);
      // 预览不返回 answer / explanation（冻结决定 4）
      const previewQuestion = detailBody.items[0].question as unknown as Record<
        string,
        unknown
      >;
      expect("answer" in previewQuestion).toBe(false);
      expect("explanation" in previewQuestion).toBe(false);
      // 解析文本同样不能出现在预览里（options 本身含选项文本，不能用整串判断）
      expect(JSON.stringify(detailBody.items)).not.toContain("测试解析内容");
      expect(detailBody.lastAttempt).toBeNull();

      // 3. 作答并交卷，制造一次历史
      const attempt = await api(token, `/papers/${paperId}/attempts`, {
        method: "POST",
        body: {},
      });
      const { sessionId } = (await attempt.json()) as AttemptStart;
      const submitted = await api(token, `/attempts/${sessionId}/submit`, {
        method: "POST",
        body: {
          answers: [
            { questionId: Q_SINGLE, userAnswer: "B", durationMs: 1200 },
            { questionId: Q_TRUE, userAnswer: "A", durationMs: 800 },
          ],
        },
      });
      expect(submitted.status).toBe(200);

      // 4. 列表统计来自真实 practice_sessions 聚合
      const list = await api(token, "/papers?limit=50");
      expect(list.status).toBe(200);
      const listBody = (await list.json()) as PaperListBody;
      expect(listBody.meta).toMatchObject({ limit: 50, offset: 0 });
      expect(listBody.meta.total).toBeGreaterThanOrEqual(1);
      const listed = listBody.data.find((p) => p.id === paperId);
      expect(listed).toMatchObject({
        attemptCount: 1,
        bestScore: 1,
        // 只做过一次，最近成绩 = 最好成绩
        lastScore: 1,
        totalQuestions: 2,
      });
      // 冻结决定 7：0–1 小数口径，不混百分制
      expect(listed?.bestScore).toBeGreaterThanOrEqual(0);
      expect(listed?.bestScore).toBeLessThanOrEqual(1);
      expect(listed?.lastScore).toBeGreaterThanOrEqual(0);
      expect(listed?.lastScore).toBeLessThanOrEqual(1);
      expect(listed?.lastAttemptAt).toBeTruthy();

      // 5. 详情里出现 lastAttempt
      const detailAfter = (await (
        await api(token, `/papers/${paperId}`)
      ).json()) as PaperDetail;
      expect(detailAfter.lastAttempt?.sessionId).toBe(sessionId);
      expect(detailAfter.lastAttempt?.score).toBe(1);
      // 冻结决定 10：固定三字段，不多不少
      expect(Object.keys(detailAfter.lastAttempt ?? {}).sort()).toEqual([
        "score",
        "sessionId",
        "submittedAt",
      ]);
      expect(detailAfter.lastAttempt?.submittedAt).toBeTruthy();

      // 6. 有作答 → 409；无作答的卷可以删
      const blocked = await api(token, `/papers/${paperId}`, {
        method: "DELETE",
      });
      expect(blocked.status).toBe(409);

      const throwaway = await api(token, "/papers", {
        method: "POST",
        body: { title: "待删卷", questionIds: [Q_SINGLE] },
      });
      const throwawayId = ((await throwaway.json()) as { paper: PaperSummary })
        .paper.id;
      expect(
        (await api(token, `/papers/${throwawayId}`, { method: "DELETE" }))
          .status,
      ).toBe(200);
      expect((await api(token, `/papers/${throwawayId}`)).status).toBe(404);
    });
  });

  describe("自动组卷（§3）", () => {
    it("按标签正常出卷：落成 source=auto 的普通试卷", async () => {
      const res = await api(await tokenFor(A), "/papers/generate", {
        method: "POST",
        body: { title: "自动卷 1", count: 4, tags: ["exam-auto"] },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as PaperDetail;

      // 冻结决定 8：与 GET /papers/{id} 完全同形（没有 rules 包装）
      expect(Object.keys(body).sort()).toEqual([
        "items",
        "lastAttempt",
        "paper",
      ]);
      expect(body.paper).toMatchObject({ source: "auto", totalQuestions: 4 });
      expect(body.lastAttempt).toBeNull();

      const ids = body.items.map((i) => i.question.id);
      expect(new Set(ids).size).toBe(4);
      expect(ids.every((id) => AUTO_POOL.includes(id))).toBe(true);
      expect(body.items.map((i) => i.position)).toEqual([1, 2, 3, 4]);
      // 预览不返回答案
      const previewKeys = Object.keys(
        body.items[0].question as unknown as Record<string, unknown>,
      );
      expect(previewKeys).not.toContain("answer");
      expect(previewKeys).not.toContain("explanation");

      // 规则快照仍落库（只是不进响应）
      const rulesRow = await dbm.drizzleDb.get<{ rules_json: string }>(
        sql`SELECT rules_json FROM exam_papers WHERE id = ${body.paper.id}`,
      );
      const rulesSnapshot = JSON.parse(rulesRow?.rules_json ?? "{}") as {
        count: number;
        tags: string[];
        weights: { wrong: number; weak: number; fresh: number };
      };
      expect(rulesSnapshot.count).toBe(4);
      expect(rulesSnapshot.tags).toEqual(["exam-auto"]);
      expect(rulesSnapshot.weights).toEqual({
        wrong: 0.3,
        weak: 0.3,
        fresh: 0.4,
      });
    });

    it("count 超可用 → 400 且带 requested/available/shortfall（不静默缩水）", async () => {
      const res = await api(await tokenFor(A), "/papers/generate", {
        method: "POST",
        body: { title: "题目不够", count: 10, tags: ["exam-auto"] },
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as {
        requested: number;
        available: number;
        shortfall: number;
        error: string;
      };
      expect(body).toMatchObject({ requested: 10, available: 6, shortfall: 4 });
      expect(body.error).toContain("不足");
    });

    it("weights.wrong=1 时只取做错过的题", async () => {
      const res = await api(await tokenFor(A), "/papers/generate", {
        method: "POST",
        body: {
          title: "错题专卷",
          count: 2,
          tags: ["exam-wrong"],
          weights: { wrong: 1, weak: 0, fresh: 0 },
        },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as PaperDetail;
      expect(body.items.map((i) => i.question.id).sort()).toEqual([Q_W1, Q_W2]);
    });

    it("weights.weak=1 取掌握度低的知识点下的题", async () => {
      const res = await api(await tokenFor(A), "/papers/generate", {
        method: "POST",
        body: {
          title: "弱项专卷",
          count: 2,
          tags: ["exam-weak"],
          weights: { wrong: 0, weak: 1, fresh: 0 },
        },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as PaperDetail;
      const ids = body.items.map((i) => i.question.id).sort();
      expect(ids).toEqual([Q_K1, Q_K2]);
    });

    it("weights.fresh=1 排除做过的题", async () => {
      const res = await api(await tokenFor(A), "/papers/generate", {
        method: "POST",
        body: {
          title: "新题专卷",
          count: 2,
          tags: ["exam-wrong"],
          weights: { wrong: 0, weak: 0, fresh: 1 },
        },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as PaperDetail;
      expect(body.items.map((i) => i.question.id).sort()).toEqual([Q_W3, Q_W4]);
    });
  });

  describe("作答与交卷（§4）", () => {
    let paperId: number;
    let sessionId: string;

    it("未交卷时详情里 answer/explanation 一律置空", async () => {
      const token = await tokenFor(A);

      const created = await api(token, "/papers", {
        method: "POST",
        body: {
          title: "作答卷",
          questionIds: [Q_SINGLE, Q_MULTI, Q_FILL],
        },
      });
      paperId = ((await created.json()) as { paper: PaperSummary }).paper.id;

      const started = await api(token, `/papers/${paperId}/attempts`, {
        method: "POST",
        body: {},
      });
      expect(started.status).toBe(200);
      const startBody = (await started.json()) as AttemptStart;
      sessionId = startBody.sessionId;

      expect(startBody.questions).toHaveLength(3);
      for (const q of startBody.questions) {
        expect(q.answer).toBe("");
        expect(q.explanation).toBe("");
      }
      expect(JSON.stringify(startBody.questions)).not.toContain("光合作用");

      // 刷新（GET 作答态）同样不能泄露答案
      const detail = await api(token, `/attempts/${sessionId}`);
      expect(detail.status).toBe(200);
      const detailBody = (await detail.json()) as AttemptDetail;
      expect(detailBody.submittedAt).toBeNull();
      expect(detailBody.result).toBeUndefined();
      // 冻结决定 9：作答态 answers 是空数组（字段始终存在）
      expect(detailBody.answers).toEqual([]);
      for (const q of detailBody.questions) {
        expect(q.answer).toBe("");
        expect(q.explanation).toBe("");
      }
    });

    it("交卷：判分、写 practice_logs(origin=exam)、未答记 skipped", async () => {
      const token = await tokenFor(A);

      const res = await api(token, `/attempts/${sessionId}/submit`, {
        method: "POST",
        body: {
          clientKey: "exam-submit-1",
          answers: [
            // 单选：答案是选项文本「乙」，提交标号 B（双向匹配）
            { questionId: Q_SINGLE, userAnswer: "B", durationMs: 1500 },
            // 多选：顺序与正确集合相反，必须仍判对（集合比较）
            { questionId: Q_MULTI, userAnswer: "D,A", durationMs: 2000 },
            // Q_FILL 故意不提交 → skipped
          ],
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SubmitResult;
      expect(body).toMatchObject({
        correctCount: 2,
        totalQuestions: 3,
        duplicate: false,
        overtime: false,
        overtimeMs: 0,
      });
      expect(body.score).toBeCloseTo(2 / 3);

      const multi = body.perQuestion.find((p) => p.questionId === Q_MULTI);
      expect(multi?.isCorrect).toBe(true);
      const skipped = body.perQuestion.find((p) => p.questionId === Q_FILL);
      expect(skipped?.isCorrect).toBe(false);
      expect(body.durationMs).toBe(3500);

      // practice_logs：批量写入、origin=exam、未答 skipped、不进 FSRS
      expect(await countLogs(sessionId)).toBe(3);
      const fillLog = await dbm.drizzleDb.get<{
        origin: string;
        status: string;
        is_correct: number;
      }>(
        sql`SELECT origin, status, is_correct FROM practice_logs
            WHERE session_id = ${sessionId} AND question_id = ${Q_FILL}`,
      );
      expect(fillLog).toMatchObject({
        origin: "exam",
        status: "skipped",
        is_correct: 0,
      });

      // 冻结决定 9：answers 只回 {questionId, userAnswer}，skipped 的 Q_FILL 不出现
      const detail = (await (
        await api(token, `/attempts/${sessionId}`)
      ).json()) as AttemptDetail;
      expect(detail.answers).toEqual([
        { questionId: Q_SINGLE, userAnswer: "B" },
        { questionId: Q_MULTI, userAnswer: "D,A" },
      ]);
      expect(detail.result?.correctCount).toBe(2);

      // 会话汇总写回
      const row = await sessionRow(sessionId);
      expect(row?.exam_submitted_at).toBeTruthy();
      expect(row?.correct_count).toBe(2);
      expect(row?.total_questions).toBe(3);
      expect(Number(row?.exam_score)).toBeCloseTo(2 / 3);
    });

    it("幂等：同 sessionId 再提交 → duplicate:true 且不写库", async () => {
      const token = await tokenFor(A);
      const before = await sessionRow(sessionId);
      const beforeLogs = await countLogs(sessionId);

      const res = await api(token, `/attempts/${sessionId}/submit`, {
        method: "POST",
        body: {
          clientKey: "exam-submit-1",
          answers: [
            // 故意全错：如果重放写了库，分数会变
            { questionId: Q_SINGLE, userAnswer: "A" },
            { questionId: Q_MULTI, userAnswer: "B" },
            { questionId: Q_FILL, userAnswer: "错答" },
          ],
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SubmitResult;
      expect(body.duplicate).toBe(true);
      expect(body.correctCount).toBe(2);
      expect(body.score).toBeCloseTo(2 / 3);

      expect(await countLogs(sessionId)).toBe(beforeLogs);
      const after = await sessionRow(sessionId);
      expect(after?.exam_score).toBe(before?.exam_score);
      expect(after?.exam_submitted_at).toBe(before?.exam_submitted_at);
    });

    it("同一试卷再做一次 → 两条历史，互不覆盖", async () => {
      const token = await tokenFor(A);

      const second = await api(token, `/papers/${paperId}/attempts`, {
        method: "POST",
        body: {},
      });
      const secondSession = ((await second.json()) as AttemptStart).sessionId;
      expect(secondSession).not.toBe(sessionId);

      const submitted = await api(token, `/attempts/${secondSession}/submit`, {
        method: "POST",
        body: { answers: [] },
      });
      const body = (await submitted.json()) as SubmitResult;
      expect(body).toMatchObject({ correctCount: 0, totalQuestions: 3 });
      expect(await countLogs(secondSession)).toBe(3);

      const row = await dbm.drizzleDb.get<{ c: number }>(
        sql`SELECT COUNT(*) AS c FROM practice_sessions
            WHERE paper_id = ${paperId} AND practice_mode = 'exam'`,
      );
      expect(Number(row?.c)).toBe(2);

      const list = (await (
        await api(token, "/papers?limit=50")
      ).json()) as PaperListBody;
      const listed = list.data.find((p) => p.id === paperId);
      expect(listed?.attemptCount).toBe(2);
      // 两次成绩取最好（第一次 2/3）；最近一次是 0
      expect(listed?.bestScore).toBeCloseTo(2 / 3);
      expect(listed?.lastScore).toBe(0);
    });

    it("限时卷：deadline 已过仍可交，overtime=true 且 overtimeMs>0", async () => {
      const token = await tokenFor(A);

      const created = await api(token, "/papers", {
        method: "POST",
        body: {
          title: "超时卷",
          kind: "timed",
          durationMinutes: 1,
          questionIds: [Q_TRUE],
        },
      });
      const timedPaperId = ((await created.json()) as { paper: PaperSummary })
        .paper.id;

      const started = await api(token, `/papers/${timedPaperId}/attempts`, {
        method: "POST",
        body: {},
      });
      const startBody = (await started.json()) as AttemptStart;
      expect(startBody.deadlineAt).toBeTruthy();

      // 把截止时间挪到 10 分钟前（模拟"交卷时已经超时"）
      const past = new Date(Date.now() - 10 * 60_000).toISOString();
      await dbm.drizzleDb.run(
        sql`UPDATE practice_sessions SET deadline_at = ${past} WHERE id = ${startBody.sessionId}`,
      );

      const res = await api(token, `/attempts/${startBody.sessionId}/submit`, {
        method: "POST",
        body: { answers: [{ questionId: Q_TRUE, userAnswer: "A" }] },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as SubmitResult;
      expect(body.overtime).toBe(true);
      expect(body.overtimeMs).toBeGreaterThan(0);
      expect(body.correctCount).toBe(1);
    });
  });

  describe("跨用户归属", () => {
    it("他人试卷的读/改/删/开始作答一律 404", async () => {
      const tokenA = await tokenFor(A);
      const tokenB = await tokenFor(B);

      const created = await api(tokenA, "/papers", {
        method: "POST",
        body: { title: "A 的私有卷", questionIds: [Q_SINGLE] },
      });
      const privatePaperId = ((await created.json()) as { paper: PaperSummary })
        .paper.id;

      expect((await api(tokenB, `/papers/${privatePaperId}`)).status).toBe(404);
      expect(
        (
          await api(tokenB, `/papers/${privatePaperId}`, {
            method: "PATCH",
            body: { title: "抢过来" },
          })
        ).status,
      ).toBe(404);
      expect(
        (await api(tokenB, `/papers/${privatePaperId}`, { method: "DELETE" }))
          .status,
      ).toBe(404);
      expect(
        (
          await api(tokenB, `/papers/${privatePaperId}/attempts`, {
            method: "POST",
            body: {},
          })
        ).status,
      ).toBe(404);

      // A 的卷没有被 B 改坏
      const still = (await (
        await api(tokenA, `/papers/${privatePaperId}`)
      ).json()) as PaperDetail;
      expect(still.paper.title).toBe("A 的私有卷");

      // B 的列表里不出现 A 的卷
      const listB = (await (
        await api(tokenB, "/papers?limit=50")
      ).json()) as PaperListBody;
      expect(listB.data.some((p) => p.id === privatePaperId)).toBe(false);
    });

    it("他人作答会话的读/交卷/重放一律 404，且不改 A 的数据", async () => {
      const tokenA = await tokenFor(A);
      const tokenB = await tokenFor(B);

      const created = await api(tokenA, "/papers", {
        method: "POST",
        body: { title: "A 的作答卷", questionIds: [Q_SINGLE, Q_TRUE] },
      });
      const paperId = ((await created.json()) as { paper: PaperSummary }).paper
        .id;
      const started = await api(tokenA, `/papers/${paperId}/attempts`, {
        method: "POST",
        body: {},
      });
      const sessionId = ((await started.json()) as AttemptStart).sessionId;

      expect((await api(tokenB, `/attempts/${sessionId}`)).status).toBe(404);
      expect(
        (
          await api(tokenB, `/attempts/${sessionId}/submit`, {
            method: "POST",
            body: {
              answers: [
                { questionId: Q_SINGLE, userAnswer: "A" },
                { questionId: Q_TRUE, userAnswer: "B" },
              ],
            },
          })
        ).status,
      ).toBe(404);

      // A 的会话仍然未交卷、没有日志（B 的提交没写进 A 的会话）
      const row = await sessionRow(sessionId);
      expect(row?.exam_submitted_at).toBeNull();
      expect(await countLogs(sessionId)).toBe(0);
    });
  });
});
