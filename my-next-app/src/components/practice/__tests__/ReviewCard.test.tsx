import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ReviewCard } from "../ReviewCard";

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => (
      <button {...props}>{children}</button>
    ),
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const mockQuestion = {
  id: 101,
  content: "什么是 React Hook?",
  options: ["一种钩子", "一种函数", "一种状态", "一种模式"],
  type: "single" as const,
  answer: "B",
  explanation:
    "React Hook 是在函数组件中“钩入” React 状态及生命周期等特性的函数。",
  dimension: "knowledge",
  tags: ["基础", "Hook"],
};

const mockCurrentItemBase = {
  originalQuestionId: 101,
  originalQuestionContent: "什么是 React Hook?",
  currentStep: "study" as const,
  wrongAnswer: "A",
  tags: ["基础", "Hook"],
  regressionSubIndex: 0,
  failedAttempts: 0,
};

describe("ReviewCard Component", () => {
  const mockOnReviewStep = vi.fn();

  beforeEach(() => {
    mockOnReviewStep.mockClear();
  });

  it("renders loading state correctly", () => {
    render(
      <ReviewCard
        currentItem={mockCurrentItemBase}
        sessionQueue={[mockQuestion]}
        isLoadingAI={true}
        onReviewStep={mockOnReviewStep}
      />,
    );
    expect(screen.getByText("AI 正在生成专属复盘内容...")).toBeInTheDocument();
  });

  it("renders study mode correctly", () => {
    render(
      <ReviewCard
        currentItem={mockCurrentItemBase}
        sessionQueue={[mockQuestion]}
        isLoadingAI={false}
        onReviewStep={mockOnReviewStep}
      />,
    );

    expect(screen.getByText("智能复盘模式")).toBeInTheDocument();
    expect(screen.getByText("什么是 React Hook?")).toBeInTheDocument();
    expect(screen.getByText(mockQuestion.explanation)).toBeInTheDocument();

    // Check user answer and correct answer display
    expect(screen.getByText("您的选择")).toBeInTheDocument();
    expect(screen.getByText("正确答案")).toBeInTheDocument();

    // Test buttons
    const masterBtn = screen.getByText("我已掌握，开始测试");
    const retryBtn = screen.getByText("没看懂，再试一次");

    fireEvent.click(masterBtn);
    expect(mockOnReviewStep).toHaveBeenCalledWith(true);

    fireEvent.click(retryBtn);
    expect(mockOnReviewStep).toHaveBeenCalledWith(false);
  });

  it("renders quiz mode correctly", () => {
    const quizItem = {
      ...mockCurrentItemBase,
      currentStep: "quiz" as const,
      quiz: {
        analysis: "你可能混淆了 Hook 的概念",
        distinctionPoint: "Hook 与普通函数的区别",
        quiz: {
          content: "Hook 只能在什么组件中使用？",
          options: ["函数组件", "类组件", "两者皆可"],
          answer: "函数组件",
          explanation: "Hook 只能在 React 函数组件或自定义 Hook 中调用。",
        },
      },
    };

    render(
      <ReviewCard
        currentItem={quizItem}
        sessionQueue={[mockQuestion]}
        isLoadingAI={false}
        onReviewStep={mockOnReviewStep}
      />,
    );

    expect(screen.getByText("纠偏找茬题")).toBeInTheDocument();
    expect(screen.getByText("你可能混淆了 Hook 的概念")).toBeInTheDocument();
    expect(screen.getByText("Hook 只能在什么组件中使用？")).toBeInTheDocument();

    // Click correct option
    fireEvent.click(screen.getByText("函数组件"));
    expect(mockOnReviewStep).toHaveBeenCalledWith(true);

    // Click wrong option
    fireEvent.click(screen.getByText("类组件"));
    expect(mockOnReviewStep).toHaveBeenLastCalledWith(false);
  });

  it("renders regression mode correctly", () => {
    const regressionItem = {
      ...mockCurrentItemBase,
      currentStep: "regression" as const,
      regression: {
        logicType: "reverse" as const,
        challenges: [
          {
            content: "下列哪个不属于 Hook？",
            options: ["useState", "useEffect", "useAction"],
            answer: "useAction",
            explanation: "useAction 并非官方 Hook。",
          },
          {
            content: "Regression 2",
            options: ["A", "B"],
            answer: "A",
            explanation: "Exp",
          },
          {
            content: "Regression 3",
            options: ["A", "B"],
            answer: "A",
            explanation: "Exp",
          },
        ],
      },
      regressionSubIndex: 0,
    };

    render(
      <ReviewCard
        currentItem={regressionItem}
        sessionQueue={[mockQuestion]}
        isLoadingAI={false}
        onReviewStep={mockOnReviewStep}
      />,
    );

    expect(screen.getByText(/回归挑战 \(1\/3\)/)).toBeInTheDocument();
    expect(screen.getByText("挑战类型: 逆向逻辑")).toBeInTheDocument();
    expect(screen.getByText("下列哪个不属于 Hook？")).toBeInTheDocument();

    fireEvent.click(screen.getByText("useAction"));
    expect(mockOnReviewStep).toHaveBeenCalledWith(true);
  });
});
