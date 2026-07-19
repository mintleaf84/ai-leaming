// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mindmapService } from "../mindmap";

const { mockDrizzleDb, mockDrizzleSchema } = vi.hoisted(() => {
  const makeChain = () => {
    const chain: any = {
      then: vi.fn((resolve) => resolve([])),
      get: vi.fn(() => ({})),
      returning: vi.fn(() => []),
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
      "orderBy",
    ];
    methods.forEach((m) => {
      chain[m] = vi.fn(() => chain);
    });
    return chain;
  };

  const chain = makeChain();
  const mockDrizzleDb = { ...chain, query: {} };

  const mockDrizzleSchema = {
    mindmaps: {
      id: "mindmaps.id",
      user_id: "mindmaps.user_id",
      title: "mindmaps.title",
      content: "mindmaps.content",
      updated_at: "mindmaps.updated_at",
    },
  };

  return { mockDrizzleDb, mockDrizzleSchema };
});

vi.mock("@/lib/db", () => ({ drizzleDb: mockDrizzleDb }));
vi.mock("@/lib/db/drizzle-schema", () => mockDrizzleSchema);

describe("Mindmap Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const chain = mockDrizzleDb as any;
    chain.get.mockResolvedValue({});
    chain.then.mockImplementation((resolve: any) => resolve([]));
    chain.returning.mockResolvedValue([]);
  });

  describe("create", () => {
    it("should create mindmap with default values", async () => {
      const chain = mockDrizzleDb as any;
      chain.returning.mockResolvedValue([{ id: 1 }]);

      const result = await mindmapService.create(1);

      expect(result).toBe(1);
      expect(chain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 1,
          title: "未命名思维导图",
          content: "# 新建导图\n\n- 在此输入内容",
        }),
      );
    });

    it("should create mindmap with custom title", async () => {
      const chain = mockDrizzleDb as any;
      chain.returning.mockResolvedValue([{ id: 2 }]);

      await mindmapService.create(1, { title: "自定义" });

      expect(chain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "自定义",
        }),
      );
    });
  });

  describe("update", () => {
    it("should throw error when mindmap not found", async () => {
      const chain = mockDrizzleDb as any;
      chain.get.mockResolvedValue(null);

      await expect(mindmapService.update(1, { id: 999 })).rejects.toThrow(
        "脑图不存在或无权限修改",
      );
    });
  });
});
