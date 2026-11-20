import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryProvider } from "@/lib/providers/QueryProvider";

const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/exam",
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import ExamListClient from "../ExamListClient";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("试卷列表", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("真的没有试卷时给出空态与两个组卷入口", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ items: [], total: 0 }),
    );

    render(
      <QueryProvider>
        <ExamListClient />
      </QueryProvider>,
    );

    expect(await screen.findByText("还没有试卷")).toBeInTheDocument();
    // 头部与空态各一个「自动组卷」，两处都能直接开始
    expect(
      screen.getAllByRole("button", { name: /自动组卷/ }).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.getAllByRole("button", { name: /手工组卷/ }).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("列表加载失败时呈现错误态与重试，而不是空态", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ error: "数据库忙" }, 500),
    );

    render(
      <QueryProvider>
        <ExamListClient />
      </QueryProvider>,
    );

    expect(
      await screen.findByText("试卷列表没加载出来", {}, { timeout: 5_000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText("还没有试卷")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /重试/ })).toBeInTheDocument();
  });

  it("有试卷时渲染题量、限时与最近成绩", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 7,
            title: "教育心理学 · 第四次模考",
            kind: "timed",
            durationMinutes: 60,
            source: "auto",
            totalQuestions: 40,
            attemptCount: 2,
            bestScore: 0.855,
            lastAttemptAt: "2026-11-19T10:00:00.000Z",
          },
        ],
        total: 1,
      }),
    );

    render(
      <QueryProvider>
        <ExamListClient />
      </QueryProvider>,
    );

    expect(
      await screen.findByText("教育心理学 · 第四次模考"),
    ).toBeInTheDocument();
    expect(screen.getByText("40 题")).toBeInTheDocument();
    expect(screen.getByText("限时 60 分钟")).toBeInTheDocument();
    expect(screen.getByText("最好 86 分")).toBeInTheDocument();
    expect(screen.queryByText("还没有试卷")).not.toBeInTheDocument();
  });
});
