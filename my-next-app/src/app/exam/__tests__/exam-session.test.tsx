import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryProvider } from "@/lib/providers/QueryProvider";

const { mockReplace, mockPush } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: vi.fn(),
  }),
  usePathname: () => "/exam/session/sess-1",
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import ExamSessionClient from "../session/[id]/ExamSessionClient";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const ATTEMPT = {
  paper: {
    id: 3,
    title: "教综模考 · 11 月",
    kind: "timed",
    durationMinutes: 60,
    source: "auto",
    totalQuestions: 2,
  },
  deadlineAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  questions: [
    {
      id: 11,
      content: "被称为「现代教育学之父」的是谁？",
      options: ["赫尔巴特", "杜威"],
      type: "single",
    },
    {
      id: 12,
      content: "「教学相长」出自哪部典籍？",
      options: ["学记", "论语"],
      type: "single",
      // 未交卷时服务端会把答案置空，这里也模拟空值，确保页面不依赖 answer
      answer: null,
    },
  ],
};

const SUBMIT_RESULT = {
  score: 1,
  correctCount: 1,
  totalQuestions: 2,
  durationMs: 30_000,
  overtimeMs: 0,
  overtime: false,
  duplicate: false,
  perQuestion: [{ questionId: 11, isCorrect: true, correctAnswer: "A" }],
};

interface CapturedSubmit {
  answers: { questionId: number; userAnswer: string; durationMs: number }[];
  clientKey: string;
}

describe("作答页", () => {
  const submitCalls: CapturedSubmit[] = [];

  beforeEach(() => {
    window.sessionStorage.clear();
    submitCalls.length = 0;
    mockReplace.mockClear();
    mockPush.mockClear();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/submit")) {
        submitCalls.push(
          JSON.parse(String(init?.body ?? "{}")) as CapturedSubmit,
        );
        return jsonResponse(SUBMIT_RESULT);
      }
      if (url.includes("/api/exam/attempts/")) {
        return jsonResponse(ATTEMPT);
      }
      return jsonResponse({ error: "not found" }, 404);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("答一题后答题卡计数变化，交卷前提示未作答题数，并且只提交答过的题", async () => {
    render(
      <QueryProvider>
        <ExamSessionClient sessionId="sess-1" />
      </QueryProvider>,
    );

    expect(
      await screen.findByText("被称为「现代教育学之父」的是谁？"),
    ).toBeInTheDocument();
    // 倒计时以服务端 deadline 为准，此刻应显示 10 分钟内的剩余时间
    expect(screen.getByRole("timer")).toBeInTheDocument();
    expect(screen.getByText("已答 0 · 未答 2")).toBeInTheDocument();

    // 选第一题的第一个选项：只记草稿，不判分、不切题
    fireEvent.click(screen.getAllByTestId("exam-option")[0]);
    await waitFor(() =>
      expect(screen.getByText("已答 1 · 未答 1")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("被称为「现代教育学之父」的是谁？"),
    ).toBeInTheDocument();

    // 下一页：第二个「下一题」是移动端底栏的，桌面端在前
    fireEvent.click(screen.getAllByRole("button", { name: "下一题" })[0]);
    await waitFor(() =>
      expect(
        screen.getByText("「教学相长」出自哪部典籍？"),
      ).toBeInTheDocument(),
    );

    // 还有 1 题没作答 → 必须先确认
    fireEvent.click(screen.getAllByRole("button", { name: "交卷" })[0]);
    expect(await screen.findByText("交卷确认")).toBeInTheDocument();
    expect(screen.getByText(/还有 1 题没作答/)).toBeInTheDocument();
    expect(submitCalls).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "确定交卷" }));

    await waitFor(() => expect(submitCalls).toHaveLength(1));
    expect(submitCalls[0].answers).toHaveLength(1);
    expect(submitCalls[0].answers[0].questionId).toBe(11);
    expect(submitCalls[0].answers[0].userAnswer).toBe("A");
    expect(submitCalls[0].clientKey).toBeTruthy();
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/exam/result/sess-1"),
    );
  });

  it("刷新后从本地草稿恢复选择，交卷时不会再弹确认", async () => {
    window.sessionStorage.setItem(
      "exam-draft:sess-1",
      JSON.stringify({
        11: { kind: "choice", letters: ["B"] },
        12: { kind: "choice", letters: ["A"] },
      }),
    );

    render(
      <QueryProvider>
        <ExamSessionClient sessionId="sess-1" />
      </QueryProvider>,
    );

    expect(
      await screen.findByText("被称为「现代教育学之父」的是谁？"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("已答 2 · 未答 0")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "交卷" })[0]);
    expect(screen.queryByText("交卷确认")).not.toBeInTheDocument();

    await waitFor(() => expect(submitCalls).toHaveLength(1));
    expect(submitCalls[0].answers.map((item) => item.userAnswer)).toEqual([
      "B",
      "A",
    ]);
  });
});
