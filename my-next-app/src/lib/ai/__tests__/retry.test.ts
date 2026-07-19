import { describe, it, expect, vi } from "vitest";
import { withRetry } from "../retry";

// 使用 delay=0 避免 fake timer 时序问题

describe("withRetry", () => {
  it("成功时应直接返回结果", async () => {
    const fn = vi.fn().mockResolvedValue("success");
    const result = await withRetry(fn);
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("第一次失败后重试应成功", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("临时错误"))
      .mockResolvedValue("success");

    const result = await withRetry(fn, 3, 0);

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("超过重试次数应抛出最后一次错误", async () => {
    const err = new Error("持久错误");
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withRetry(fn, 2, 0)).rejects.toThrow("持久错误");
    expect(fn).toHaveBeenCalledTimes(3); // 1 初始 + 2 重试
  });

  it("retries=0 时失败应立即抛出，不重试", async () => {
    const err = new Error("立即失败");
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withRetry(fn, 0)).rejects.toThrow("立即失败");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("4xx 客户端错误（非 429）不应重试", async () => {
    const err = Object.assign(new Error("Bad Request"), { status: 400 });
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withRetry(fn, 3, 0)).rejects.toThrow("Bad Request");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("429 状态码应触发重试", async () => {
    const err = Object.assign(new Error("Rate Limited"), { status: 429 });
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue("ok");

    const result = await withRetry(fn, 2, 0);

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("500 状态码应触发重试", async () => {
    const err = Object.assign(new Error("Server Error"), { status: 500 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValue("recovered");

    const result = await withRetry(fn, 2, 0);

    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("无状态码的网络错误应触发重试", async () => {
    const err = new Error("Network error"); // 无 status 属性
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue("ok");

    const result = await withRetry(fn, 2, 0);

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
