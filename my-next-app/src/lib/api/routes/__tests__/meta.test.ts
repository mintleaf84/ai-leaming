// @vitest-environment node
/**
 * `GET /api/meta` —— 公开契约协商端点。
 *
 * 本端点不碰数据库、不碰鉴权，所以这里不需要真库 harness：要验证的恰恰是
 * **它在什么都没有的情况下也能用**（无 token、无 env 配置）。四个断言分别对应
 * 客户端真正依赖的四件事：能匿名拿到、版本可比、能力表可用、下载地址语义明确。
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { Hono } from "hono";

import metaApp from "../meta";

/** 与生产挂载点一致（`app.route("/meta", metaRoute)` + basePath `/api`） */
const API_PREFIX = "/api/meta";

function createRootApp() {
  const root = new Hono();
  root.route(API_PREFIX, metaApp);
  return root;
}

interface MetaBody {
  contractVersion: number;
  minClientVersion: string;
  latestClientVersion: string;
  downloadUrl: string | null;
  features: string[];
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/meta", () => {
  it("不带 Authorization 也是 200（协商必须在登录前可用）", async () => {
    vi.stubEnv("MOBILE_APK_URL", "");
    const res = await createRootApp().request(API_PREFIX, { method: "GET" });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("contractVersion 是正整数且 ≥ 1", async () => {
    const res = await createRootApp().request(API_PREFIX);
    const body = (await res.json()) as MetaBody;

    expect(Number.isInteger(body.contractVersion)).toBe(true);
    expect(body.contractVersion).toBeGreaterThanOrEqual(1);
    // 版本元数据必须是非空 semver 字符串，客户端要拿来做比较
    expect(body.minClientVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(body.latestClientVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("features 无重复、每项非空、包含 recall", async () => {
    const res = await createRootApp().request(API_PREFIX);
    const body = (await res.json()) as MetaBody;

    expect(Array.isArray(body.features)).toBe(true);
    expect(body.features.length).toBeGreaterThan(0);
    for (const feature of body.features) {
      expect(typeof feature).toBe("string");
      expect(feature.trim().length).toBeGreaterThan(0);
    }
    expect(new Set(body.features).size).toBe(body.features.length);
    expect(body.features).toContain("recall");
  });

  it("MOBILE_APK_URL 为空时 downloadUrl 是 null（不是空字符串）", async () => {
    vi.stubEnv("MOBILE_APK_URL", "");
    const emptyRes = await createRootApp().request(API_PREFIX);
    const emptyBody = (await emptyRes.json()) as MetaBody;

    expect(emptyBody.downloadUrl).toBeNull();

    // 只清空 env 还不够：必须确认它在有值时确实透传，否则「恒为 null」也能过上一行
    vi.stubEnv("MOBILE_APK_URL", "https://example.test/app-release.apk");
    const filledRes = await createRootApp().request(API_PREFIX);
    const filledBody = (await filledRes.json()) as MetaBody;

    expect(filledBody.downloadUrl).toBe("https://example.test/app-release.apk");
  });

  it("响应头带 Cache-Control: no-store", async () => {
    const res = await createRootApp().request(API_PREFIX);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
});
