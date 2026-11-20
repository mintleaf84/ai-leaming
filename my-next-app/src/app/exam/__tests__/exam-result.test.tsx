import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryProvider } from "@/lib/providers/QueryProvider";

const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/exam/result/sess-1",
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import ExamResultClient from "../result/[id]/ExamResultClient";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const RESULT_DETAIL = {
  paper: {
    id: 3,
    title: "教综模考 · 11 月",
    kind: "timed",
    durationMinutes: 60,
    source: "auto",
    totalQuestions: 2,
  },
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
    },
  ],
  answers: [
    { questionId: 11, userAnswer: "A" },
    { questionId: 12, userAnswer: "A" },
  ],
  result: {
    score: 0.5,
    correctCount: 1,
    totalQuestions: 2,
    durationMs: 754_000,
    overtimeMs: 0,
    overtime: false,
    duplicate: false,
    perQuestion: [
      {
        questionId: 11,
        isCorrect: true,
        correctAnswer: "A",
        explanation: "赫尔巴特以《普通教育学》奠定科学教育学的基础。",
      },
      {
        questionId: 12,
        isCorrect: false,
        correctAnswer: "A",
        explanation: "「教学相长」出自《学记》。",
      },
    ],
  },
};

describe("成绩单", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("渲染得分、正确率、用时与逐题解析", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(RESULT_DETAIL),
    );

    render(
      <QueryProvider>
        <ExamResultClient sessionId="sess-1" />
      </QueryProvider>,
    );

    expect(await screen.findByText("教综模考 · 11 月")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText(/答对 1 \/ 2 题/)).toBeInTheDocument();
    // 用时在成绩卡与页脚各出现一次
    expect(screen.getAllByText(/用时 12 分 34 秒/).length).toBeGreaterThan(0);
    expect(screen.getByText("按时交卷")).toBeInTheDocument();

    // 逐题：一题答对、一题答错，解析与正确答案都在
    expect(screen.getByText("答对")).toBeInTheDocument();
    expect(screen.getByText("答错")).toBeInTheDocument();
    expect(
      screen.getByText("赫尔巴特以《普通教育学》奠定科学教育学的基础。"),
    ).toBeInTheDocument();
    expect(screen.getByText("「教学相长」出自《学记》。")).toBeInTheDocument();

    // 错题已进错题本：给一个回错题本的入口，提示一句自动入库
    expect(
      screen.getByRole("link", { name: /错题重练（1 题）/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/已自动加入错题本/)).toBeInTheDocument();
  });

  it("还没交卷时不编造成绩，只给出回去继续作答的路", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        ...RESULT_DETAIL,
        result: null,
      }),
    );

    render(
      <QueryProvider>
        <ExamResultClient sessionId="sess-1" />
      </QueryProvider>,
    );

    expect(await screen.findByText("还没交卷")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "继续作答" })).toHaveAttribute(
      "href",
      "/exam/session/sess-1",
    );
  });
});
