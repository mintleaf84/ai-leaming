// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { wrongQuestionService } from "../wrong-question";

const { mockDrizzleDb, mockDrizzleSchema } = vi.hoisted(() => {
  const makeChain = () => {
    const chain: any = {
      then: vi.fn((resolve) => resolve([])),
      get: vi.fn(() => ({})),
      all: vi.fn(() => []),
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
      "groupBy",
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
    query: {},
  };

  const mockDrizzleSchema = {
    practice_logs: {
      user_id: "practice_logs.user_id",
      is_correct: "practice_logs.is_correct",
      question_id: "practice_logs.question_id",
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
      user_id: "mastered_questions.user_id",
      question_id: "mastered_questions.question_id",
      mastered_at: "mastered_questions.mastered_at",
      note: "mastered_questions.note",
    },
  };

  return { mockDrizzleDb, mockDrizzleSchema };
});

vi.mock("@/lib/db", () => ({
  drizzleDb: mockDrizzleDb,
}));

vi.mock("@/lib/db/drizzle-schema", () => mockDrizzleSchema);

describe("Wrong Question Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const chain = mockDrizzleDb as any;
    [
      "select",
      "from",
      "where",
      "limit",
      "offset",
      "orderBy",
      "groupBy",
      "innerJoin",
      "leftJoin",
    ].forEach((m) => {
      chain[m].mockReturnValue(chain);
    });
    chain.get.mockResolvedValue({});
    chain.all.mockResolvedValue([]);
    chain.then.mockImplementation((resolve: any) => resolve([]));
  });

  describe("getStats", () => {
    it("should return zero stats when no wrong questions", async () => {
      const chain = mockDrizzleDb as any;
      chain.get.mockResolvedValue({ count: 0 });
      chain.all.mockResolvedValue([]);

      const result = await wrongQuestionService.getStats(1);

      expect(result.total).toBe(0);
      expect(result.recent).toBe(0);
      expect(result.frequent).toBe(0);
    });

    it("should return correct stats", async () => {
      const chain = mockDrizzleDb as any;
      chain.get
        .mockResolvedValueOnce({ count: 50 })
        .mockResolvedValueOnce({ count: 10 });
      chain.all.mockResolvedValue([{ count: 5 }]);

      const result = await wrongQuestionService.getStats(1);

      expect(result.total).toBe(50);
      expect(result.recent).toBe(10);
      expect(result.frequent).toBe(5);
    });
  });

  describe("markAsMastered", () => {
    it("should mark question as mastered", async () => {
      const chain = mockDrizzleDb as any;
      chain.onConflictDoUpdate.mockResolvedValue({});

      const result = await wrongQuestionService.markAsMastered(1, 100);

      expect(result).toBe(true);
    });
  });

  describe("unmarkMastered", () => {
    it("should unmark question as mastered", async () => {
      const chain = mockDrizzleDb as any;
      chain.delete.mockReturnValue(chain);
      chain.where.mockReturnValue(chain);

      const result = await wrongQuestionService.unmarkMastered(1, 100);

      expect(result).toBe(true);
    });
  });
});
