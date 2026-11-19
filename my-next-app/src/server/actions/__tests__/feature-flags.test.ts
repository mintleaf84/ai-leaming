// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupTestDb, type TestDbHelper } from "@/lib/__tests__/test-db-utils";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
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

/**
 * `react` 的 `cache()` 只有 **react-server** 构建里是真的记忆化 —— 客户端构建里
 * 它就是个透传（node_modules/react/cjs/react.development.js 的 `exports.cache`）。
 * Next 的服务端渲染用的正是 react-server 构建，所以下面的"同一请求只查一次库"
 * 用例必须换成那份实现，否则测的是透传、永远看不出差异。
 */
vi.mock("react", async () => {
  const path = await import("node:path");
  const { createRequire } = await import("node:module");
  const requireFromReact = createRequire(
    path.join(process.cwd(), "node_modules/react/index.js"),
  );
  return requireFromReact("./cjs/react.react-server.development.js");
});

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

    it("同一请求内同一 flag 只查一次库（react cache 按请求记忆化）", async () => {
      await testDbHelper.db.insert(schema.system_settings).values({
        user_id: 0,
        key: "ENABLE_TEXTBOOK",
        value: "true",
      });

      const ReactServer = (await import("react")) as unknown as {
        __SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: {
          A: unknown;
        };
      };
      const internals =
        ReactServer.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

      const selectSpy = vi.spyOn(testDbHelper.db, "select");

      // 模拟一次请求：React 的 cache 作用域就是一个 dispatcher（store 每次请求一个）
      const runInRequestScope = async (fn: () => Promise<void>) => {
        const store = new Map();
        internals.A = { getCacheForType: () => store };
        try {
          await fn();
        } finally {
          internals.A = null;
        }
      };

      // layout.tsx 与 dashboard 各查一次同名 flag：一次请求内应当只落一次库
      await runInRequestScope(async () => {
        expect(await getGlobalFeatureFlag("ENABLE_TEXTBOOK", false)).toBe(true);
        expect(await getGlobalFeatureFlag("ENABLE_TEXTBOOK", false)).toBe(true);
        expect(await getGlobalFeatureFlag("ENABLE_TEXTBOOK", false)).toBe(true);
      });
      expect(selectSpy).toHaveBeenCalledTimes(1);

      // 下一个请求（新作用域）必须重新查库：管理后台改完开关不能读到旧值
      await runInRequestScope(async () => {
        await testDbHelper.db
          .update(schema.system_settings)
          .set({ value: "false" })
          .where(eq(schema.system_settings.key, "ENABLE_TEXTBOOK"));
        expect(await getGlobalFeatureFlag("ENABLE_TEXTBOOK", true)).toBe(false);
      });
      expect(selectSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("toggleGlobalFeatureFlag", () => {
    it("应成功更新开关状态并返回 success", async () => {
      const result = await toggleGlobalFeatureFlag("TEST_FLAG", true);

      expect(result.success).toBe(true);
      expect(result.value).toBe(true);

      // 验证数据库中确实存进去了
      await testDbHelper.db.run(sql`
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
