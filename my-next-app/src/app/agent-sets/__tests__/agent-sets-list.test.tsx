import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryProvider } from "@/lib/providers/QueryProvider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/agent-sets",
}));

import AgentSetsListClient from "../AgentSetsListClient";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AI 题集列表", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("真的没有题集时说明题从哪来，而不是只写「暂无数据」", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ items: [], total: 0 }),
    );

    render(
      <QueryProvider>
        <AgentSetsListClient />
      </QueryProvider>,
    );

    expect(await screen.findByText("还没有收到题集")).toBeInTheDocument();
    expect(
      screen.getByText(/外部 Agent 推来的题目会出现在这里/),
    ).toBeInTheDocument();
  });

  it("列表加载失败时呈现错误态，不冒充空态", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ error: "数据库忙" }, 500),
    );

    render(
      <QueryProvider>
        <AgentSetsListClient />
      </QueryProvider>,
    );

    expect(
      await screen.findByText("题集没加载出来", {}, { timeout: 5_000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText("还没有收到题集")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /重试/ })).toBeInTheDocument();
  });

  it("有题集时渲染来源、考点、未做数、最近成绩与新批次角标", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 5,
            title: "教育心理学 · 学习动机强化",
            agent: "claude-code",
            model: "claude-sonnet-4.5",
            targetTags: ["学习动机", "自我效能"],
            totalQuestions: 10,
            doneCount: 2,
            flaggedCount: 1,
            unread: true,
            lastScore: 0.855,
            createdAt: "2026-11-21T02:00:00.000Z",
          },
          {
            id: 4,
            title: "教育法规 · 旧批次",
            totalQuestions: 6,
            doneCount: 6,
            pendingCount: 0,
            unread: false,
          },
        ],
        total: 2,
      }),
    );

    render(
      <QueryProvider>
        <AgentSetsListClient />
      </QueryProvider>,
    );

    expect(
      await screen.findByText("教育心理学 · 学习动机强化"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("来自 Claude Code · claude-sonnet-4.5"),
    ).toBeInTheDocument();
    expect(screen.getByText("学习动机")).toBeInTheDocument();
    expect(screen.getByText("未做 7 题")).toBeInTheDocument();
    expect(screen.getByText("已反馈 1 题")).toBeInTheDocument();
    expect(screen.getByText("86 分")).toBeInTheDocument();
    // 新批次角标只出现在未读那一张卡上
    expect(screen.getAllByText("新")).toHaveLength(1);
    // 做完了的批次不再喊「未做」
    expect(screen.getByText("都做完了")).toBeInTheDocument();
  });
});
