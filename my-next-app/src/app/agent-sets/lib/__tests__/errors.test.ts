import { describe, expect, it } from "vitest";
import { describeRequestError, readShortfall, serverMessage } from "../errors";

describe("serverMessage", () => {
  it("优先取服务端的 error / message / detail", () => {
    expect(serverMessage({ error: "这题已经反馈过了" })).toBe(
      "这题已经反馈过了",
    );
    expect(serverMessage({ message: " 题集已归档 " })).toBe("题集已归档");
    expect(serverMessage({ detail: "invalid" })).toBe("invalid");
  });

  it("空串、非字符串都算没给", () => {
    expect(serverMessage({ error: "   " })).toBeNull();
    expect(serverMessage({ error: { code: 1 } })).toBeNull();
    expect(serverMessage("oops")).toBeNull();
  });
});

describe("describeRequestError", () => {
  it("有服务端文案时原样使用，不套状态码兜底", () => {
    expect(describeRequestError(409, { error: "这题已经反馈过了" })).toBe(
      "这题已经反馈过了",
    );
  });

  it("没有文案时按状态码给人话", () => {
    expect(describeRequestError(0)).toContain("网络连接失败");
    expect(describeRequestError(401)).toContain("登录状态已失效");
    expect(describeRequestError(403)).toContain("没有权限");
    expect(describeRequestError(404)).toContain("题集不存在");
    expect(describeRequestError(429)).toContain("太频繁");
  });

  it("未知状态码也不把 HTTP 术语抛给用户", () => {
    const message = describeRequestError(500);
    expect(message).toContain("请稍后重试");
    expect(message).not.toContain("Internal");
  });
});

describe("readShortfall", () => {
  it("成卷题量不足的 400 能把 requested / available 读出来", () => {
    expect(readShortfall({ requested: 10, available: 4 })).toEqual({
      requested: 10,
      available: 4,
    });
    expect(readShortfall({ requested: 10 })).toBeNull();
  });
});
