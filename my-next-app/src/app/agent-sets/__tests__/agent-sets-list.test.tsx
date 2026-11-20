import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
      jsonResponse({ data: [], meta: { limit: 12, offset: 0, total: 0 } }),
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

  it("按冻结形状 {data,meta} 渲染来源、考点、未做数、最近成绩与新批次角标", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 5,
            title: "教育心理学 · 学习动机强化",
            agent: "claude-code",
            model: "claude-sonnet-4.5",
            targetTags: ["学习动机", "自我效能"],
            questionCount: 10,
            pendingCount: 7,
            unreadCount: 1,
            lastScore: 0.855,
            createdAt: "2026-11-21T02:00:00.000Z",
          },
          {
            id: 4,
            title: "教育法规 · 旧批次",
            agent: null,
            model: null,
            targetTags: [],
            questionCount: 6,
            pendingCount: 0,
            unreadCount: 0,
            lastScore: null,
            createdAt: "2026-11-19T02:00:00.000Z",
          },
        ],
        meta: { limit: 12, offset: 0, total: 2 },
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
    expect(screen.getByText("86 分")).toBeInTheDocument();
    // 新批次角标只出现在 unreadCount > 0 那一张卡上
    expect(screen.getAllByText("新")).toHaveLength(1);
    // 做完了的批次不再喊「未做」
    expect(screen.getByText("都做完了")).toBeInTheDocument();
    // 来源缺失时给可读兜底，而不是空一行
    expect(screen.getByText("来自 来源未标注")).toBeInTheDocument();
  });

  it("按 meta.total 分页，翻页时带 limit/offset 重新取数", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        const offset = Number(new URL(url, "http://x").searchParams.get("offset") ?? 0);
        return jsonResponse({
          data: [
            {
              id: 100 + offset,
              title: `第 ${offset / 12 + 1} 页的批次`,
              questionCount: 5,
              pendingCount: 5,
              unreadCount: 0,
              lastScore: null,
              createdAt: "2026-11-21T02:00:00.000Z",
            },
          ],
          meta: { limit: 12, offset, total: 30 },
        });
      });

    render(
      <QueryProvider>
        <AgentSetsListClient />
      </QueryProvider>,
    );

    expect(await screen.findByText("第 1 页的批次")).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]?.[0]).toContain("limit=12");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("offset=0");

    await user.click(screen.getByRole("button", { name: "2" }));

    expect(await screen.findByText("第 2 页的批次")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes("offset=12"),
        ),
      ).toBe(true);
    });
  });
});
