// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { questionService } from "../question";

const {
  mockDb,
  mockDrizzleDb,
  mockDrizzleSchema,
  mockRagService,
  mockVecStore,
} = vi.hoisted(() => {
  const makeChain = () => {
    const chain: any = {
      then: vi.fn((resolve) => resolve([])),
      get: vi.fn(() => ({})),
    };
    const methods = [
      "insert",
      "values",
      "update",
      "set",
      "delete",
      "select",
      "from",
      "where",
      "limit",
      "offset",
      "orderBy",
      "all",
      "innerJoin",
      "leftJoin",
      "onConflictDoUpdate",
    ];
    methods.forEach((m) => {
      chain[m] = vi.fn(() => chain);
    });
    return chain;
  };

  const chain = makeChain();
  const mockDrizzleDb = {
    ...chain,
    query: {
      questions: { findMany: vi.fn(), findFirst: vi.fn() },
    },
    transaction: vi.fn(async (cb) => cb(chain)),
    execute: vi.fn(async () => []),
  };

  return {
    mockDb: {
      prepare: vi.fn(),
    },
    mockDrizzleDb,
    mockDrizzleSchema: {
      questions: {
        id: "questions.id",
        type: "questions.type",
        dimension: "questions.dimension",
        tags: "questions.tags",
        content: "questions.content",
        ai_mnemonic: "questions.ai_mnemonic",
      },
    },
    mockRagService: {
      getEmbedding: vi.fn(),
      getEmbeddingResult: vi.fn(),
    },
    // 向量读写走 legacy 连接（vec-store）。服务层单测只关心"取到 id 后怎么拼题"，
    // 真库路径由 question-vector.contract.test.ts 覆盖。
    mockVecStore: {
      isVectorAvailable: vi.fn(),
      searchQuestionVectors: vi.fn(),
      upsertQuestionVector: vi.fn(),
      deleteQuestionVector: vi.fn(),
    },
  };
});

vi.mock("@/lib/db", () => ({
  default: mockDb,
  db: mockDb,
  drizzleDb: mockDrizzleDb,
  drizzleSchema: mockDrizzleSchema,
}));

vi.mock("@/lib/db/vec-store", () => ({
  isVectorAvailable: mockVecStore.isVectorAvailable,
  searchQuestionVectors: mockVecStore.searchQuestionVectors,
  upsertQuestionVector: mockVecStore.upsertQuestionVector,
  deleteQuestionVector: mockVecStore.deleteQuestionVector,
}));

vi.mock("@/lib/ai/rag", () => ({
  ragService: mockRagService,
}));

vi.mock("@/lib/db/safe-query", () => ({
  safeGet: vi.fn((_, __, ___) => (_?.get ? _.get() : _)),
  safeAll: vi.fn((_, __, ___) => (_?.all ? _.all() : _)),
}));

describe("Question Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const chain = mockDrizzleDb as any;
    ["select", "from", "where", "limit", "offset", "orderBy"].forEach((m) => {
      chain[m].mockReturnValue(chain);
    });
    chain.get.mockReturnValue({});
    chain.then.mockImplementation((resolve: any) => resolve([]));
    // 默认：扩展可用但库里没有向量命中
    mockVecStore.isVectorAvailable.mockReturnValue(true);
    mockVecStore.searchQuestionVectors.mockReturnValue([]);
  });

  describe("getById", () => {
    it("should return question when found", async () => {
      const mockQ = {
        id: 1,
        content: "Test 题干内容足够长",
        options: '["A", "B"]',
        answer: "A",
        explanation: "解析内容足够长",
        tags: '["test"]',
        type: "single",
        dimension: "knowledge",
      };
      (mockDrizzleDb.query.questions.findFirst as any).mockResolvedValue(mockQ);

      const result = await questionService.getById(1);

      expect(result).toBeDefined();
      expect(result?.id).toBe(1);
    });

    it("should return null when not found", async () => {
      (mockDrizzleDb.query.questions.findFirst as any).mockResolvedValue(null);

      const result = await questionService.getById(999);

      expect(result).toBeNull();
    });
  });

  describe("getSummary", () => {
    it("should return question summary when found", async () => {
      const mockQ = {
        id: 1,
        content: "Test 题干内容",
        options: '["A", "B"]',
        answer: "A",
        type: "single",
        dimension: "knowledge",
        tags: '["test"]',
      };
      (mockDrizzleDb.query.questions.findFirst as any).mockResolvedValue(mockQ);

      const result = await questionService.getSummary(1);

      expect(result).toBeDefined();
      expect(result?.id).toBe(1);
      expect(result?.type).toBe("single");
    });

    it("should return null when question not found", async () => {
      (mockDrizzleDb.query.questions.findFirst as any).mockResolvedValue(null);

      const result = await questionService.getSummary(999);

      expect(result).toBeNull();
    });
  });

  describe("list", () => {
    it("should list questions with pagination", async () => {
      const mockItems = [
        {
          id: 1,
          content: "Test1 内容足够长",
          options: '["A", "B"]',
          answer: "A",
          explanation: "解析内容足够长",
          tags: '["test"]',
          type: "single",
          dimension: "knowledge",
        },
        {
          id: 2,
          content: "Test2 内容足够长",
          options: '["A", "B"]',
          answer: "A",
          explanation: "解析内容足够长",
          tags: '["test"]',
          type: "single",
          dimension: "knowledge",
        },
      ];
      (mockDrizzleDb.query.questions.findMany as any).mockResolvedValue(
        mockItems,
      );
      (mockDrizzleDb.get as any).mockReturnValue({ count: 10 });

      const result = await questionService.list({ offset: 0, limit: 10 });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(10);
    });

    it("should apply type filter", async () => {
      (mockDrizzleDb.query.questions.findMany as any).mockResolvedValue([]);
      (mockDrizzleDb.get as any).mockReturnValue({ count: 0 });

      await questionService.list({ type: ["single"] });

      expect(mockDrizzleDb.query.questions.findMany).toHaveBeenCalled();
    });

    it("should apply dimension filter", async () => {
      (mockDrizzleDb.query.questions.findMany as any).mockResolvedValue([]);
      (mockDrizzleDb.get as any).mockReturnValue({ count: 0 });

      await questionService.list({ dimension: "knowledge" });

      expect(mockDrizzleDb.query.questions.findMany).toHaveBeenCalled();
    });

    it("should apply search filter", async () => {
      (mockDrizzleDb.query.questions.findMany as any).mockResolvedValue([]);
      (mockDrizzleDb.get as any).mockReturnValue({ count: 0 });

      await questionService.list({ search: "测试" });

      expect(mockDrizzleDb.query.questions.findMany).toHaveBeenCalled();
    });

    it("should apply tags filter", async () => {
      (mockDrizzleDb.query.questions.findMany as any).mockResolvedValue([]);
      (mockDrizzleDb.get as any).mockReturnValue({ count: 0 });

      await questionService.list({ tags: ["数学"] });

      expect(mockDrizzleDb.query.questions.findMany).toHaveBeenCalled();
    });

    it("should return empty list when no results", async () => {
      (mockDrizzleDb.query.questions.findMany as any).mockResolvedValue([]);
      (mockDrizzleDb.get as any).mockReturnValue({ count: 0 });

      const result = await questionService.list();

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe("updateMnemonic", () => {
    it("should update mnemonic successfully", async () => {
      const chain = mockDrizzleDb as any;
      chain.update.mockReturnValue(chain);
      chain.set.mockReturnValue(chain);
      chain.where.mockResolvedValue({});

      const result = await questionService.updateMnemonic(1, "助记词内容");

      expect(result).toBe(true);
    });
  });

  describe("create", () => {
    it("should create question successfully", async () => {
      const mockQuestion = { id: 1, content: "新题目", type: "single" };
      const chain = mockDrizzleDb as any;
      chain.insert.mockReturnValue(chain);
      chain.values.mockReturnValue(chain);
      chain.returning = vi.fn().mockResolvedValue([mockQuestion]);

      const result = await questionService.create({
        content: "新题目",
        type: "single",
        answer: "A",
        options: ["A", "B", "C", "D"],
      });

      expect(result).toEqual(mockQuestion);
    });
  });

  describe("update", () => {
    it("should update question successfully", async () => {
      const chain = mockDrizzleDb as any;
      chain.update.mockReturnValue(chain);
      chain.set.mockReturnValue(chain);
      chain.where.mockResolvedValue({});

      const result = await questionService.update(1, {
        content: "更新后的内容",
      });

      expect(result).toBe(true);
    });

    it("should handle options and tags stringification", async () => {
      const chain = mockDrizzleDb as any;
      chain.update.mockReturnValue(chain);
      chain.set.mockReturnValue(chain);
      chain.where.mockResolvedValue({});

      const result = await questionService.update(1, {
        content: "更新内容",
        options: ["A", "B"],
        tags: ["数学"],
      });

      expect(result).toBe(true);
    });
  });

  describe("delete", () => {
    it("should delete question successfully", async () => {
      const chain = mockDrizzleDb as any;
      chain.delete.mockReturnValue(chain);
      chain.where.mockResolvedValue({});

      const result = await questionService.delete(1);

      expect(result).toBe(true);
    });
  });

  describe("bulkCreate", () => {
    it("should bulk create questions in transaction", async () => {
      const questions = [
        {
          content: "Q1",
          type: "single",
          answer: "A",
          options: ["A", "B"],
          tags: ["test"],
        },
        {
          content: "Q2",
          type: "single",
          answer: "B",
          options: ["A", "B"],
          tags: ["test"],
        },
      ];

      const mockTransaction = vi.fn();
      mockDrizzleDb.transaction.mockImplementation(mockTransaction);

      await questionService.bulkCreate(questions);

      expect(mockDrizzleDb.transaction).toHaveBeenCalled();
    });
  });

  describe("searchSimilarQuestions", () => {
    it("should return questions ordered by vector distance", async () => {
      mockRagService.getEmbeddingResult.mockResolvedValue({
        vector: [0.1, 0.2],
        degraded: false,
      });
      mockVecStore.searchQuestionVectors.mockReturnValue([
        { questionId: 2, distance: 0.1 },
        { questionId: 1, distance: 0.5 },
      ]);

      const rows = [
        {
          id: 1,
          content: "题一内容足够长",
          options: '["A", "B"]',
          answer: "A",
          explanation: "解析内容足够长",
          tags: '["test"]',
          type: "single",
          dimension: "knowledge",
        },
        {
          id: 2,
          content: "题二内容足够长",
          options: '["A", "B"]',
          answer: "A",
          explanation: "解析内容足够长",
          tags: '["test"]',
          type: "single",
          dimension: "knowledge",
        },
      ];
      // 题面按 id 批量取回（跨连接不能 JOIN），顺序以 distance 为准
      (
        mockDrizzleDb.then as unknown as {
          mockImplementation: (
            fn: (resolve: (value: unknown) => void) => void,
          ) => void;
        }
      ).mockImplementation((resolve) => resolve(rows));

      const result = await questionService.searchSimilarQuestions("content");

      expect(mockRagService.getEmbeddingResult).toHaveBeenCalledWith("content");
      expect(mockVecStore.searchQuestionVectors).toHaveBeenCalledWith(
        [0.1, 0.2],
        3,
      );
      expect(result.map((q) => q.id)).toEqual([2, 1]);
    });

    it("should return empty list if vector extension missing", async () => {
      mockVecStore.isVectorAvailable.mockReturnValue(false);

      const result = await questionService.searchSimilarQuestions("content");

      expect(result).toEqual([]);
      // 扩展不可用时不该白花一次 embedding 调用
      expect(mockRagService.getEmbeddingResult).not.toHaveBeenCalled();
    });

    // 缺陷：查询向量若是 `rag.ts` 的降级伪向量，KNN 会照常返回"最像的"一批无关题。
    // 所以这里断言的是**没有发起检索**，而不只是返回值为 [] —— 只看返回值分不清
    // "查了没命中"和"根本没查"，而后者才是修法的要求。
    it("should not query the vector table when embedding is degraded", async () => {
      mockRagService.getEmbeddingResult.mockResolvedValue({
        vector: [0.123, -0.456],
        degraded: true,
      });
      // 真查的话这条会被命中：证明 [] 来自"没查"，不是"查了空"
      mockVecStore.searchQuestionVectors.mockReturnValue([
        { questionId: 1, distance: 0 },
      ]);

      const result = await questionService.searchSimilarQuestions("content");

      expect(mockRagService.getEmbeddingResult).toHaveBeenCalledWith("content");
      expect(mockVecStore.searchQuestionVectors).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it("should degrade to empty list when the vector table is missing", async () => {
      mockRagService.getEmbeddingResult.mockResolvedValue({
        vector: [0.1, 0.2],
        degraded: false,
      });
      mockVecStore.searchQuestionVectors.mockImplementation(() => {
        throw new Error("no such table: questions_vec");
      });

      const result = await questionService.searchSimilarQuestions("content");

      expect(result).toEqual([]);
    });
  });
});
