// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock dayjs - must be default export that returns an object with subtract
vi.mock("dayjs", () => {
  const mockDayjs = {
    subtract: vi.fn().mockReturnValue({
      format: vi.fn(() => "2024-01-01 00:00:00"),
    }),
    format: vi.fn(() => "2024-01-01 00:00:00"),
  };
  return { default: vi.fn(() => mockDayjs) };
});

const { mockInsert, mockDelete, mockAll } = vi.hoisted(() => ({
  mockInsert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockReturnValue({
        set: vi.fn().mockResolvedValue({}),
      }),
    }),
  }),
  mockDelete: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue({}),
  }),
  mockAll: vi.fn().mockResolvedValue([{ count: 3 }]),
}));

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
    "groupBy",
  ];
  methods.forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  return chain;
};

const chain = makeChain();

vi.mock("@/lib/db", () => ({
  drizzleDb: {
    insert: mockInsert,
    delete: mockDelete,
    select: vi.fn(() => chain),
    all: mockAll,
  },
}));

vi.mock("@/lib/db/drizzle-schema", () => ({
  practice_logs: {
    id: "practice_logs.id",
    question_id: "practice_logs.question_id",
    user_id: "practice_logs.user_id",
    is_correct: "practice_logs.is_correct",
    timestamp: "practice_logs.timestamp",
    user_answer: "practice_logs.user_answer",
  },
  questions: {
    id: "questions.id",
    content: "questions.content",
    tags: "questions.tags",
    answer: "questions.answer",
    options: "questions.options",
    explanation: "questions.explanation",
    type: "questions.type",
  },
  question_srs: {
    question_id: "question_srs.question_id",
    user_id: "question_srs.user_id",
    stability: "question_srs.stability",
    difficulty: "question_srs.difficulty",
    due_date: "question_srs.due_date",
  },
  mastered_questions: {
    question_id: "mastered_questions.question_id",
    user_id: "mastered_questions.user_id",
    mastered_at: "mastered_questions.mastered_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ type: "eq", a, b })),
  and: vi.fn((...args) => ({ type: "and", args })),
  desc: vi.fn((x) => ({ type: "desc", x })),
  sql: vi.fn((s) => ({ type: "sql", sql: s })),
  gte: vi.fn((a, b) => ({ type: "gte", a, b })),
  notInArray: vi.fn((a, b) => ({ type: "notInArray", a, b })),
}));

import { wrongQuestionService } from "../wrong-question";

describe("WrongQuestionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset chain methods
    const chainMethods = [
      "from",
      "where",
      "groupBy",
      "orderBy",
      "limit",
      "all",
      "get",
      "innerJoin",
      "leftJoin",
    ];
    chainMethods.forEach((m) => {
      (chain as any)[m].mockReturnValue(chain);
    });
    (chain as any).then.mockImplementation((resolve: any) => resolve([]));
  });

  describe("getList", () => {
    it("should return wrong questions list", async () => {
      const mockRows = [
        {
          questionId: 1,
          questionContent: "Test Q",
          tags: '["tag1"]',
          correctAnswer: "A",
          wrongCount: 2,
          lastWrongAt: "2024-01-01",
          stability: 1.0,
          difficulty: 0.3,
          due_date: "2024-01-15",
          userLastAnswer: "B",
        },
      ];
      const mockMastered = [{ id: 100 }];

      (chain.from as any).mockImplementation((table: any) => {
        if (table === "mastered_questions") {
          return { where: vi.fn().mockResolvedValue(mockMastered) };
        }
        return chain;
      });

      // Mock count query
      chain.get.mockResolvedValueOnce({ count: 1 });
      // Mock main query
      (chain.then as any).mockImplementation((resolve: any) =>
        resolve(mockRows),
      );

      const result = await wrongQuestionService.getList(1);

      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].questionId).toBe(1);
      expect(result.questions[0].tags).toEqual(["tag1"]);
      expect(result.total).toBe(1);
    });

    it("should return empty list when no wrong questions", async () => {
      (chain.from as any).mockImplementation((table: any) => {
        if (table === "mastered_questions") {
          return { where: vi.fn().mockResolvedValue([]) };
        }
        return chain;
      });

      // Mock count query returns 0
      chain.get.mockResolvedValueOnce({ count: 0 });
      // Mock main query returns empty
      (chain.then as any).mockImplementation((resolve: any) => resolve([]));

      const result = await wrongQuestionService.getList(1);

      expect(result.questions).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe("getRandomRecommended", () => {
    it("should return priority mode recommendations", async () => {
      const mockRows = [
        {
          questionId: 1,
          questionContent: "Test Q",
          tags: '["tag1"]',
          correctAnswer: "A",
          wrongCount: 2,
          lastWrongAt: "2024-01-01",
        },
      ];
      (chain.then as any).mockImplementation((resolve: any) =>
        resolve(mockRows),
      );

      const result = await wrongQuestionService.getRandomRecommended(1, {
        count: 5,
        mode: "priority",
      });

      expect(result).toHaveLength(1);
      expect(result[0].questionId).toBe(1);
    });

    it("should return random mode recommendations", async () => {
      const mockRows = [
        {
          questionId: 2,
          questionContent: "Random Q",
          tags: "[]",
          correctAnswer: "B",
          wrongCount: 1,
          lastWrongAt: "2024-01-02",
        },
      ];
      (chain.then as any).mockImplementation((resolve: any) =>
        resolve(mockRows),
      );

      const result = await wrongQuestionService.getRandomRecommended(1, {
        count: 10,
        mode: "random",
      });

      expect(result).toHaveLength(1);
    });

    it("should filter by tag", async () => {
      const mockRows = [
        {
          questionId: 3,
          questionContent: "Tagged Q",
          tags: '["math"]',
          correctAnswer: "C",
          wrongCount: 1,
          lastWrongAt: "2024-01-03",
        },
      ];
      (chain.then as any).mockImplementation((resolve: any) =>
        resolve(mockRows),
      );

      const result = await wrongQuestionService.getRandomRecommended(1, {
        tag: "math",
        count: 5,
      });

      expect(result).toHaveLength(1);
    });
  });

  describe("getDetail", () => {
    it("should return question detail with history", async () => {
      const mockQuestion = {
        questions: {
          id: 1,
          content: "Test",
          options: '["A","B"]',
          answer: "A",
          explanation: "Explanation",
          tags: '["test"]',
          type: "single",
        },
        question_srs: {
          stability: 1.5,
          difficulty: 0.2,
          due_date: "2024-02-01",
        },
      };
      const mockStats = { wrongCount: 3, lastWrongAt: "2024-01-15" };
      const mockHistory = [
        { timestamp: "2024-01-15 10:00:00", userAnswer: "B", isCorrect: false },
        { timestamp: "2024-01-14 10:00:00", userAnswer: "A", isCorrect: true },
      ];

      // Mock for question query - distinguish tables
      (chain.from as any).mockImplementation((table: any) => {
        if (table?.content) {
          // questions table has 'content' property
          return {
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([mockQuestion]),
              }),
            }),
          };
        }
        return chain; // practice_logs table — keep chaining
      });

      // Stats query and history query both await chain (via .then), not .get()
      (chain.then as any)
        .mockImplementationOnce((resolve: any) => resolve([mockStats]))
        .mockImplementationOnce((resolve: any) => resolve(mockHistory));

      const result = await wrongQuestionService.getDetail(1, 1);

      expect(result).not.toBeNull();
      expect(result?.questionId).toBe(1);
      expect(result?.wrongCount).toBe(3);
    });

    it("should return null for non-existent question", async () => {
      (chain.from as any).mockImplementation(() => {
        return {
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        };
      });

      const result = await wrongQuestionService.getDetail(1, 999);
      expect(result).toBeNull();
    });
  });

  describe("getMasteredQuestions", () => {
    it("should return mastered questions list", async () => {
      const mockRows = [
        {
          questionId: 10,
          questionContent: "Mastered Q",
          tags: '["math"]',
          correctAnswer: "A",
          masteredAt: "2024-01-01",
        },
      ];
      (chain.then as any).mockImplementation((resolve: any) =>
        resolve(mockRows),
      );

      const result = await wrongQuestionService.getMasteredQuestions(1);

      expect(result).toHaveLength(1);
      expect(result[0].questionId).toBe(10);
      expect(result[0].wrongCount).toBe(0);
    });

    it("should return empty list when no mastered questions", async () => {
      (chain.then as any).mockImplementation((resolve: any) => resolve([]));

      const result = await wrongQuestionService.getMasteredQuestions(1);
      expect(result).toEqual([]);
    });
  });

  describe("getStats", () => {
    it("should return stats with counts from database queries", async () => {
      // total and recent use .select().from().where().get() → chain.get
      chain.get.mockReturnValue({ count: 10 });
      // frequent uses drizzleDb.all() → mockAll already returns [{ count: 3 }]

      const stats = await wrongQuestionService.getStats(1);

      expect(stats.total).toBe(10);
      expect(stats.recent).toBe(10);
      expect(stats.frequent).toBe(3);
    });
  });

  describe("markAsMastered", () => {
    it("should insert mastered question with note", async () => {
      const result = await wrongQuestionService.markAsMastered(
        1,
        100,
        "important",
      );

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it("should insert mastered question without note", async () => {
      const result = await wrongQuestionService.markAsMastered(1, 100);

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe("unmarkMastered", () => {
    it("should delete mastered question", async () => {
      const result = await wrongQuestionService.unmarkMastered(1, 100);

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });
});
