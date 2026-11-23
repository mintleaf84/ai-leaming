// @vitest-environment node
/**
 * `toErrorResponse` 的**留痕**约定。
 *
 * 对拍测试守的是对外契约（status / body），这里守的是对内可观测性：已归类的
 * 业务错误也必须落一行日志，否则线上只有 502/4xx 的数字、看不到是哪个 code。
 * 同时反向守住「只记元数据」——publicMessage 与原始对象可能含用户输入，不进日志。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Context } from "hono";
import { logger } from "@/lib/logger";
import { NotFoundError, ValidationError } from "../app-error";
import { toErrorResponse } from "../../api/error-response";

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const mockedWarn = vi.mocked(logger.warn);

function fakeContext() {
  return {
    json: vi.fn((body: unknown, status: number) => ({ body, status })),
  } as unknown as Context;
}

describe("toErrorResponse 对已归类业务错误留痕", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("记一次 warn：只含 code / status / scope，不含对外文案", () => {
    const error = new NotFoundError("内部诊断：卡片 card-7 不存在", {
      code: "recall.card.not-found",
    });
    const c = fakeContext();

    toErrorResponse(c, error, { scope: "test.scope" });

    expect(mockedWarn).toHaveBeenCalledTimes(1);
    const [payload, message] = mockedWarn.mock.calls[0] as [
      Record<string, unknown>,
      string,
    ];
    expect(message).toBe("[API] 业务错误");
    expect(payload.code).toBe("recall.card.not-found");
    expect(payload.status).toBe(404);
    expect(payload.scope).toBe("test.scope");
    expect(payload.issueCount).toBe(0);
    // 用户可见文案与原始对象都不进日志
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("card-7");
    expect(serialized).not.toContain("内部诊断");
  });

  it("校验错误的 issueCount 如实上报（只记条数，不记明细）", () => {
    const error = new ValidationError("bad", {
      code: "recall.deck.invalid",
      issues: ["cards[0]: bad", "cards[1]: bad"],
    });

    toErrorResponse(fakeContext(), error, { scope: "test.scope" });

    expect(mockedWarn).toHaveBeenCalledTimes(1);
    const [payload] = mockedWarn.mock.calls[0] as [Record<string, unknown>];
    expect(payload.code).toBe("recall.deck.invalid");
    expect(payload.status).toBe(400);
    expect(payload.issueCount).toBe(2);
    expect(JSON.stringify(payload)).not.toContain("cards[0]");
  });
});
