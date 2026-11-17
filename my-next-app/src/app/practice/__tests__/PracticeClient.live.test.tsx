/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { PracticeState } from "@/types";

/**
 * §3.7（批次 B4）：答题后整屏换成下一题，视觉上够明显，但屏读/键盘用户
 * 既不知道"题变了"，也听不到对错（对错只在一次性 toast 里）。
 *
 * 这里验证两点，且都从**用户可感知的结果**断言：
 *   1. 切题后焦点真的落在题干上（`document.activeElement` 是 h2）；
 *   2. sr-only 的 `role="status"` 文本变成整句"回答正确/错误 + 第 N 题，共 M 题"。
 *
 * 依赖边界：mock 的是 `use-practice-controller`（客户端数据/动作边界），
 * 真实的 `PracticeCard` 参与渲染 —— 焦点落点必须落在真实题干节点上才算数。
 */

const holder = vi.hoisted(() => ({
  state: null as unknown as PracticeState,
}));

vi.mock("../hooks/use-practice-controller", () => ({
  usePracticeController: () => ({
    state: holder.state,
    isLoadingAI: false,
    showExitConfirm: false,
    selectedOptions: [],
    timerConfig: { enabled: false, mode: "count_up", secondsPerQuestion: 90 },
    actions: {
      handleExit: vi.fn(),
      confirmExit: vi.fn(),
      cancelExit: vi.fn(),
      handleOptionClick: vi.fn(),
      submitMultiChoice: vi.fn(),
      submitAnswer: vi.fn(),
      handleReviewStep: vi.fn(),
      dispatch: vi.fn(),
    },
  }),
}));

// 切题动画与浮层与本用例无关，替换成轻量桩，避免无关依赖干扰焦点断言
vi.mock("@/components/practice/HeaderProgressBar", () => ({
  HeaderProgressBar: () => <div data-testid="header-progress" />,
}));
vi.mock("@/components/practice/ExitConfirmModal", () => ({
  ExitConfirmModal: () => null,
}));
vi.mock("@/components/practice/FinishedCard", () => ({
  FinishedCard: () => <div>练习完成</div>,
}));
vi.mock("@/components/practice/ReviewCard", () => ({
  ReviewCard: () => <div data-testid="review-card" />,
}));

import PracticeClient from "../PracticeClient";

function makeQuestion(id: number, content: string) {
  return {
    id,
    content,
    answer: "A",
    options: ["选项一", "选项二"],
    type: "single",
    dimension: "knowledge",
  };
}

function makeState(overrides: Partial<PracticeState> = {}): PracticeState {
  return {
    status: "practicing",
    sessionId: "session-1",
    sessionQueue: [
      makeQuestion(101, "第一题：教育学的定义是什么？"),
      makeQuestion(102, "第二题：认知发展理论由谁提出？"),
    ],
    currentIndex: 0,
    startTime: 0,
    sessionStartTime: 0,
    accumulatedTime: 0,
    answers: {},
    reviewQueue: [],
    currentReviewIndex: 0,
    reviewTriggeredAt: 25,
    ...overrides,
  } as PracticeState;
}

describe("练习页切题的播报与焦点（§3.7）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("首题加载不抢焦点；播报只有定位信息（不含对错）", () => {
    holder.state = makeState();
    render(<PracticeClient initialEnableIntelligentReview={false} />);

    expect(screen.getByRole("status")).toHaveTextContent("第 1 题，共 2 题。");
    expect(screen.getByRole("status")).not.toHaveTextContent("回答正确");
    expect(screen.getByRole("status")).not.toHaveTextContent("回答错误");
    // 焦点不动：用户可能已经在别处操作
    expect(document.activeElement).toBe(document.body);
  });

  it("答对后切题：焦点落到新题干，并播报「回答正确 + 第 2 题，共 2 题」", async () => {
    holder.state = makeState();
    const { rerender } = render(
      <PracticeClient initialEnableIntelligentReview={false} />,
    );

    // 模拟 reducer 推进：index 0 → 1，且第 101 题答对
    holder.state = makeState({
      currentIndex: 1,
      answers: { 101: { answer: "A", isCorrect: true, duration: 1200 } },
    });
    rerender(<PracticeClient initialEnableIntelligentReview={false} />);

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { level: 2 }),
      );
    });
    expect(document.activeElement).toHaveTextContent(
      "第二题：认知发展理论由谁提出？",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "回答正确。第 2 题，共 2 题。",
    );
  });

  it("答错后切题：播报整句「回答错误」，不是只播一个数字", async () => {
    holder.state = makeState();
    const { rerender } = render(
      <PracticeClient initialEnableIntelligentReview={false} />,
    );

    holder.state = makeState({
      currentIndex: 1,
      answers: { 101: { answer: "B", isCorrect: false, duration: 800 } },
    });
    rerender(<PracticeClient initialEnableIntelligentReview={false} />);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "回答错误。第 2 题，共 2 题。",
      );
    });
  });

  it("练习结束时播报结束语", async () => {
    holder.state = makeState({ currentIndex: 1 });
    const { rerender } = render(
      <PracticeClient initialEnableIntelligentReview={false} />,
    );

    holder.state = makeState({
      status: "finished",
      currentIndex: 1,
      answers: {
        101: { answer: "A", isCorrect: true, duration: 1 },
        102: { answer: "A", isCorrect: true, duration: 1 },
      },
    });
    rerender(<PracticeClient initialEnableIntelligentReview={false} />);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("本组练习已结束");
    });
  });

  it("role=status 只有一个，避免同屏多路播报", () => {
    holder.state = makeState({ currentIndex: 1 });
    render(<PracticeClient initialEnableIntelligentReview={false} />);

    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});
