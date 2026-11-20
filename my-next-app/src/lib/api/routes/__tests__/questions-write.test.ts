// @vitest-environment node
/**
 * `POST /api/questions` + `PATCH /api/questions/:id`（§35 建题/改题）。
 *
 * 真实依赖：真实 SQLite（独立临时库 + 真实迁移）、真实 JWT 鉴权、真实
 * `questionService` / `regradeQuestionLogs`。只 mock 向量索引（网络）。
 *
 * 固定四件事：
 *   1. 创建后 `GET /:id` 可读；同一用户重复提交同一内容幂等；
 *   2. 改答案后历史判分被回刷（`practice_logs.is_correct` 与会话 correct_count）；
 *   3. 非本人创建的题不可改（manual: 前缀归属）→ 403；
 *   4. 写操作进 `admin_logs`；非法内容 400 且库内零变更。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sign } from "hono/jwt";
import { sql } from "drizzle-orm";

const dbFile = `test-questions-write-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

vi.mock("@/lib/services/question-vector-index", () => ({
  indexQuestion: vi.fn().mockResolvedValue("skipped"),
}));

const A = 951;
const B = 952;

type DbModule = typeof import("@/lib/db");
let dbm: DbModule;
let app: (typeof import("../questions"))["default"];

const QUESTION = {
  content: "布鲁纳认为学习的实质是主动形成什么？",
  options: ["A. 刺激反应联结", "B. 认知结构", "C. 行为习惯", "D. 情绪反应"],
  answer: "B",
  explanation: "布鲁纳强调认知结构（表征系统）的主动建构。",
  tags: ["学习理论"],
  dimension: "knowledge",
  type: "single",
};

async function tokenFor(userId: number): Promise<string> {
  return sign(
    {
      user: {
        id: userId,
        username: `question-writer-${userId}`,
        role: "student",
        token_version: 0,
      },
    },
    process.env.JWT_SECRET as string,
    "HS256",
  );
}

function auth(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function countRows(where: string): Promise<number> {
  const rows = await dbm.drizzleDb.all<{ n: number }>(
    sql.raw(`SELECT count(*) AS n FROM ${where}`),
  );
  return Number(rows[0].n);
}

describe("questions 建题/改题", () => {
  let tokenA = "";
  let tokenB = "";

  beforeAll(async () => {
    dbm = await import("@/lib/db");
    await dbm.initDatabase();
    app = (await import("../questions")).default;

    for (const [id, name] of [
      [A, "question-writer-a"],
      [B, "question-writer-b"],
    ] as const) {
      await dbm.drizzleDb.run(
        sql`INSERT OR IGNORE INTO users (id, username, password_hash, token_version)
            VALUES (${id}, ${name}, 'x', 0)`,
      );
    }
    tokenA = await tokenFor(A);
    tokenB = await tokenFor(B);
  });

  afterAll(async () => {
    await dbm.closeDrizzle();
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
        force: true,
      });
    }
  });

  it("创建后 GET /:id 可读；同用户同内容重复创建幂等", async () => {
    const created = await app.request("/", {
      method: "POST",
      headers: auth(tokenA),
      body: JSON.stringify(QUESTION),
    });
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.created).toBe(true);
    const id = createdBody.id as number;

    const detail = await app.request(`/${id}`, { headers: auth(tokenA) });
    expect(detail.status).toBe(200);
    const detailBody = await detail.json();
    expect(detailBody.content).toBe(QUESTION.content);
    expect(detailBody.answer).toBe("B");
    expect(detailBody.options).toEqual(QUESTION.options);

    const duplicate = await app.request("/", {
      method: "POST",
      headers: auth(tokenA),
      body: JSON.stringify(QUESTION),
    });
    expect(duplicate.status).toBe(200);
    const duplicateBody = await duplicate.json();
    expect(duplicateBody.created).toBe(false);
    expect(duplicateBody.id).toBe(id);
  });

  it("改答案后历史判分被回刷：日志翻错、会话 correct_count 重算", async () => {
    const created = await app.request("/", {
      method: "POST",
      headers: auth(tokenA),
      body: JSON.stringify({
        ...QUESTION,
        content: "改题回刷专用题干：以下哪个是学习动机的内部因素？",
      }),
    });
    const id = (await created.json()).id as number;

    await dbm.drizzleDb.run(
      sql`INSERT OR IGNORE INTO practice_sessions (id, user_id, session_name, practice_mode, correct_count)
          VALUES (${`sess-q-${id}`}, ${A}, '建题回刷', 'review', 1)`,
    );
    await dbm.drizzleDb.run(
      sql`INSERT INTO practice_logs (session_id, user_id, question_id, user_answer, is_correct, duration_ms)
          VALUES (${`sess-q-${id}`}, ${A}, ${id}, 'B', 1, 2000)`,
    );

    // 答案 B → A：原来判对的日志应按新答案翻成错
    const patched = await app.request(`/${id}`, {
      method: "PATCH",
      headers: auth(tokenA),
      body: JSON.stringify({ answer: "A" }),
    });
    expect(patched.status).toBe(200);
    const patchedBody = await patched.json();
    expect(patchedBody.changed).toEqual(["answer"]);
    expect(patchedBody.regrade.logsScanned).toBe(1);
    expect(patchedBody.regrade.logsFlipped).toBe(1);
    expect(patchedBody.question.answer).toBe("A");

    const [log] = await dbm.drizzleDb.all<{ is_correct: number }>(
      sql`SELECT is_correct FROM practice_logs WHERE question_id = ${id}`,
    );
    expect(Number(log.is_correct)).toBe(0);

    const [session] = await dbm.drizzleDb.all<{ correct_count: number }>(
      sql`SELECT correct_count FROM practice_sessions WHERE id = ${`sess-q-${id}`}`,
    );
    expect(Number(session.correct_count)).toBe(0);
  });

  it("非本人创建的题不可改（403），且不改任何行", async () => {
    const created = await app.request("/", {
      method: "POST",
      headers: auth(tokenA),
      body: JSON.stringify({
        ...QUESTION,
        content: "归属专用题干：谁创建的题谁能改？",
      }),
    });
    const id = (await created.json()).id as number;

    const res = await app.request(`/${id}`, {
      method: "PATCH",
      headers: auth(tokenB),
      body: JSON.stringify({ answer: "A" }),
    });
    expect(res.status).toBe(403);

    const [row] = await dbm.drizzleDb.all<{ answer: string }>(
      sql`SELECT answer FROM questions WHERE id = ${id}`,
    );
    expect(row.answer).toBe("B");
  });

  it("非法内容 400 且零写入；写操作进 admin_logs", async () => {
    const before = await countRows("questions");

    const bad = await app.request("/", {
      method: "POST",
      headers: auth(tokenA),
      body: JSON.stringify({ ...QUESTION, answer: "Z" }),
    });
    expect(bad.status).toBe(400);
    expect((await bad.json()).issues.join(" ")).toMatch(/answer/);
    expect(await countRows("questions")).toBe(before);

    const [createdLog] = await dbm.drizzleDb.all<{ n: number }>(
      sql`SELECT count(*) AS n FROM admin_logs
          WHERE action = 'QUESTION_CREATE' AND user_id = ${A}`,
    );
    expect(Number(createdLog.n)).toBeGreaterThan(0);

    // PATCH 也留痕
    const [anyQuestion] = await dbm.drizzleDb.all<{ id: number }>(
      sql`SELECT id FROM questions WHERE external_id LIKE ${`manual:${A}:%`} LIMIT 1`,
    );
    const patched = await app.request(`/${anyQuestion.id}`, {
      method: "PATCH",
      headers: auth(tokenA),
      body: JSON.stringify({ explanation: "更新后的解析，长度足够。" }),
    });
    expect(patched.status).toBe(200);

    const [updateLog] = await dbm.drizzleDb.all<{ n: number }>(
      sql`SELECT count(*) AS n FROM admin_logs
          WHERE action = 'QUESTION_UPDATE' AND user_id = ${A}`,
    );
    expect(Number(updateLog.n)).toBeGreaterThanOrEqual(1);
  });

  it("材料口径：只发 material（纯文本）→ 落库 material_html 为转义后的分段 HTML", async () => {
    const material = "第一段 <script>alert(1)</script>\n第二段 & 符号";
    const created = await app.request("/", {
      method: "POST",
      headers: auth(tokenA),
      body: JSON.stringify({
        ...QUESTION,
        content: "材料题：阅读材料后回答，材料字段口径测试。",
        material,
      }),
    });
    expect(created.status).toBe(201);
    const id = (await created.json()).id as number;

    const [row] = await dbm.drizzleDb.all<{
      material: string;
      material_html: string;
    }>(sql`SELECT material, material_html FROM questions WHERE id = ${id}`);
    expect(row.material).toBe(material);
    // 纯文本不得原样进 HTML：标签被转义、换行拆成段落
    expect(row.material_html).not.toContain("<script>");
    expect(row.material_html).toContain("&lt;script&gt;");
    expect(row.material_html).toContain("&amp;");
    expect(row.material_html).toBe(
      "<p>第一段 &lt;script&gt;alert(1)&lt;/script&gt;</p><p>第二段 &amp; 符号</p>",
    );

    // GET 详情回传原文与 HTML，移动端编辑表单可直接回填 material
    const detail = await app.request(`/${id}`, { headers: auth(tokenA) });
    const detailBody = await detail.json();
    expect(detailBody.material).toBe(material);
    expect(detailBody.material_html).toBe(row.material_html);

    // PATCH material 同步重算 HTML
    const patched = await app.request(`/${id}`, {
      method: "PATCH",
      headers: auth(tokenA),
      body: JSON.stringify({ material: "新材料 <b>x</b>" }),
    });
    expect(patched.status).toBe(200);
    const [after] = await dbm.drizzleDb.all<{
      material: string;
      material_html: string;
    }>(sql`SELECT material, material_html FROM questions WHERE id = ${id}`);
    expect(after.material).toBe("新材料 <b>x</b>");
    expect(after.material_html).toBe("<p>新材料 &lt;b&gt;x&lt;/b&gt;</p>");
  });

  it("题型不被过滤：truefalse / fill_blank 在 GET 与 PATCH 响应里都保留", async () => {
    const truefalse = await app.request("/", {
      method: "POST",
      headers: auth(tokenA),
      body: JSON.stringify({
        content: "判断题：形成性评价发生在教学过程中。",
        options: ["正确", "错误"],
        answer: "A",
        explanation: "形成性评价贯穿教学过程，故该说法正确。",
        tags: ["教学评价"],
        dimension: "knowledge",
        type: "truefalse",
      }),
    });
    expect(truefalse.status).toBe(201);
    const tfId = (await truefalse.json()).id as number;

    const tfDetail = await app.request(`/${tfId}`, { headers: auth(tokenA) });
    expect((await tfDetail.json()).type).toBe("truefalse");

    // PATCH 响应里的 question 也要带题型（客户端靠它回填表单）
    const tfPatched = await app.request(`/${tfId}`, {
      method: "PATCH",
      headers: auth(tokenA),
      body: JSON.stringify({ explanation: "改过的解析：形成性评价贯穿教学过程。" }),
    });
    expect(tfPatched.status).toBe(200);
    expect((await tfPatched.json()).question.type).toBe("truefalse");

    const fillBlank = await app.request("/", {
      method: "POST",
      headers: auth(tokenA),
      body: JSON.stringify({
        content: "填空题：布鲁纳认为学习的实质是主动形成____。",
        options: [],
        answer: "认知结构",
        explanation: "布鲁纳强调主动建构认知结构。",
        tags: ["学习理论"],
        dimension: "knowledge",
        type: "fill_blank",
      }),
    });
    expect(fillBlank.status).toBe(201);
    const fbId = (await fillBlank.json()).id as number;

    const fbDetail = await app.request(`/${fbId}`, { headers: auth(tokenA) });
    expect((await fbDetail.json()).type).toBe("fill_blank");

    const fbPatched = await app.request(`/${fbId}`, {
      method: "PATCH",
      headers: auth(tokenA),
      body: JSON.stringify({ answer: "认知结构（表征系统）" }),
    });
    expect((await fbPatched.json()).question.type).toBe("fill_blank");
  });

  it("显式 material_html: null 是清空，不被自动生成的 HTML 覆盖", async () => {
    const created = await app.request("/", {
      method: "POST",
      headers: auth(tokenA),
      body: JSON.stringify({
        ...QUESTION,
        content: "材料题：显式清空 material_html 的口径测试。",
        material: "一段会生成 HTML 的材料",
      }),
    });
    expect(created.status).toBe(201);
    const id = (await created.json()).id as number;

    const [before] = await dbm.drizzleDb.all<{ material_html: string }>(
      sql`SELECT material_html FROM questions WHERE id = ${id}`,
    );
    expect(before.material_html).toBe("<p>一段会生成 HTML 的材料</p>");

    const cleared = await app.request(`/${id}`, {
      method: "PATCH",
      headers: auth(tokenA),
      body: JSON.stringify({ material_html: null }),
    });
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).question.material_html).toBeNull();

    const [after] = await dbm.drizzleDb.all<{
      material: string;
      material_html: string | null;
    }>(sql`SELECT material, material_html FROM questions WHERE id = ${id}`);
    expect(after.material_html).toBeNull();
    expect(after.material).toBe("一段会生成 HTML 的材料");
  });

  it("材料属于题目身份：同题干/选项/答案但材料不同 → 两道题，材料不被丢弃", async () => {
    const base = {
      ...QUESTION,
      content: "材料题：同一题干配不同材料，应落成两道题。",
      material: "材料甲：第一段内容\n第二段内容",
    };
    const first = await app.request("/", {
      method: "POST",
      headers: auth(tokenA),
      body: JSON.stringify(base),
    });
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    expect(firstBody.created).toBe(true);

    const second = await app.request("/", {
      method: "POST",
      headers: auth(tokenA),
      body: JSON.stringify({ ...base, material: "材料乙：完全不同的材料" }),
    });
    const secondBody = await second.json();
    expect(secondBody.created).toBe(true);
    expect(secondBody.id).not.toBe(firstBody.id);

    // 材料只差空白（换行/缩进）视为同一道题，不重复建
    const sameAgain = await app.request("/", {
      method: "POST",
      headers: auth(tokenA),
      body: JSON.stringify({
        ...base,
        material: " 材料甲：第一段内容   第二段内容 ",
      }),
    });
    const sameBody = await sameAgain.json();
    expect(sameBody.created).toBe(false);
    expect(sameBody.id).toBe(firstBody.id);

    const [row] = await dbm.drizzleDb.all<{ material: string }>(
      sql`SELECT material FROM questions WHERE id = ${secondBody.id}`,
    );
    expect(row.material).toBe("材料乙：完全不同的材料");
  });

  it("未登录 401", async () => {
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(QUESTION),
    });
    expect(res.status).toBe(401);
  });
});
