/**
 * api-client 单元测试
 * 测试自动重试、指数退避和错误处理机制。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWithRetry, fetchJson, ApiError, apiClient } from "../api-client";

// 用 vi.stubGlobal 代替 vi.fn() 来 mock 全局 fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("ApiError", () => {
  it("应携带 status 和 statusText", () => {
    const error = new ApiError(404, "Not Found");
    expect(error.status).toBe(404);
    expect(error.statusText).toBe("Not Found");
    expect(error.message).toBe("API Error: 404 Not Found");
    expect(error.name).toBe("ApiError");
  });

  it("应支持自定义 message", () => {
    const error = new ApiError(500, "Internal Server Error", "服务器故障");
    expect(error.message).toBe("服务器故障");
  });
});

describe("fetchWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("成功请求应直接返回响应", async () => {
    mockFetch.mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const res = await fetchWithRetry("/api/test", { retries: 0 });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("4xx 错误不应触发重试", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("bad", { status: 400, statusText: "Bad Request" }),
    );

    const res = await fetchWithRetry("/api/test", { retries: 3 });
    // 400 不会被抛出，而是直接返回
    expect(res.status).toBe(400);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("5xx 错误应自动重试并最终抛出", async () => {
    mockFetch.mockResolvedValue(
      new Response("error", {
        status: 500,
        statusText: "Internal Server Error",
      }),
    );

    await expect(
      fetchWithRetry("/api/test", { retries: 2, backoffFactor: 10 }),
    ).rejects.toThrow(ApiError);

    // 1 次初始请求 + 2 次重试 = 3 次
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("429 错误应触发重试", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response("rate limit", {
          status: 429,
          statusText: "Too Many Requests",
        }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const res = await fetchWithRetry("/api/test", {
      retries: 1,
      backoffFactor: 10,
    });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("网络错误应自动重试", async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const res = await fetchWithRetry("/api/test", {
      retries: 1,
      backoffFactor: 10,
    });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("重试次数为 0 时应直接抛出", async () => {
    mockFetch.mockResolvedValue(
      new Response("error", { status: 500, statusText: "ISE" }),
    );

    await expect(fetchWithRetry("/api/test", { retries: 0 })).rejects.toThrow(
      ApiError,
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("fetchJson", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("成功时应返回解析后的 JSON", async () => {
    const data = { name: "测试数据" };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await fetchJson("/api/test", { retries: 0 });
    expect(result).toEqual(data);
  });

  it("非 2xx 响应应抛出 ApiError", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("not found", { status: 404, statusText: "Not Found" }),
    );

    await expect(fetchJson("/api/test", { retries: 0 })).rejects.toThrow(
      ApiError,
    );
  });
});

describe("apiClient", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("get 应使用 GET 方法", async () => {
    mockFetch.mockResolvedValueOnce(new Response("ok", { status: 200 }));
    await apiClient.get("/api/test");
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: "GET" });
  });

  it("post 应使用 POST 方法并序列化 body", async () => {
    mockFetch.mockResolvedValueOnce(new Response("ok", { status: 200 }));
    await apiClient.post("/api/test", { key: "value" });
    expect(mockFetch.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ key: "value" }),
    });
  });

  it("put 应使用 PUT 方法", async () => {
    mockFetch.mockResolvedValueOnce(new Response("ok", { status: 200 }));
    await apiClient.put("/api/test", { key: "value" });
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: "PUT" });
  });

  it("delete 应使用 DELETE 方法", async () => {
    mockFetch.mockResolvedValueOnce(new Response("ok", { status: 200 }));
    await apiClient.delete("/api/test");
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: "DELETE" });
  });
});
