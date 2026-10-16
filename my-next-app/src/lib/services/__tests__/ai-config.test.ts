// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// 使用 vi.hoisted 确保 mock 在 vi.mock 之前初始化
const {
  mockSelect,
  mockFrom,
  mockOrderBy,
  mockWhere,
  mockGet,
  mockAll,
  mockInsert,
  mockValues,
  mockOnConflictDoUpdate,
  mockDelete,
  mockUpdate,
  mockSet,
  mockReturning,
  mockTransaction,
} = vi.hoisted(() => {
  // 先创建所有 mock
  const mockAll = vi.fn();
  const mockGet = vi.fn();
  const mockWhere = vi.fn();
  const mockFrom = vi.fn();
  const mockOrderBy = vi.fn();
  const mockValues = vi.fn();
  const mockOnConflictDoUpdate = vi.fn();
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockDelete = vi.fn();
  const mockUpdate = vi.fn();
  const mockSet = vi.fn();
  const mockReturning = vi.fn();
  const mockTransaction = vi.fn();

  // 设置链式调用的返回值
  mockSelect.mockReturnValue({ from: mockFrom, update: mockUpdate });
  mockFrom.mockReturnValue({
    orderBy: mockOrderBy,
    where: mockWhere,
    get: mockGet,
    then: (resolve: (value: unknown[]) => unknown) => resolve([]),
  });
  mockOrderBy.mockReturnValue({
    then: (resolve: (value: unknown[]) => unknown) => resolve([]),
  });
  mockWhere.mockReturnValue({ get: mockGet });
  mockInsert.mockReturnValue({ values: mockValues });
  mockValues.mockReturnValue({
    onConflictDoUpdate: mockOnConflictDoUpdate,
    returning: mockReturning,
  });
  mockOnConflictDoUpdate.mockResolvedValue({});
  mockReturning.mockResolvedValue([{ id: 1 }]);
  mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue({}) });
  mockUpdate.mockReturnValue({ set: mockSet });
  mockSet.mockReturnValue({ where: vi.fn().mockResolvedValue({}) });

  // Transaction 默认实现
  mockTransaction.mockImplementation(
    (cb: (tx: unknown) => Promise<unknown>) => {
      return cb({
        update: mockUpdate,
        set: mockSet,
        where: mockWhere,
      });
    },
  );

  return {
    mockSelect,
    mockFrom,
    mockOrderBy,
    mockWhere,
    mockGet,
    mockAll,
    mockInsert,
    mockValues,
    mockOnConflictDoUpdate,
    mockDelete,
    mockUpdate,
    mockSet,
    mockReturning,
    mockTransaction,
  };
});

vi.mock("@/lib/db", () => ({
  drizzleDb: {
    select: mockSelect,
    insert: mockInsert,
    delete: mockDelete,
    update: mockUpdate,
    transaction: mockTransaction,
  },
  drizzleSchema: {
    ai_configs: {
      id: "id",
      name: "name",
      api_url: "api_url",
      api_key: "api_key",
      is_active: "is_active",
      created_at: "created_at",
    },
    ai_model_routes: {
      feature: "feature",
      config_id: "config_id",
      model_name: "model_name",
      updated_at: "updated_at",
    },
  },
}));

import { aiConfigService, AiConfig, AiModelRoute } from "../ai-config";

describe("AiConfigService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 重置链式调用的返回值
    mockSelect.mockReturnValue({ from: mockFrom, update: mockUpdate });
    mockFrom.mockReturnValue({
      orderBy: mockOrderBy,
      where: mockWhere,
      get: mockGet,
      then: (resolve: (value: unknown[]) => unknown) => resolve([]),
    });
  });

  describe("getConfigs", () => {
    it("should return all AI configs ordered by created_at desc", async () => {
      const mockConfigs = [
        {
          id: 2,
          name: "Config 2",
          api_url: "https://api.example.com",
          api_key: "key2",
          model_economy: "gpt-4o-mini",
          model_premium: "gpt-4o",
          model_embedding: "text-embedding-3-small",
          embedding_dimensions: 768,
          model_rerank: "",
          model_knowledge: "",
          is_active: 1,
          created_at: "2024-01-02",
        },
        {
          id: 1,
          name: "Config 1",
          api_url: "https://api.other.com",
          api_key: "key1",
          model_economy: "gpt-3.5-turbo",
          model_premium: "gpt-4",
          model_embedding: "text-embedding-ada-002",
          embedding_dimensions: 1536,
          model_rerank: "cross-encoder",
          model_knowledge: "knowledge-base",
          is_active: 0,
          created_at: "2024-01-01",
        },
      ];

      mockOrderBy.mockReturnValue({
        then: (resolve: (value: unknown[]) => unknown) => resolve(mockConfigs),
      });

      const result = await aiConfigService.getConfigs();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(2);
      expect(result[0].is_active).toBe(true);
      expect(result[1].is_active).toBe(false);
    });

    it("should return empty array when no configs exist", async () => {
      mockOrderBy.mockReturnValue({
        then: (resolve: (value: unknown[]) => unknown) => resolve([]),
      });

      const result = await aiConfigService.getConfigs();

      expect(result).toEqual([]);
    });
  });

  describe("saveConfig", () => {
    it("should update existing config when id is provided", async () => {
      mockFrom.mockReturnValue({
        where: mockWhere,
        get: mockGet,
        then: (resolve: (value: unknown[]) => unknown) => resolve([]),
      });

      const result = await aiConfigService.saveConfig({
        id: 1,
        name: "Updated Config",
        api_url: "https://api.new.com",
        api_key: "new-key",
      });

      expect(result).toBe(1);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("should create new config with default values when id is not provided", async () => {
      // Mock count query - returns 0 (first config)
      mockGet.mockResolvedValue({ value: 0 });

      const result = await aiConfigService.saveConfig({
        name: "New Config",
        api_url: "https://api.new.com",
        api_key: "new-key",
      });

      expect(result).toBe(1);
      expect(mockInsert).toHaveBeenCalled();
    });

    it("should set is_active to false when adding second config", async () => {
      // Mock count query - returns 1 (not first)
      mockGet.mockResolvedValue({ value: 1 });

      await aiConfigService.saveConfig({
        name: "Second Config",
        api_url: "https://api.second.com",
        api_key: "second-key",
      });

      // Verify insert was called
      expect(mockInsert).toHaveBeenCalled();
    });
  });

  describe("deleteConfig", () => {
    it("should throw error when deleting active config", async () => {
      mockWhere.mockReturnValue({
        get: vi.fn().mockResolvedValue({ is_active: 1 }),
      });

      await expect(aiConfigService.deleteConfig(1)).rejects.toThrow(
        "无法删除当前激活的配置，请先切换到其他配置。",
      );
    });

    it("should delete config when it is not active", async () => {
      mockWhere.mockReturnValue({
        get: vi.fn().mockResolvedValue({ is_active: 0 }),
      });

      const result = await aiConfigService.deleteConfig(1);

      expect(result).toBe(true);
      expect(mockDelete).toHaveBeenCalled();
    });

    it("should allow deleting non-existent config", async () => {
      mockWhere.mockReturnValue({
        get: vi.fn().mockResolvedValue(null),
      });

      const result = await aiConfigService.deleteConfig(999);

      expect(result).toBe(true);
    });
  });

  describe("setActiveConfig", () => {
    it("should deactivate all configs and activate the specified one", async () => {
      const result = await aiConfigService.setActiveConfig(2);

      expect(result).toBe(true);
      expect(mockTransaction).toHaveBeenCalled();
      // Should call update twice: first to set all to false, then to set target to true
      expect(mockUpdate).toHaveBeenCalledTimes(2);
    });
  });

  describe("getRoutes", () => {
    it("should return all model routes", async () => {
      const mockRoutes = [
        {
          feature: "chat",
          config_id: 1,
          model_name: "gpt-4o",
          updated_at: "2024-01-01",
        },
        {
          feature: "embedding",
          config_id: 1,
          model_name: "text-embedding-3-small",
          updated_at: "2024-01-01",
        },
      ];

      mockFrom.mockReturnValue({
        then: (resolve: (value: unknown[]) => unknown) => resolve(mockRoutes),
      });

      const result = await aiConfigService.getRoutes();

      expect(result).toEqual(mockRoutes);
      expect(result).toHaveLength(2);
    });

    it("should return empty array when no routes exist", async () => {
      mockFrom.mockReturnValue({
        then: (resolve: (value: unknown[]) => unknown) => resolve([]),
      });

      const result = await aiConfigService.getRoutes();

      expect(result).toEqual([]);
    });
  });

  describe("saveRoute", () => {
    it("should insert or update route with onConflictDoUpdate", async () => {
      const result = await aiConfigService.saveRoute({
        feature: "chat",
        config_id: 1,
        model_name: "gpt-4o",
      });

      expect(result).toBe(true);
      expect(mockInsert).toHaveBeenCalled();
    });

    it("should update updated_at on conflict", async () => {
      await aiConfigService.saveRoute({
        feature: "existing-feature",
        config_id: 2,
        model_name: "claude-3-opus",
      });

      // Verify onConflictDoUpdate was called
      expect(mockOnConflictDoUpdate).toHaveBeenCalled();
    });
  });
});
