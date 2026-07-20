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

// 导入路由
import app from "../external";

describe("External API Routes (Integration)", () => {
  beforeEach(async () => {
    testDbHelper = await setupTestDb();
  });

  afterEach(async () => {
    await testDbHelper.close();
  });

  describe("GET /questions (API Key Auth)", () => {
    it("should return 401 if API key is invalid", async () => {
      const res = await app.request("/questions", {
        headers: { Authorization: "Bearer invalid" },
      });
      expect(res.status).toBe(401);
    });

    it("should return 403 if API key is inactive", async () => {
      await testDbHelper.db.insert(schema.api_keys).values({
        key_string: "inactive-key",
        is_active: 0,
      });

      const res = await app.request("/questions", {
        headers: { Authorization: "Bearer inactive-key" },
      });
      expect(res.status).toBe(403);
    });

    it("should return 200 if API key is valid", async () => {
      await testDbHelper.db.insert(schema.api_keys).values({
        key_string: "valid-key",
        is_active: 1,
      });

      await testDbHelper.db.insert(schema.questions).values({
        content: "Test Question",
        answer: "A",
        options: "[]",
        tags: "[]",
      });

      const res = await app.request("/questions", {
        headers: { Authorization: "Bearer valid-key" },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data).toHaveLength(1);
      expect(data.pagination.total).toBe(1);
    });
  });
});
