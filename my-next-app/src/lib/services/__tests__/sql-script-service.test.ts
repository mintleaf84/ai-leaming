import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SqlScriptService } from "../sql-script-service";

vi.mock("@/lib/db", () => ({
  drizzleDb: {
    all: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
    query: {
      admin_logs: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
  },
  drizzleSchema: {
    admin_logs: {
      user_id: "user_id",
      username: "username",
      action: "action",
      target_type: "target_type",
      target_id: "target_id",
      details: "details",
      ip_address: "ip_address",
      created_at: "created_at",
    },
  },
  getLegacyDb: vi.fn(),
}));

vi.mock("@/lib/admin/audit", () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

describe("SqlScriptService", () => {
  describe("validateScript", () => {
    it("应该允许正常的 SELECT 查询", () => {
      const result = SqlScriptService.validateScript(
        "SELECT * FROM questions WHERE id = 1",
      );
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("应该允许带 WHERE 的 UPDATE 语句", () => {
      const result = SqlScriptService.validateScript(
        "UPDATE questions SET content = 'new content' WHERE id = 1",
      );
      expect(result.valid).toBe(true);
    });

    it("应该允许带 WHERE 的 DELETE 语句", () => {
      const result = SqlScriptService.validateScript(
        "DELETE FROM questions WHERE id = 1",
      );
      expect(result.valid).toBe(true);
    });

    it("应该允许 INSERT 语句", () => {
      const result = SqlScriptService.validateScript(
        "INSERT INTO questions (content, type) VALUES ('test', 'choice')",
      );
      expect(result.valid).toBe(true);
    });

    it("应该拦截 DROP TABLE 语句", () => {
      const result = SqlScriptService.validateScript("DROP TABLE questions");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("DROP");
    });

    it("应该拦截 TRUNCATE 语句", () => {
      const result = SqlScriptService.validateScript(
        "TRUNCATE TABLE questions",
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("TRUNCATE");
    });

    it("应该拦截 ALTER TABLE 语句", () => {
      const result = SqlScriptService.validateScript(
        "ALTER TABLE questions ADD COLUMN test TEXT",
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("ALTER");
    });

    it("应该拦截 CREATE TABLE 语句", () => {
      const result = SqlScriptService.validateScript(
        "CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)",
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("CREATE");
    });

    it("应该拦截没有 WHERE 的 DELETE 语句", () => {
      const result = SqlScriptService.validateScript("DELETE FROM questions");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("WHERE");
    });

    it("应该拦截没有 WHERE 的 UPDATE 语句", () => {
      const result = SqlScriptService.validateScript(
        "UPDATE questions SET content = 'new'",
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("WHERE");
    });

    it("应该拦截 PRAGMA 语句", () => {
      const result = SqlScriptService.validateScript("PRAGMA journal_mode=WAL");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("PRAGMA");
    });

    it("应该检测多语句警告", () => {
      const sql = Array(11).fill("SELECT 1").join("; ");
      const result = SqlScriptService.validateScript(sql);
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.[0]).toContain("11 条");
    });

    it("应该检测注释警告", () => {
      const result = SqlScriptService.validateScript(
        "SELECT * FROM questions -- this is a comment",
      );
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.[0]).toContain("注释");
    });

    it("应该检测多行注释警告", () => {
      const result = SqlScriptService.validateScript(
        "SELECT * FROM questions /* comment */",
      );
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
    });

    it("应该拦截 ATTACH 语句", () => {
      const result = SqlScriptService.validateScript(
        "ATTACH DATABASE 'test.db' AS test",
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("ATTACH");
    });

    it("应该拦截 DETACH 语句", () => {
      const result = SqlScriptService.validateScript("DETACH DATABASE test");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("DETACH");
    });
  });

  describe("estimateRowsAffected", () => {
    it("应该估算 DELETE 语句的影响行数", async () => {
      const { drizzleDb } = await import("@/lib/db");
      vi.mocked(drizzleDb.all).mockResolvedValueOnce([{ count: 5 }] as any);

      const result = await SqlScriptService.estimateRowsAffected(
        'DELETE FROM questions WHERE type = "fill_blank"',
      );

      expect(result).toBe(5);
    });

    it("应该估算 UPDATE 语句的影响行数", async () => {
      const { drizzleDb } = await import("@/lib/db");
      vi.mocked(drizzleDb.all).mockResolvedValueOnce([{ count: 10 }] as any);

      const result = await SqlScriptService.estimateRowsAffected(
        'UPDATE questions SET updated_at = NOW() WHERE type = "choice"',
      );

      expect(result).toBe(10);
    });

    it("应该对非 DELETE/UPDATE 返回 null", async () => {
      const result = await SqlScriptService.estimateRowsAffected(
        "SELECT * FROM questions",
      );
      expect(result).toBeNull();
    });

    it("应该对没有 WHERE 的 DELETE 返回 null", async () => {
      const result = await SqlScriptService.estimateRowsAffected(
        "DELETE FROM questions",
      );
      expect(result).toBeNull();
    });
  });
});
