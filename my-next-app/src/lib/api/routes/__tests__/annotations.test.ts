// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../annotations";

// Mock Drizzle
const { mockDrizzleDb, mockDrizzleSchema } = vi.hoisted(() => {
  const makeChain = () => {
    const chain: any = {
      then: vi.fn((resolve) => resolve([])),
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
      "onConflictDoUpdate",
    ];
    methods.forEach((m) => {
      chain[m] = vi.fn(() => chain);
    });
    return chain;
  };

  const chain = makeChain();
  return {
    mockDrizzleDb: chain,
    mockDrizzleSchema: {
      text_annotations: {
        id: "id",
        user_id: "user_id",
        question_id: "question_id",
        start_offset: "start_offset",
        end_offset: "end_offset",
        tag: "tag",
        color: "color",
        created_at: "created_at",
      },
    },
  };
});

vi.mock("@/lib/db", () => ({
  drizzleDb: mockDrizzleDb,
  drizzleSchema: mockDrizzleSchema,
}));

// Mock Auth Middleware
vi.mock("@/lib/api/middlewares/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", { id: 1, role: "user" });
    await next();
  },
  getCurrentUser: () => ({ id: 1, role: "user" }),
}));

describe("Annotations Hono Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Re-setup chain returns because clearAllMocks wipes them
    const chain = mockDrizzleDb as any;
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
      "onConflictDoUpdate",
    ];
    methods.forEach((m) => chain[m].mockReturnValue(chain));
    chain.then.mockImplementation((resolve: any) => resolve([]));
  });

  describe("GET /", () => {
    it("should return list of annotations", async () => {
      const mockRows = [{ id: 1, startOffset: 10, endOffset: 20 }];
      (mockDrizzleDb as any).then.mockImplementation((resolve: any) =>
        resolve(mockRows),
      );

      const res = await app.request("/?questionId=1");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.annotations).toHaveLength(1);
    });
  });

  describe("POST /", () => {
    it("should create an annotation", async () => {
      (mockDrizzleDb as any).then.mockImplementation((resolve: any) =>
        resolve({ lastInsertRowid: 42 }),
      );

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: 1,
          startOffset: 10,
          endOffset: 20,
          tag: "highlight",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe(42);
    });
  });

  describe("DELETE /", () => {
    it("should delete an annotation", async () => {
      (mockDrizzleDb as any).then.mockImplementation((resolve: any) =>
        resolve({ rowsAffected: 1 }),
      );

      const res = await app.request("/?id=1", {
        method: "DELETE",
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toBe("标注已删除");
    });

    it("should return 404 if annotation not found", async () => {
      (mockDrizzleDb as any).then.mockImplementation((resolve: any) =>
        resolve({ rowsAffected: 0 }),
      );

      const res = await app.request("/?id=999", {
        method: "DELETE",
      });

      expect(res.status).toBe(404);
    });
  });
});
