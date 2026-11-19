// @vitest-environment node
/**
 * 后台数据维护：重复题清理接口（P1-1 的可操作入口）。
 *
 * 固定四件事：
 *   1. 状态接口返回待处理计数；
 *   2. 预检（apply=false）只读，不删任何数据；
 *   3. 执行（apply=true）先 VACUUM INTO 备份再清理，并写管理员审计日志；
 *   4. 非管理员 401。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import { setupTestDb, type TestDbHelper } from "@/lib/__tests__/test-db-utils";
import * as schema from "@/lib/db/drizzle-schema";

let testDbHelper: TestDbHelper;

vi.mock("@/lib/db", () => ({
  get drizzleDb() {
    return testDbHelper.db;
  },
  get drizzleSchema() {
    return schema;
  },
}));

const { mockRequireRole, mockLogAdminAction } = vi.hoisted(() => ({
  mockRequireRole: vi.fn().mockResolvedValue({
    id: 1,
    role: "admin",
    username: "admin_user",
  }),
  mockLogAdminAction: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({ requireRole: mockRequireRole }));
vi.mock("@/lib/admin/audit", () => ({ logAdminAction: mockLogAdminAction }));
vi.mock("@/lib/admin/api-stats-service", () => ({
  getApiCallStats: vi.fn().mockReturnValue({ total: 0 }),
}));

import { adminRoute as app } from "../admin";

describe("Admin 数据维护 · 重复题清理", () => {
  beforeEach(async () => {
    testDbHelper = await setupTestDb();
    await testDbHelper.db.insert(schema.users).values({
      id: 1,
      username: "admin_user",
      password_hash: "none",
      role: "admin",
    });
    await testDbHelper.db.insert(schema.questions).values([
      {
        id: 9401,
        content: "维护测试题干：重复题",
        options: '["甲","乙"]',
        answer: "甲",
        type: null,
        source: null,
      },
      {
        id: 9402,
        content: "维护测试题干：重复题",
        options: '["甲","乙"]',
        answer: '["甲","乙"]',
        type: "multi",
      },
      {
        id: 9403,
        content: "维护测试题干：唯一题",
        options: '["A","B"]',
        answer: "A",
        type: "single",
      },
    ]);
  });

  afterEach(async () => {
    await testDbHelper.close();
    for (const f of fs
      .readdirSync("data")
      .filter((f) => f.startsWith("backup-before-dedupe-"))) {
      fs.rmSync(`data/${f}`, { force: true });
    }
  });

  it("GET 状态返回待处理项", async () => {
    const res = await app.request("/maintenance/dedupe");
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.duplicateGroups).toBe(1);
    expect(data.fallbackWithCopy).toBe(1);
    expect(data.unhashedQuestions).toBe(3);
    expect(data.needsCleanup).toBe(true);
  });

  it("预检只读：不删数据、不写审计", async () => {
    const res = await app.request("/maintenance/dedupe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apply: false }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.report.fallbackPairs).toBe(1);
    expect(data.report.deletedQuestions).toBe(1); // 报告的是"将删除"
    expect(data.backupPath).toBeUndefined();

    const rows = await testDbHelper.db.select().from(schema.questions);
    expect(rows.length).toBe(3);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it("执行：先备份、再清理、写审计，状态归零", async () => {
    const res = await app.request("/maintenance/dedupe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apply: true }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.report.deletedQuestions).toBe(1);
    expect(typeof data.backupPath).toBe("string");
    expect(fs.existsSync(data.backupPath)).toBe(true);
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      1,
      "admin_user",
      "DATA_DEDUPE",
      "system",
      "questions",
      expect.objectContaining({ deletedQuestions: 1 }),
    );

    const rows = await testDbHelper.db.select().from(schema.questions);
    expect(rows.length).toBe(2);

    const statusRes = await app.request("/maintenance/dedupe");
    const status = await statusRes.json();
    expect(status.needsCleanup).toBe(false);
  });

  it("非管理员 401", async () => {
    mockRequireRole.mockRejectedValueOnce(new Error("Forbidden: 无权限"));
    const res = await app.request("/maintenance/dedupe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apply: false }),
    });
    expect(res.status).toBe(401);
  });
});
