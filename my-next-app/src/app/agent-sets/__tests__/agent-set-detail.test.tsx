import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryProvider } from "@/lib/providers/QueryProvider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/agent-sets/5",
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { toast } from "sonner";
import AgentSetDetailClient from "../[id]/AgentSetDetailClient";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const DETAIL = {
  set: {
    id: 5,
    title: "教育心理学 · 学习动机强化",
    agent: "claude-code",
    model: "claude-sonnet-4.5",
    targetTags: ["学习动机"],
    note: "你最近在「自我效能」上错了 3 次，这批题都围绕它。",
    status: "active",
    createdAt: "2026-11-21T02:00:00.000Z",
    totalQuestions: 3,
    doneCount: 0,
    flaggedCount: 0,
    pendingCount: 3,
    unread: true,
  },
  items: [
    {
      position: 1,
      question: {
        id: 101,
        content: "学生把失败归因于运气，最可能影响的是？",
        options: ["自我效能感", "学习迁移"],
        type: "single",
        dimension: "understanding",
        tags: ["学习动机"],
      },
    },
    {
      position: 2,
      question: {
        id: 102,
        content: "成就动机理论中，追求成功动机强的人倾向于？",
        options: ["选择中等难度任务", "选择极难任务"],
        type: "single",
      },
    },
    {
      position: 3,
      question: {
        id: 103,
        content: "自我效能感的四个来源不包括？",
        options: ["遗传", "替代经验"],
        type: "single",
      },
    },
  ],
};

describe("题集详情", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("报「这题有问题」需要二次确认，成功后该题从列表消失并提示剩余题数", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith("/flag")) {
          return jsonResponse({ remaining: 2 });
        }
        return jsonResponse(DETAIL);
      });

    render(
      <QueryProvider>
        <AgentSetDetailClient setId={5} />
      </QueryProvider>,
    );

    expect(
      await screen.findByText("教育心理学 · 学习动机强化"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("学生把失败归因于运气，最可能影响的是？"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("3 题").length).toBeGreaterThan(0);

    await user.click(
      screen.getByRole("button", { name: "反馈第 1 题有问题" }),
    );

    // 二次确认里把后果讲清楚（移走 + 不计成绩 + 反馈给 Agent）
    expect(await screen.findByText("第 1 题有问题？")).toBeInTheDocument();
    expect(
      screen.getByText(/会从本批移走，也不会算进你的成绩/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /反馈给 Agent/ }));

    await waitFor(() => {
      expect(
        screen.queryByText("学生把失败归因于运气，最可能影响的是？"),
      ).not.toBeInTheDocument();
    });
    expect(toast.success).toHaveBeenCalledWith(
      "已反馈给 Agent，本批剩余 2 题",
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith("/agent-sets/5/questions/101/flag"),
      ),
    ).toBe(true);
    // 剩余统计同步更新：未做 2 题、已反馈 1 题
    expect(screen.getAllByText("2 题").length).toBeGreaterThan(0);
    expect(screen.getByText("已反馈")).toBeInTheDocument();
  });

  it("开始练习后逐题判分：点选项立即出对错，可进入下一题", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/attempts")) {
        return jsonResponse({ sessionId: "session-1" });
      }
      if (url.endsWith("/session/session-1/submit")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          questionId: number;
        };
        return jsonResponse({ isCorrect: body.questionId === 101 });
      }
      return jsonResponse(DETAIL);
    });

    render(
      <QueryProvider>
        <AgentSetDetailClient setId={5} />
      </QueryProvider>,
    );

    await user.click(
      await screen.findByRole("button", { name: /开始练习（3 题）/ }),
    );

    const options = await screen.findAllByTestId("exam-option");
    await user.click(options[0]);

    expect(await screen.findByText("回答正确")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /下一题/ }));

    expect(
      await screen.findByText("成就动机理论中，追求成功动机强的人倾向于？"),
    ).toBeInTheDocument();
  });
});
