import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `setupVectorExtension` 现在只是一层委托：探测走 legacy 连接上的 `vec-store`，
 * 建表也在同一条连接（libsql 主连接加载不到 vec0，见 `vec-store.ts` 头注释）。
 * 这里只钉委托语义；真库路径由 `services/__tests__/question-vector.contract.test.ts`
 * 覆盖，不在这里用 mock 数据库冒充。
 */
const vecStore = vi.hoisted(() => ({
  isVectorAvailable: vi.fn(),
  ensureVectorTables: vi.fn(),
}));

vi.mock("../vec-store", () => ({
  isVectorAvailable: vecStore.isVectorAvailable,
  ensureVectorTables: vecStore.ensureVectorTables,
}));

import { setupVectorExtension } from "../vector-setup";

describe("vector-setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vecStore.isVectorAvailable.mockReturnValue(true);
    vecStore.ensureVectorTables.mockResolvedValue(true);
  });

  describe("setupVectorExtension", () => {
    it("should return false without touching tables when the extension is unavailable", async () => {
      vecStore.isVectorAvailable.mockReturnValue(false);

      const result = await setupVectorExtension();

      expect(result).toBe(false);
      expect(vecStore.ensureVectorTables).not.toHaveBeenCalled();
    });

    it("should return true when the extension is available and tables are ready", async () => {
      const result = await setupVectorExtension();

      expect(result).toBe(true);
      expect(vecStore.ensureVectorTables).toHaveBeenCalledTimes(1);
    });

    it("should return false when table creation fails", async () => {
      vecStore.ensureVectorTables.mockResolvedValue(false);

      const result = await setupVectorExtension();

      expect(result).toBe(false);
    });

    it("should propagate unexpected errors from table creation (initDatabase catches them)", async () => {
      vecStore.ensureVectorTables.mockRejectedValue(
        new Error("no such module: vec0"),
      );

      // 本函数不吞异常：`initDatabase` 已有 try/catch 把向量初始化失败降级为
      // "无向量能力"，在这里再吞一层只会让真实故障更难定位
      await expect(setupVectorExtension()).rejects.toThrow(
        "no such module: vec0",
      );
    });
  });
});
