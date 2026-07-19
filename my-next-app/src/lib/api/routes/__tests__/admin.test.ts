// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupTestDb, type TestDbHelper } from "@/lib/__tests__/test-db-utils";
import * as schema from "@/lib/db/drizzle-schema";

// 1. 设置 Mock
let testDbHelper: TestDbHelper;

vi.mock("@/lib/db", () => ({
  get drizzleDb() {
    return testDbHelper.db;
  },
  get drizzleSchema() {
    return schema;
  },
}));

const { mockRequireRole, mockLogAdminAction } = vi.hoisted(() => {
  return {
    mockRequireRole: vi
      .fn()
      .mockResolvedValue({ id: 1, role: "admin", username: "admin_user" }),
    mockLogAdminAction: vi.fn(),
  };
});

vi.mock("@/lib/auth/auth", () => ({ requireRole: mockRequireRole }));
vi.mock("@/lib/admin/audit", () => ({ logAdminAction: mockLogAdminAction }));
vi.mock("@/lib/admin/api-stats-service", () => ({
  getApiCallStats: vi.fn().mockReturnValue({ total: 100 }),
}));

// 导入路由
import { adminRoute as app } from "../admin";

describe("Admin Hono Routes (Integration)", () => {
  beforeEach(async () => {
    testDbHelper = await setupTestDb();
    // 预置系统用户 (ID=0) 用于 settings
    await testDbHelper.db.insert(schema.users).values({
      id: 0,
      username: "system_global_user",
      password_hash: "none",
      role: "admin",
    });
    // 预置普通管理员用户 (ID=1)
    await testDbHelper.db.insert(schema.users).values({
      id: 1,
      username: "admin_user",
      password_hash: "none",
      role: "admin",
    });
  });

  afterEach(async () => {
    await testDbHelper.close();
  });

  describe("GET /system", () => {
    it("should return system status with stats", async () => {
      await testDbHelper.db.insert(schema.system_settings).values({
        user_id: 0,
        key: "demo_mode_enabled",
        value: "true",
      });

      const res = await app.request("/system");
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.demoMode).toBe(true);
      expect(data.ai.total).toBe(100);
    });
  });

  describe("POST /system", () => {
    it("should toggle demo mode", async () => {
      // 初始值为 false
      await testDbHelper.db.insert(schema.system_settings).values({
        user_id: 0,
        key: "demo_mode_enabled",
        value: "false",
      });

      const res = await app.request("/system", {
        method: "POST",
        body: JSON.stringify({ action: "toggle_demo_mode" }),
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.demoMode).toBe(true);

      // 验证数据库
      const row = await testDbHelper.db.query.system_settings.findFirst({
        where: (f: any, { eq, and }: any) =>
          and(eq(f.user_id, 0), eq(f.key, "demo_mode_enabled")),
      });
      expect(row?.value).toBe("true");
    });
  });

  describe("GET /backup-history", () => {
    it("should return empty history when no records exist", async () => {
      const res = await app.request("/backup-history");
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.history).toEqual([]);
      expect(data.total).toBe(0);
    });

    it("should return backup and restore history", async () => {
      // 插入两条记录
      await testDbHelper.db.insert(schema.admin_logs).values([
        {
          user_id: 1,
          username: "admin_user",
          action: "BACKUP_DATABASE",
          target_type: "system",
          target_id: "database",
          details: JSON.stringify({
            filename: "ai-learning-backup-2026-04-29.db",
          }),
        },
        {
          user_id: 1,
          username: "admin_user",
          action: "RESTORE_DATABASE",
          target_type: "system",
          target_id: "database",
          details: JSON.stringify({
            filename: "restore.db",
            backupCreated: "ai-learning.db.bak-123",
          }),
        },
      ]);

      const res = await app.request("/backup-history");
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.total).toBe(2);
      const backup = data.history.find(
        (h: any) => h.action === "BACKUP_DATABASE",
      );
      const restore = data.history.find(
        (h: any) => h.action === "RESTORE_DATABASE",
      );
      expect(backup).toBeTruthy();
      expect(backup.filename).toBe("ai-learning-backup-2026-04-29.db");
      expect(backup.username).toBe("admin_user");
      expect(restore).toBeTruthy();
      expect(restore.filename).toBe("restore.db");
      expect(restore.backupCreated).toBe("ai-learning.db.bak-123");
      expect(restore.username).toBe("admin_user");
    });

    it("should exclude non-backup admin logs", async () => {
      await testDbHelper.db.insert(schema.admin_logs).values([
        {
          user_id: 1,
          username: "admin_user",
          action: "TOGGLE_DEMO_MODE",
          target_type: "system",
          target_id: null,
          details: null,
        },
        {
          user_id: 1,
          username: "admin_user",
          action: "BACKUP_DATABASE",
          target_type: "system",
          target_id: "database",
          details: JSON.stringify({ filename: "test.db" }),
        },
      ]);

      const res = await app.request("/backup-history");
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.total).toBe(1);
      expect(data.history[0].action).toBe("BACKUP_DATABASE");
    });

    it("should return 401 when unauthorized", async () => {
      mockRequireRole.mockRejectedValueOnce(new Error("Unauthorized"));

      const res = await app.request("/backup-history");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /export/questions", () => {
    it("should return CSV on success", async () => {
      await testDbHelper.db.insert(schema.questions).values({
        content: "Q1",
        answer: "A",
        options: '["A", "B"]',
        tags: '["tag1"]',
      });

      const res = await app.request("/export/questions");
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/csv");
      expect(await res.text()).toContain("Q1");
    });
  });

  describe("POST /sql-scripts/validate", () => {
    it("should validate safe SQL", async () => {
      const res = await app.request("/sql-scripts/validate", {
        method: "POST",
        body: JSON.stringify({
          sql: "SELECT * FROM questions WHERE id = 1",
          description: "test",
        }),
        headers: { "Content-Type": "application/json" },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.valid).toBe(true);
    });

    it("should reject DROP SQL", async () => {
      const res = await app.request("/sql-scripts/validate", {
        method: "POST",
        body: JSON.stringify({
          sql: "DROP TABLE questions",
          description: "test",
        }),
        headers: { "Content-Type": "application/json" },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.valid).toBe(false);
      expect(data.error).toContain("DROP");
    });

    it("should reject DELETE without WHERE", async () => {
      const res = await app.request("/sql-scripts/validate", {
        method: "POST",
        body: JSON.stringify({
          sql: "DELETE FROM questions",
          description: "test",
        }),
        headers: { "Content-Type": "application/json" },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.valid).toBe(false);
      expect(data.error).toContain("WHERE");
    });

    it("should return 401 when unauthorized", async () => {
      mockRequireRole.mockRejectedValueOnce(new Error("Unauthorized"));

      const res = await app.request("/sql-scripts/validate", {
        method: "POST",
        body: JSON.stringify({ sql: "SELECT 1", description: "test" }),
        headers: { "Content-Type": "application/json" },
      });

      expect(res.status).toBe(401);
    });
  });

  describe("GET /sql-scripts/history", () => {
    it("should return execution history", async () => {
      await testDbHelper.db.insert(schema.admin_logs).values({
        user_id: 1,
        username: "admin_user",
        action: "EXECUTE_SQL_SCRIPT",
        target_type: "system",
        target_id: null,
        details: JSON.stringify({
          description: "test script",
          rowsAffected: 5,
        }),
        ip_address: null,
      });

      const res = await app.request("/sql-scripts/history");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.history).toHaveLength(1);
      expect(data.history[0].description).toBe("test script");
      expect(data.history[0].rowsAffected).toBe(5);
    });

    it("should return empty array when no history", async () => {
      const res = await app.request("/sql-scripts/history");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.history).toHaveLength(0);
    });
  });
});
