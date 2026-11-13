// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
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
import { requireScope, type ResolvedApiKey } from "../../middlewares/api-key";
import { apiAuditForWrites } from "../../audit";

/** 用于直接探测中间件行为的极简 Hono 应用 */
function createProbeApp(required: "read" | "write" | "admin" = "read") {
  const probe = new Hono();
  probe.get("/probe", async (c) => {
    const identity = await requireScope(c, required);
    if (identity instanceof Response) return identity;
    const resolved: ResolvedApiKey = identity;
    return c.json({
      keyId: resolved.keyId,
      userId: resolved.userId,
      effectiveUserId: resolved.effectiveUserId,
      scope: resolved.scope,
      isGlobal: resolved.isGlobal,
    });
  });
  return probe;
}

/** 用于验证写操作审计的极简 Hono 应用（审计 + 按路由的作用域校验） */
function createAuditProbeApp() {
  const probe = new Hono();
  probe.use("*", apiAuditForWrites());
  const guard =
    (required: "read" | "write" | "admin") =>
    async (c: Parameters<typeof requireScope>[0], next: () => Promise<void>) => {
      const identity = await requireScope(c, required);
      if (identity instanceof Response) return identity;
      await next();
    };
  probe.post("/write", guard("write"), (c) => c.json({ ok: true }));
  probe.get("/read", guard("read"), (c) => c.json({ ok: true }));
  return probe;
}

describe("External API Routes (Integration)", () => {
  beforeEach(async () => {
    testDbHelper = await setupTestDb();
  });

  afterEach(async () => {
    await testDbHelper.close();
  });

  describe("GET /questions (API Key Auth)", () => {
    it("should return 401 without Authorization header", async () => {
      const res = await app.request("/questions");
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain("缺少 Authorization: Bearer <key>");
    });

    it("should return 401 if API key is invalid", async () => {
      const res = await app.request("/questions", {
        headers: { Authorization: "Bearer invalid" },
      });
      expect(res.status).toBe(401);
    });

    it("should return 401 if API key is inactive", async () => {
      await testDbHelper.db.insert(schema.api_keys).values({
        key_string: "inactive-key",
        is_active: 0,
      });

      const res = await app.request("/questions", {
        headers: { Authorization: "Bearer inactive-key" },
      });
      expect(res.status).toBe(401);
    });

    it("should return 200 if API key is valid (scope = read)", async () => {
      await testDbHelper.db.insert(schema.api_keys).values({
        key_string: "valid-key",
        is_active: 1,
        scopes: "read",
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

    it("should bump last_used_at in the background without blocking the response", async () => {
      const [row] = await testDbHelper.db
        .insert(schema.api_keys)
        .values({
          key_string: "tracked-key",
          is_active: 1,
          scopes: "read",
        })
        .returning({ id: schema.api_keys.id });

      const res = await app.request("/questions", {
        headers: { Authorization: "Bearer tracked-key" },
      });
      expect(res.status).toBe(200);

      await vi.waitFor(async () => {
        const [after] = await testDbHelper.db
          .select()
          .from(schema.api_keys)
          .where(eq(schema.api_keys.id, row.id));
        expect(after.last_used_at).not.toBeNull();
      });
    });

    it("should treat user_id = null as a global key using API_GLOBAL_USER_ID", async () => {
      const previous = process.env.API_GLOBAL_USER_ID;
      process.env.API_GLOBAL_USER_ID = "42";
      try {
        await testDbHelper.seedUser(42, "owner");
        await testDbHelper.db.insert(schema.api_keys).values({
          key_string: "global-key",
          is_active: 1,
          scopes: "admin",
          user_id: null,
        });

        const res = await createProbeApp("read").request("/probe", {
          headers: { Authorization: "Bearer global-key" },
        });
        expect(res.status).toBe(200);
        const identity = await res.json();
        expect(identity.isGlobal).toBe(true);
        expect(identity.userId).toBeNull();
        expect(identity.effectiveUserId).toBe(42);
      } finally {
        if (previous === undefined) {
          delete process.env.API_GLOBAL_USER_ID;
        } else {
          process.env.API_GLOBAL_USER_ID = previous;
        }
      }
    });

    it("should return 403 when a read key hits a write-scoped middleware", async () => {
      await testDbHelper.db.insert(schema.api_keys).values({
        key_string: "read-only-key",
        is_active: 1,
        scopes: "read",
      });

      const res = await createProbeApp("write").request("/probe", {
        headers: { Authorization: "Bearer read-only-key" },
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain("write");
    });
  });

  describe("Write audit (api_audit_logs)", () => {    it("should record write requests with key identity and status", async () => {
      await testDbHelper.seedUser(7, "writer");
      await testDbHelper.db.insert(schema.api_keys).values({
        key_string: "write-key",
        is_active: 1,
        scopes: "write",
        user_id: 7,
      });

      const res = await createAuditProbeApp().request("/write", {
        method: "POST",
        headers: { Authorization: "Bearer write-key" },
      });
      expect(res.status).toBe(200);

      const rows = await testDbHelper.db.select().from(schema.api_audit_logs);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        method: "POST",
        path: "/write",
        status: 200,
        user_id: 7,
      });
      expect(rows[0].key_id).toBeGreaterThan(0);
      expect(rows[0].duration_ms).toBeGreaterThanOrEqual(0);
    });

    it("should not record read requests", async () => {
      await testDbHelper.db.insert(schema.api_keys).values({
        key_string: "reader-key",
        is_active: 1,
        scopes: "read",
      });

      const res = await createAuditProbeApp().request("/read", {
        headers: { Authorization: "Bearer reader-key" },
      });
      expect(res.status).toBe(200);

      const rows = await testDbHelper.db.select().from(schema.api_audit_logs);
      expect(rows).toHaveLength(0);
    });
  });
});
