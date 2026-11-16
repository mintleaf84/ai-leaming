// @vitest-environment node
/**
 * Web Vitals 采集（docs/performance.md T-01）
 *
 * 真实依赖：真实 SQLite + 真实迁移（含 drizzle/0015），不 mock 数据库 ——
 * 这张表的价值在于"数字可信"，用 mock 验证等于没验证。
 *
 * 覆盖：
 *   1. 服务层写入与归一化（CLS 放大 1000；非法值归零）
 *   2. 分位数取点（p75 取升序第 ceil(0.75n) 个，不是平均值）
 *   3. 路由层契约：合法 body → 204，非法 name → 400
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";

const dbFile = `test-web-vitals-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

type DbModule = typeof import("../../db");
type VitalsService = typeof import("../web-vitals")["webVitalsService"];

let dbm: DbModule;
let vitals: VitalsService;
let vitalsRoute: typeof import("../../api/routes/vitals")["default"];

beforeAll(async () => {
  dbm = await import("../../db");
  await dbm.initDatabase();
  vitals = (await import("../web-vitals")).webVitalsService;
  vitalsRoute = (await import("../../api/routes/vitals")).default;
});

afterAll(async () => {
  await dbm.closeDrizzle();
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
      force: true,
    });
  }
});

describe("webVitalsService", () => {
  it("CLS 放大 1000 后取整，其它指标按毫秒取整", () => {
    expect(vitals.normalizeValue("CLS", 0.1234)).toBe(123);
    expect(vitals.normalizeValue("INP", 123.6)).toBe(124);
    // 非法输入归零，不写 NaN 污染统计
    expect(vitals.normalizeValue("INP", Number.NaN)).toBe(0);
    expect(vitals.normalizeValue("INP", -1)).toBe(0);
  });

  it("写入后能按路由与指标取回原始点", async () => {
    await vitals.clear();
    await vitals.record({ route: "/dashboard", name: "INP", value: 180 });
    await vitals.record({
      route: "/dashboard",
      name: "INP",
      value: 120.4,
      rating: "good",
    });
    await vitals.record({ route: "/dashboard", name: "CLS", value: 0.05 });

    const rows = await dbm.drizzleDb
      .select()
      .from(dbm.drizzleSchema.web_vitals)
      .where(eq(dbm.drizzleSchema.web_vitals.name, "INP"));

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.value).sort((a, b) => a - b)).toEqual([120, 180]);
    expect(await vitals.count("INP")).toBe(2);
    expect(await vitals.count()).toBe(3);
  });

  it("p75 取升序第 ceil(0.75n) 个点，而不是平均值", async () => {
    await vitals.clear();
    // 10 个点：100..190 步长 10 → p50 应在 150 附近、p75 应为 170~180
    for (let i = 0; i < 10; i++) {
      await vitals.record({
        route: "/wrong-book",
        name: "INP",
        value: 100 + i * 10,
      });
    }
    const p75 = await vitals.percentile({ name: "INP", p: 0.75 });
    expect(p75).toHaveLength(1);
    expect(p75[0].route).toBe("/wrong-book");
    expect(p75[0].samples).toBe(10);
    // ceil(0.75 * 10) = 8 → 升序第 8 个（下标 7）
    expect(p75[0].value).toBe(170);

    const p50 = await vitals.percentile({ name: "INP", p: 0.5 });
    // ceil(0.5 * 10) = 5 → 升序第 5 个（下标 4）= 140，即"下中位数"。
    // 偶数样本没有真正的中位数，这里固定取偏低的一侧，避免 p50 在两次统计间跳动。
    expect(p50[0].value).toBe(140);
  });

  it("多路由按 p75 倒序返回，便于直接看最差页", async () => {
    await vitals.clear();
    await vitals.record({ route: "/dashboard", name: "LCP", value: 900 });
    await vitals.record({ route: "/knowledge", name: "LCP", value: 2600 });
    await vitals.record({ route: "/recall", name: "LCP", value: 1500 });

    const rows = await vitals.percentile({ name: "LCP" });
    expect(rows.map((r) => r.route)).toEqual([
      "/knowledge",
      "/recall",
      "/dashboard",
    ]);
  });
});

describe("POST /api/vitals 路由契约", () => {
  it("合法 body 返回 204 并入库", async () => {
    await vitals.clear();
    const res = await vitalsRoute.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "INP",
        value: 210,
        route: "/wrong-book",
        rating: "needs-improvement",
      }),
    });
    expect(res.status).toBe(204);
    expect(await vitals.count("INP")).toBe(1);
  });

  it("未知指标名返回 400，且不写库", async () => {
    await vitals.clear();
    const res = await vitalsRoute.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "FID", value: 1, route: "/dashboard" }),
    });
    expect(res.status).toBe(400);
    expect(await vitals.count()).toBe(0);
  });

  it("缺 route 返回 400", async () => {
    const res = await vitalsRoute.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "INP", value: 100 }),
    });
    expect(res.status).toBe(400);
  });
});
