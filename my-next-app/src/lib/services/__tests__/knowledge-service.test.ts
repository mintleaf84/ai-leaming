// @vitest-environment node
/**
 * 知识卡片服务（真实 SQLite + 真实迁移）。
 *
 * 原先整条 drizzle 链都是 mock（`insert().values()` 返回 `{lastInsertRowid: 7}`），
 * 所以「卡片真的落库了」「更新真的改了行」「删除真的删掉了」都没被验证过。
 * 现在只 mock `@/lib/ai/rag`（向量检索是外部依赖，不是本次被测语义），
 * 所有断言都回到 knowledge_cards 表的真实行。
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
import { eq } from "drizzle-orm";
import type { KnowledgeCard } from "../knowledge";

const dbFile = `test-knowledge-service-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

// RAG 是外部依赖（向量库 + 嵌入服务），保持 mock；DB 一律是真的。
vi.mock("@/lib/ai/rag", () => ({
  ragService: {
    addChunk: vi.fn().mockResolvedValue(undefined),
    deleteChunksBySource: vi.fn(),
  },
}));

type DbModule = typeof import("../../db");
type KnowledgeModule = typeof import("../knowledge");

let dbm: DbModule;
let createKnowledgeCard: KnowledgeModule["createKnowledgeCard"];
let getAllKnowledgeCards: KnowledgeModule["getAllKnowledgeCards"];
let getKnowledgeCard: KnowledgeModule["getKnowledgeCard"];
let updateKnowledgeCard: KnowledgeModule["updateKnowledgeCard"];
let deleteKnowledgeCard: KnowledgeModule["deleteKnowledgeCard"];
let getCategories: KnowledgeModule["getCategories"];
let countKnowledgeCards: KnowledgeModule["countKnowledgeCards"];
let exportToAnkiTSV: KnowledgeModule["exportToAnkiTSV"];
let ragService: (typeof import("../../ai/rag"))["ragService"];

const USER_A = 830;
const USER_B = 831;

async function cardRow(id: number) {
  const [row] = await dbm.drizzleDb
    .select()
    .from(dbm.drizzleSchema.knowledge_cards)
    .where(eq(dbm.drizzleSchema.knowledge_cards.id, id));
  return row;
}

/** 直接落一行卡片（绕过服务，用于准备列表/分页场景） */
type NewCard = {
  title: string;
  user_id?: number;
  category?: string;
  tags?: string;
  front?: string;
  back?: string;
  key_points?: string;
  created_at?: string;
};

async function seedCard(values: NewCard): Promise<number> {
  const [row] = await dbm.drizzleDb
    .insert(dbm.drizzleSchema.knowledge_cards)
    .values({
      user_id: USER_A,
      category: "数学",
      tags: "[]",
      front: "Q",
      back: "A",
      key_points: "[]",
      ...values,
    })
    .returning({ id: dbm.drizzleSchema.knowledge_cards.id });
  return row.id;
}

beforeAll(async () => {
  dbm = await import("../../db");
  await dbm.initDatabase();

  // createKnowledgeCard 不带 userId 时默认写 user_id = 1，故 1 必须存在（FK 真实生效）
  await dbm.drizzleDb
    .insert(dbm.drizzleSchema.users)
    .values([
      { id: 1, username: "knowledge-default-owner", password_hash: "x" },
      { id: USER_A, username: "knowledge-a", password_hash: "x" },
      { id: USER_B, username: "knowledge-b", password_hash: "x" },
    ])
    .onConflictDoNothing();

  const svc = await import("../knowledge");
  createKnowledgeCard = svc.createKnowledgeCard;
  getAllKnowledgeCards = svc.getAllKnowledgeCards;
  getKnowledgeCard = svc.getKnowledgeCard;
  updateKnowledgeCard = svc.updateKnowledgeCard;
  deleteKnowledgeCard = svc.deleteKnowledgeCard;
  getCategories = svc.getCategories;
  countKnowledgeCards = svc.countKnowledgeCards;
  exportToAnkiTSV = svc.exportToAnkiTSV;

  ragService = (await import("../../ai/rag")).ragService;
});

beforeEach(async () => {
  vi.clearAllMocks();
  await dbm.drizzleDb.delete(dbm.drizzleSchema.knowledge_cards);
});

afterAll(async () => {
  await dbm.closeDrizzle();
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
      force: true,
    });
  }
});

describe("createKnowledgeCard", () => {
  it("插入后返回真实自增 ID，且库里的 JSON 字段按字符串落盘", async () => {
    const card: KnowledgeCard = {
      title: "测试卡片",
      category: "数学",
      tags: ["代数", "几何"],
      front: "问题",
      back: "答案",
      key_points: [{ term: "项", definition: "单项式的基本单元" }],
    };

    const id = await createKnowledgeCard(card);
    expect(id).toBeGreaterThan(0);

    const row = await cardRow(id);
    expect(row).toBeTruthy();
    expect(row!.title).toBe("测试卡片");
    expect(row!.category).toBe("数学");
    expect(row!.front).toBe("问题");
    expect(row!.back).toBe("答案");
    expect(row!.user_id).toBe(1);
    // 库里是 JSON 文本，不是数组对象
    expect(row!.tags).toBe('["代数","几何"]');
    expect(row!.key_points).toBe(
      '[{"term":"项","definition":"单项式的基本单元"}]',
    );

    // RAG 索引按卡片 ID 同步
    expect(ragService.addChunk).toHaveBeenCalledWith(
      "问题\n\n答案",
      expect.objectContaining({ source_type: "card", source_id: id }),
    );
  });

  it("RAG 同步失败不影响落库，也不影响返回 ID", async () => {
    vi.mocked(ragService.addChunk).mockRejectedValueOnce(new Error("RAG 故障"));

    const id = await createKnowledgeCard({
      title: "RAG 失败测试",
      category: "语文",
      tags: [],
      front: "Q",
      back: "A",
      key_points: [],
    });

    expect(id).toBeGreaterThan(0);
    const row = await cardRow(id);
    expect(row!.title).toBe("RAG 失败测试");
  });

  it("两张卡片各自拿到不同的自增 ID（不再依赖被 mock 的固定值）", async () => {
    const id1 = await createKnowledgeCard({
      title: "C1",
      category: "数学",
      tags: [],
      front: "Q1",
      back: "A1",
      key_points: [],
    });
    const id2 = await createKnowledgeCard({
      title: "C2",
      category: "数学",
      tags: [],
      front: "Q2",
      back: "A2",
      key_points: [],
    });

    expect(id2).toBeGreaterThan(id1);
  });
});

describe("getAllKnowledgeCards", () => {
  it("按 created_at 倒序返回，并解析 tags / key_points", async () => {
    await seedCard({
      title: "旧卡片",
      created_at: "2026-01-01 10:00:00",
      tags: '["旧"]',
    });
    await seedCard({
      title: "新卡片",
      created_at: "2026-02-01 10:00:00",
      tags: '["代数","几何"]',
      key_points: '[{"term":"项","definition":"单项式的基本单元"}]',
    });

    const result = await getAllKnowledgeCards(undefined, 10, undefined, USER_A);

    expect(result.map((card) => card.title)).toEqual(["新卡片", "旧卡片"]);
    expect(result[0].tags).toEqual(["代数", "几何"]);
    expect(result[0].key_points).toEqual([
      { term: "项", definition: "单项式的基本单元" },
    ]);
  });

  it("category / userId 过滤生效", async () => {
    await seedCard({ title: "数学卡", category: "数学" });
    await seedCard({ title: "语文卡", category: "语文" });
    await seedCard({
      title: "别人的数学卡",
      category: "数学",
      user_id: USER_B,
    });

    const math = await getAllKnowledgeCards("数学", 10, undefined, USER_A);
    expect(math.map((card) => card.title)).toEqual(["数学卡"]);

    const all = await getAllKnowledgeCards(undefined, 10, undefined, USER_A);
    expect(all).toHaveLength(2);
  });

  it("空库时返回空数组", async () => {
    expect(await getAllKnowledgeCards()).toEqual([]);
  });

  it("limit / offset 真的分页", async () => {
    for (let i = 1; i <= 3; i++) {
      await seedCard({
        title: `卡片${i}`,
        created_at: `2026-03-0${i} 10:00:00`,
      });
    }

    const page2 = await getAllKnowledgeCards(
      undefined,
      2,
      undefined,
      USER_A,
      2,
    );
    expect(page2.map((card) => card.title)).toEqual(["卡片1"]);
  });
});

describe("countKnowledgeCards", () => {
  it("与列表同口径计数（含 category 过滤）", async () => {
    await seedCard({ title: "数学卡", category: "数学" });
    await seedCard({ title: "数学卡2", category: "数学" });
    await seedCard({ title: "语文卡", category: "语文" });
    await seedCard({ title: "别人的卡", category: "数学", user_id: USER_B });

    expect(await countKnowledgeCards(USER_A)).toBe(3);
    expect(await countKnowledgeCards(USER_A, "数学")).toBe(2);
  });
});

describe("getKnowledgeCard", () => {
  it("找到时解析 JSON 返回卡片", async () => {
    const id = await seedCard({
      title: "卡片2",
      category: "物理",
      tags: '["力学"]',
      front: "Q2",
      back: "A2",
    });

    const card = await getKnowledgeCard(id);
    expect(card).not.toBeNull();
    expect(card!.id).toBe(id);
    expect(card!.title).toBe("卡片2");
    expect(card!.tags).toEqual(["力学"]);
  });

  it("未找到返回 null", async () => {
    expect(await getKnowledgeCard(999_999)).toBeNull();
  });
});

describe("updateKnowledgeCard", () => {
  it("更新成功返回 true，且库里字段真的被改（只改传入字段）", async () => {
    const id = await seedCard({
      title: "旧标题",
      tags: '["旧标签"]',
      front: "旧正面",
    });

    const ok = await updateKnowledgeCard(id, {
      title: "新标题",
      key_points: [{ term: "新", definition: "新的关键点" }],
    });

    expect(ok).toBe(true);
    const row = await cardRow(id);
    expect(row!.title).toBe("新标题");
    expect(row!.key_points).toBe('[{"term":"新","definition":"新的关键点"}]');
    // 未传的字段保持原值
    expect(row!.front).toBe("旧正面");
    expect(row!.tags).toBe('["旧标签"]');

    // 更新后 RAG 重建：先删旧索引再按新内容建
    expect(ragService.deleteChunksBySource).toHaveBeenCalledWith("card", id);
    expect(ragService.addChunk).toHaveBeenCalledWith(
      "旧正面\n\nA",
      expect.objectContaining({ source_id: id, title: "新标题" }),
    );
  });

  it("ID 不存在返回 false 且不写库", async () => {
    expect(await updateKnowledgeCard(999_999, { title: "不存在" })).toBe(false);
    const [row] = await dbm.drizzleDb
      .select()
      .from(dbm.drizzleSchema.knowledge_cards);
    expect(row).toBeUndefined();
  });
});

describe("deleteKnowledgeCard", () => {
  it("删除成功返回 true，库里那行真的没了", async () => {
    const keep = await seedCard({ title: "保留" });
    const gone = await seedCard({ title: "删除" });

    expect(await deleteKnowledgeCard(gone)).toBe(true);

    expect(await cardRow(gone)).toBeUndefined();
    expect((await cardRow(keep))!.title).toBe("保留");
    expect(ragService.deleteChunksBySource).toHaveBeenCalledWith("card", gone);
  });

  it("ID 不存在返回 false", async () => {
    expect(await deleteKnowledgeCard(999_999)).toBe(false);
  });
});

describe("getCategories", () => {
  it("返回库内去重、非空的分类（升序）", async () => {
    await seedCard({ title: "a", category: "数学" });
    await seedCard({ title: "b", category: "数学" });
    await seedCard({ title: "c", category: "语文" });
    await seedCard({ title: "d", category: "" });
    await seedCard({ title: "e", category: "别人的", user_id: USER_B });

    expect(await getCategories(USER_A)).toEqual(["数学", "语文"]);
  });

  it("空库返回空数组", async () => {
    expect(await getCategories(USER_A)).toEqual([]);
  });
});

// ────────────────────────────
// exportToAnkiTSV（纯函数，不需要库）
// ────────────────────────────
describe("exportToAnkiTSV", () => {
  it("应该生成正确的 TSV 格式", () => {
    const cards: KnowledgeCard[] = [
      {
        id: 1,
        title: "卡片1",
        category: "数学",
        tags: ["代数"],
        front: "什么是一元一次方程？",
        back: "含有一个未知数的一次方程",
        key_points: [{ term: "未知数", definition: "方程中待求的量" }],
      },
    ];

    const result = exportToAnkiTSV(cards);
    const lines = result.split("\n");

    expect(lines).toHaveLength(1);
    const [front, back, tags] = lines[0].split("\t");
    expect(front).toBe("什么是一元一次方程？");
    expect(back).toContain("含有一个未知数的一次方程");
    expect(back).toContain("未知数: 方程中待求的量");
    expect(tags).toContain("数学");
    expect(tags).toContain("代数");
  });

  it("换行符应被替换为 <br>", () => {
    const cards: KnowledgeCard[] = [
      {
        title: "多行卡片",
        category: "",
        tags: [],
        front: "第一行\n第二行",
        back: "答案",
        key_points: [],
      },
    ];

    const result = exportToAnkiTSV(cards);
    expect(result).toContain("第一行<br>第二行");
    expect(result).not.toContain("\n第二行");
  });

  it("制表符应被替换为空格", () => {
    const cards: KnowledgeCard[] = [
      {
        title: "制表符卡片",
        category: "",
        tags: [],
        front: "有\t制表符",
        back: "答案",
        key_points: [],
      },
    ];

    const result = exportToAnkiTSV(cards);
    const parts = result.split("\t");
    expect(parts[0]).toBe("有 制表符");
  });

  it("空 key_points 时不应追加关键点区块", () => {
    const cards: KnowledgeCard[] = [
      {
        title: "无关键点",
        category: "化学",
        tags: [],
        front: "Q",
        back: "A",
        key_points: [],
      },
    ];

    const result = exportToAnkiTSV(cards);
    expect(result).not.toContain("【关键点】");
  });

  it("空卡片列表应返回空字符串", () => {
    expect(exportToAnkiTSV([])).toBe("");
  });

  it("多张卡片应生成多行", () => {
    const cards: KnowledgeCard[] = [
      {
        title: "C1",
        category: "",
        tags: [],
        front: "Q1",
        back: "A1",
        key_points: [],
      },
      {
        title: "C2",
        category: "",
        tags: [],
        front: "Q2",
        back: "A2",
        key_points: [],
      },
    ];

    const result = exportToAnkiTSV(cards);
    expect(result.split("\n")).toHaveLength(2);
  });

  it("分类和标签中的空格应替换为下划线", () => {
    const cards: KnowledgeCard[] = [
      {
        title: "空格标签",
        category: "数学 代数",
        tags: ["一 次 方 程"],
        front: "Q",
        back: "A",
        key_points: [],
      },
    ];

    const result = exportToAnkiTSV(cards);
    const parts = result.split("\t");
    expect(parts[2]).toContain("数学_代数");
    expect(parts[2]).toContain("一_次_方_程");
  });
});
