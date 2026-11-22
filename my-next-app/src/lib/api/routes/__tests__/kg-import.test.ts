// @vitest-environment node
/**
 * `POST /api/external/kg/import` 与 `POST /api/external/questions/nodes`。
 *
 * 真实依赖：真实 SQLite（每个用例独立临时库 + 全部迁移）、真实 API Key 鉴权、
 * 真实事务与唯一索引。不 mock 数据库 —— 幂等/整批原子/门禁这类契约只有真跑库
 * 才算验证过（docs/engineering.md 规则三）。
 *
 * 第一章数据用仓库里的 `fixtures/kg/ch1-edges-v3.json`（153 边 / 166 节点）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import fs from "node:fs";
import path from "node:path";
import { setupTestDb, type TestDbHelper } from "@/lib/__tests__/test-db-utils";
import * as schema from "@/lib/db/drizzle-schema";
import { RELATION_TYPES_VERSION } from "@/lib/kg/relation-types";

let testDbHelper: TestDbHelper;

vi.mock("@/lib/db", () => ({
  get drizzleDb() {
    return testDbHelper.db;
  },
  get drizzleSchema() {
    return schema;
  },
}));

import externalApp from "../external";

const API_PREFIX = "/api/external";
const IMPORT_PATH = `${API_PREFIX}/kg/import`;
const QUESTION_NODES_PATH = `${API_PREFIX}/questions/nodes`;

function createRootApp() {
  const root = new Hono();
  root.route(API_PREFIX, externalApp);
  return root;
}

const ADMIN_USER_ID = 71;
const OTHER_USER_ID = 72;

async function seedKeys() {
  await testDbHelper.seedUser(ADMIN_USER_ID, "kg-admin");
  await testDbHelper.seedUser(OTHER_USER_ID, "kg-other");
  await testDbHelper.db.insert(schema.api_keys).values([
    {
      key_string: "admin-key",
      is_active: 1,
      scopes: "admin",
      user_id: ADMIN_USER_ID,
    },
    {
      key_string: "read-key",
      is_active: 1,
      scopes: "read",
      user_id: ADMIN_USER_ID,
    },
    {
      // 全局 key：admin 作用域但没有绑定 userId（导入应拒绝）
      key_string: "global-admin-key",
      is_active: 1,
      scopes: "admin",
      user_id: null,
    },
  ]);
}

// ---------- 第一章产物 ----------

const fixture = JSON.parse(
  fs.readFileSync(
    path.resolve(process.cwd(), "../fixtures/kg/ch1-edges-v3.json"),
    "utf8",
  ),
) as {
  edges: Array<{
    from: string;
    to: string;
    type: string;
    evidence: string;
    printed_page: number;
  }>;
};

const KAODIAN: Array<[string, string, number]> = [
  ["考点一", "教育的定义与要素", 3],
  ["考点二", "教育的形态及属性", 5],
  ["考点三", "教育的功能和起源", 7],
  ["考点四", "中国奴隶社会教育的发展历程", 11],
  ["考点五", "中国封建社会教育的发展历程", 12],
  ["考点六", "外国教育的发展历程", 15],
  ["考点七", "教育的总体特征", 18],
  ["考点八", "教育学的萌芽阶段 1- 孔子与孟子", 20],
  ["考点九", "教育学的萌芽阶段 2- 荀子、墨子与《学记》", 21],
  ["考点十", "教育学的萌芽阶段 3- 古希腊三贤", 22],
  ["考点十一", "教育学的创立阶段 1- 夸美纽斯", 23],
  ["考点十二", "教育学的创立阶段 2- 赫尔巴特", 24],
  ["考点十三", "教育学的创立阶段 3- 杜威、卢梭与裴斯泰洛齐", 26],
  ["考点十四", "教育学的发展阶段 - 蔡元培、陈鹤琴与陶行知", 28],
  ["考点十五", "现代教育学流派与当代教育发展", 30],
];

const SECTIONS = KAODIAN.map(([key, title, startPage], i) => ({
  key,
  title,
  startPage,
  endPage: i + 1 < KAODIAN.length ? KAODIAN[i + 1][2] - 1 : 32,
}));

function chapterOneBody() {
  const names = new Set<string>();
  for (const edge of fixture.edges) {
    names.add(edge.from);
    names.add(edge.to);
  }
  return {
    chapter: "ch1",
    schemaVersion: RELATION_TYPES_VERSION,
    sections: SECTIONS,
    nodes: Array.from(names).map((name) => ({
      nodeKey: name,
      name,
      kind: name.includes("·") ? "facet" : "concept",
    })),
    edges: fixture.edges.map((edge) => ({ ...edge })),
  };
}

function postBody(
  pathname: string,
  body: unknown,
  key: string | null = "admin-key",
) {
  return createRootApp().request(pathname, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function rowCounts() {
  const [nodes, edges] = await Promise.all([
    testDbHelper.db.select().from(schema.kg_nodes),
    testDbHelper.db.select().from(schema.kg_edges),
  ]);
  return { nodes: nodes.length, edges: edges.length };
}

async function seedQuestions() {
  const rows = await testDbHelper.db
    .insert(schema.questions)
    .values([
      { content: "Q1", options: "[]", answer: "A", tags: "[]", type: "single" },
      { content: "Q2", options: "[]", answer: "B", tags: "[]", type: "single" },
    ])
    .returning({ id: schema.questions.id });
  return (rows as Array<{ id: number }>).map((r) => r.id);
}

/** 只导入两个节点、一条边的最小图谱（用于题→节点用例） */
function tinyGraphBody() {
  return {
    chapter: "ch1",
    schemaVersion: RELATION_TYPES_VERSION,
    sections: [{ key: "考点一", title: "测试", startPage: 1, endPage: 10 }],
    nodes: [
      {
        nodeKey: "教育学的创立阶段",
        name: "教育学的创立阶段",
        kind: "concept",
      },
      { nodeKey: "广义的教育", name: "广义的教育", kind: "concept" },
    ],
    edges: [
      {
        from: "教育学的创立阶段",
        to: "广义的教育",
        type: "subclass",
        evidence: "测试原句",
        printed_page: 5,
      },
    ],
  };
}

describe("POST /api/external/kg/import", () => {
  beforeEach(async () => {
    testDbHelper = await setupTestDb();
    await seedKeys();
  });

  afterEach(async () => {
    await testDbHelper.close();
  });

  it("dryRun：153 边 / 166 节点，覆盖率 15/15，proposed 只告警且库内零变更", async () => {
    const res = await postBody(`${IMPORT_PATH}?dryRun=true`, chapterOneBody());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body).toMatchObject({
      dryRun: true,
      wouldCreateNodes: 166,
      wouldCreateEdges: 153,
      wouldUpdateNodes: 0,
      wouldUpdateEdges: 0,
      coverage: { covered: 15, total: 15, missing: [] },
    });
    expect((body.warnings as string[]).length).toBe(34);
    expect(await rowCounts()).toEqual({ nodes: 0, edges: 0 });
  });

  it("真导 created，重导 skipped=全部（幂等）", async () => {
    const first = await postBody(IMPORT_PATH, chapterOneBody());
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as Record<string, unknown>;
    expect(firstBody).toMatchObject({
      created: { nodes: 166, edges: 153 },
      updated: { nodes: 0, edges: 0 },
      skipped: { nodes: 0, edges: 0 },
      coverage: { covered: 15, total: 15 },
    });

    const second = await postBody(IMPORT_PATH, chapterOneBody());
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({
      created: { nodes: 0, edges: 0 },
      updated: { nodes: 0, edges: 0 },
      skipped: { nodes: 166, edges: 153 },
    });
    expect(await rowCounts()).toEqual({ nodes: 166, edges: 153 });
  });

  it("重导前 dryRun 显示无新增（只读预演与真导口径一致）", async () => {
    await postBody(IMPORT_PATH, chapterOneBody());
    const res = await postBody(`${IMPORT_PATH}?dryRun=true`, chapterOneBody());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      wouldCreateNodes: 0,
      wouldCreateEdges: 0,
      wouldUpdateNodes: 0,
      wouldUpdateEdges: 0,
    });
  });

  it("缺 evidence → 400，指出边，且一条都不写", async () => {
    const body = chapterOneBody();
    body.edges[0].evidence = "  ";
    const res = await postBody(IMPORT_PATH, body);
    expect(res.status).toBe(400);
    const payload = (await res.json()) as {
      error: string;
      issues: string[];
      codes: string[];
    };
    expect(payload.codes).toContain("missing_evidence");
    expect(payload.issues[0]).toContain("edges[0]");
    expect(payload.issues[0]).toContain("evidence");
    expect(await rowCounts()).toEqual({ nodes: 0, edges: 0 });
  });

  it("未登记 type → 400", async () => {
    const body = chapterOneBody();
    body.edges[0].type = "invented";
    const res = await postBody(IMPORT_PATH, body);
    expect(res.status).toBe(400);
    const payload = (await res.json()) as { codes: string[]; issues: string[] };
    expect(payload.codes).toContain("unknown_relation_type");
    expect(payload.issues.join("\n")).toContain("invented");
    expect(await rowCounts()).toEqual({ nodes: 0, edges: 0 });
  });

  it("prerequisite 成环 → 400", async () => {
    const body = {
      chapter: "ch9",
      schemaVersion: RELATION_TYPES_VERSION,
      sections: [{ key: "考点一", title: "测试", startPage: 1, endPage: 10 }],
      nodes: [
        { nodeKey: "贯穿", name: "贯穿", kind: "concept" },
        { nodeKey: "贯通", name: "贯通", kind: "concept" },
      ],
      edges: [
        {
          from: "贯穿",
          to: "贯通",
          type: "prerequisite",
          evidence: "A",
          printed_page: 1,
        },
        {
          from: "贯通",
          to: "贯穿",
          type: "prerequisite",
          evidence: "B",
          printed_page: 1,
        },
      ],
    };
    const res = await postBody(IMPORT_PATH, body);
    expect(res.status).toBe(400);
    const payload = (await res.json()) as { codes: string[]; issues: string[] };
    expect(payload.codes).toContain("prerequisite_cycle");
    expect(payload.issues.join("\n")).toContain("→");
    expect(await rowCounts()).toEqual({ nodes: 0, edges: 0 });
  });

  it("某 section 无边 → 400 并列出该考点（可解析的 coverage.missing）", async () => {
    const body = chapterOneBody();
    body.edges = body.edges.filter(
      (edge) => !(edge.printed_page >= 30 && edge.printed_page <= 32),
    );
    const res = await postBody(IMPORT_PATH, body);
    expect(res.status).toBe(400);
    const payload = (await res.json()) as {
      codes: string[];
      issues: string[];
      coverage: {
        covered: number;
        total: number;
        missing: Array<{ key: string }>;
      };
    };
    expect(payload.codes).toContain("uncovered_section");
    expect(payload.issues.join("\n")).toContain("考点十五");
    expect(payload.coverage).toMatchObject({ covered: 14, total: 15 });
    expect(payload.coverage.missing.map((s) => s.key)).toEqual(["考点十五"]);
    expect(await rowCounts()).toEqual({ nodes: 0, edges: 0 });
  });

  it("schemaVersion 不匹配 → 400", async () => {
    const body = { ...chapterOneBody(), schemaVersion: "1.0" };
    const res = await postBody(IMPORT_PATH, body);
    expect(res.status).toBe(400);
    const payload = (await res.json()) as { codes: string[]; issues: string[] };
    expect(payload.codes).toContain("schema_version_mismatch");
    expect(payload.issues.join("\n")).toContain("1.1");
    expect(await rowCounts()).toEqual({ nodes: 0, edges: 0 });
  });

  it("read key 越权 → 403；全局 admin key（无 userId）→ 403", async () => {
    const readRes = await postBody(IMPORT_PATH, chapterOneBody(), "read-key");
    expect(readRes.status).toBe(403);

    const globalRes = await postBody(
      IMPORT_PATH,
      chapterOneBody(),
      "global-admin-key",
    );
    expect(globalRes.status).toBe(403);
    expect(await globalRes.json()).toMatchObject({
      error: expect.stringContaining("绑定用户"),
    });
    expect(await rowCounts()).toEqual({ nodes: 0, edges: 0 });
  });
});

describe("POST /api/external/questions/nodes", () => {
  beforeEach(async () => {
    testDbHelper = await setupTestDb();
    await seedKeys();
  });

  afterEach(async () => {
    await testDbHelper.close();
  });

  it("写入后重放 skipped（幂等键 question_id+node_key）", async () => {
    const importRes = await postBody(IMPORT_PATH, tinyGraphBody());
    expect(importRes.status).toBe(200);
    const [q1, q2] = await seedQuestions();

    const items = [
      {
        questionId: q1,
        chapter: "ch1",
        nodeKey: "ch1:教育学的创立阶段",
        method: "match",
        score: 3,
      },
      {
        questionId: q2,
        chapter: "ch1",
        nodeKey: "广义的教育",
        method: "manual",
      },
    ];

    const first = await postBody(QUESTION_NODES_PATH, { items });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ created: 2, skipped: 0 });

    const second = await postBody(QUESTION_NODES_PATH, { items });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ created: 0, skipped: 2 });

    const rows = (await testDbHelper.db
      .select()
      .from(schema.question_nodes)) as Array<{ node_key: string }>;
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.node_key).sort()).toEqual([
      "ch1:广义的教育",
      "ch1:教育学的创立阶段",
    ]);
  });

  it("节点不存在 → 400 且整批不写", async () => {
    const importRes = await postBody(IMPORT_PATH, tinyGraphBody());
    expect(importRes.status).toBe(200);
    const [q1] = await seedQuestions();

    const res = await postBody(QUESTION_NODES_PATH, {
      items: [
        { questionId: q1, chapter: "ch1", nodeKey: "ch1:教育学的创立阶段" },
        { questionId: q1, chapter: "ch1", nodeKey: "ch1:不存在的节点" },
      ],
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      missingNodeKeys: ["ch1:不存在的节点"],
    });
    const rows = await testDbHelper.db.select().from(schema.question_nodes);
    expect(rows).toHaveLength(0);
  });

  it("他人 Agent 题集里的题 → 404（跨用户隔离），整批不写", async () => {
    const importRes = await postBody(IMPORT_PATH, tinyGraphBody());
    expect(importRes.status).toBe(200);

    // 题集属于另一个用户 72
    const [set] = await testDbHelper.db
      .insert(schema.agent_question_sets)
      .values({
        user_id: OTHER_USER_ID,
        batch_key: "other-batch",
        title: "他人的题集",
      })
      .returning({ id: schema.agent_question_sets.id });
    const [agentQuestion] = await testDbHelper.db
      .insert(schema.questions)
      .values({
        content: "他人题集里的题",
        options: "[]",
        answer: "A",
        tags: "[]",
        type: "single",
        origin: "agent",
        agent_set_id: set.id,
      })
      .returning({ id: schema.questions.id });

    const res = await postBody(QUESTION_NODES_PATH, {
      items: [
        {
          questionId: agentQuestion.id,
          chapter: "ch1",
          nodeKey: "ch1:广义的教育",
        },
      ],
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      questionIds: [agentQuestion.id],
    });
    const rows = await testDbHelper.db.select().from(schema.question_nodes);
    expect(rows).toHaveLength(0);
  });
});
