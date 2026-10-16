// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupTestDb, type TestDbHelper } from "@/lib/__tests__/test-db-utils";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/drizzle-schema";

// 1. 设置 Mock
let testDbHelper: TestDbHelper;

vi.mock("@/lib/db", () => ({
  // 动态返回当前测试的内存数据库
  get drizzleDb() {
    return testDbHelper.db;
  },
  get drizzleSchema() {
    return schema;
  },
}));

vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), info: vi.fn() },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// 导入要测试的 Actions
import {
  getGlobalFeatureFlag,
  toggleGlobalFeatureFlag,
} from "../feature-flags";

describe("Feature Flags Actions (Integration)", () => {
  beforeEach(async () => {
    testDbHelper = await setupTestDb();
    // 必须预置系统用户 (ID=0)，否则 system_settings 的外键约束会报错
    await testDbHelper.db.insert(schema.users).values({
      id: 0,
      username: "system_global_user",
      password_hash: "none",
      role: "admin",
    });
  });

  afterEach(async () => {
    await testDbHelper.close();
  });

  describe("getGlobalFeatureFlag", () => {
    it("应返回数据库中的开关值 (true)", async () => {
      await testDbHelper.db.insert(schema.system_settings).values({
        user_id: 0,
        key: "TEST_FLAG",
        value: "true",
      });

      const result = await getGlobalFeatureFlag("TEST_FLAG", false);
      expect(result).toBe(true);
    });

    it("应返回数据库中的开关值 (false)", async () => {
      await testDbHelper.db.insert(schema.system_settings).values({
        user_id: 0,
        key: "TEST_FLAG",
        value: "false",
      });

      const result = await getGlobalFeatureFlag("TEST_FLAG", true);
      expect(result).toBe(false);
    });

    it("如果数据库中没有记录，应返回默认值", async () => {
      const result = await getGlobalFeatureFlag("MISSING_FLAG", true);
      expect(result).toBe(true);
    });
  });

  describe("toggleGlobalFeatureFlag", () => {
    it("应成功更新开关状态并返回 success", async () => {
      const result = await toggleGlobalFeatureFlag("TEST_FLAG", true);

      expect(result.success).toBe(true);
      expect(result.value).toBe(true);

      // 验证数据库中确实存进去了
      const row: any = await testDbHelper.db.run(sql`
                SELECT value FROM system_settings WHERE key = 'TEST_FLAG'
            `);
      // 使用 Drizzle 验证
      const dbResult = await testDbHelper.db
        .select()
        .from(schema.system_settings)
        .all();
      expect(
        dbResult.find(
          (r: typeof schema.system_settings.$inferSelect) =>
            r.key === "TEST_FLAG",
        )?.value,
      ).toBe("true");
    });
  });
});
