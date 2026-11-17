/** @vitest-environment jsdom */
import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import _React from "react";

// --- vi.hoisted for stable references across mocks ---
const { mockDispatch, mockState, mockRouter } = vi.hoisted(() => ({
  mockDispatch: vi.fn(),
  mockRouter: { push: vi.fn() },
  mockState: {
    status: "practicing",
    sessionQueue: [
      {
        id: 1,
        type: "single",
        content: "Q1",
        answer: "A",
        options: ["A", "B"],
      },
    ],
    currentIndex: 0,
    sessionId: "session-123",
    answers: {},
    reviewQueue: [],
    currentReviewIndex: 0,
    startTime: Date.now(),
  },
}));

// 1. Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => ({ get: vi.fn().mockReturnValue(null) }),
}));

// 2. Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

// 3. Mock Server Actions
vi.mock("@/server/actions/practice", () => ({
  getPracticeSessionAction: vi
    .fn()
    .mockResolvedValue({ questions: [], sessionId: null }),
  getPracticeSessionByConfigAction: vi.fn(),
  // 真实形状：next-safe-action 包一层 { data }，失败可能是 reject 或 data.success === false
  submitAnswerAction: vi
    .fn()
    .mockResolvedValue({ data: { success: true, srs: undefined } }),
  getSessionByIdAction: vi.fn(),
}));

vi.mock("@/server/actions/zone", () => ({
  moveToObservationZoneAction: vi.fn().mockResolvedValue({ success: true }),
}));

// 4. Mock Practice Engine - USE ALIAS TO MATCH SOURCE
vi.mock("@/hooks/use-practice-engine", () => ({
  usePracticeEngine: () => ({ state: mockState, dispatch: mockDispatch }),
}));

// 5. Mock sibling hooks
vi.mock("../use-review-generation", () => ({
  useReviewGeneration: () => ({ isLoadingAI: false }),
}));
vi.mock("../use-keyboard-shortcuts", () => ({
  useKeyboardShortcuts: vi.fn(),
}));

// --- Import the hook under test ---
import { usePracticeController } from "../use-practice-controller";
import { submitAnswerAction } from "@/server/actions/practice";
import { toast } from "sonner";
import { State } from "ts-fsrs";

type SubmitAnswerOptions = {
  description?: string;
  action?: { label: string; onClick: () => void };
};

const SAVE_ERROR_TITLE = "答题记录未保存";

const saveErrorCalls = () =>
  vi.mocked(toast.error).mock.calls.filter(
    (call) => call[0] === SAVE_ERROR_TITLE,
  );

const lastSaveErrorOptions = (): SubmitAnswerOptions | undefined => {
  const call = saveErrorCalls().at(-1);
  return call?.[1] as unknown as SubmitAnswerOptions | undefined;
};

describe("usePracticeController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // multi-choice 用例会改写 queue[0]，这里复位，保证每个用例起点一致
    mockState.sessionQueue[0] = {
      id: 1,
      type: "single",
      content: "Q1",
      answer: "A",
      options: ["A", "B"],
    };
    mockState.currentIndex = 0;
    mockState.startTime = Date.now();
  });

  it("should dispatch ANSWER_QUESTION with isCorrect: false for wrong answer", async () => {
    const { result } = renderHook(() => usePracticeController());

    act(() => {
      result.current.actions.handleOptionClick("B", "single"); // Wrong answer (A is correct)
    });

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "ANSWER_QUESTION",
          payload: expect.objectContaining({
            isCorrect: false,
          }),
        }),
      );
    });
  });

  it("should handle multiple choice clicks and submission", async () => {
    // Change mock state to a multi-choice question
    mockState.sessionQueue[0] = {
      id: 2,
      type: "multi",
      content: "Q2",
      answer: JSON.stringify(["A", "B"]),
      options: ["Option A", "Option B", "Option C"],
    };

    const { result } = renderHook(() => usePracticeController());

    act(() => {
      result.current.actions.handleOptionClick("Option A", "multi");
      result.current.actions.handleOptionClick("Option B", "multi");
    });

    expect(result.current.selectedOptions).toEqual(["Option A", "Option B"]);

    act(() => {
      result.current.actions.submitMultiChoice();
    });

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "ANSWER_QUESTION",
          payload: expect.objectContaining({
            // isCorrect logic should handle text -> label or JSON match
            isCorrect: true,
          }),
        }),
      );
    });
  });

  it("should handle exit confirmation", () => {
    const { result } = renderHook(() => usePracticeController());

    act(() => {
      result.current.actions.handleExit();
    });
    expect(result.current.showExitConfirm).toBe(true);

    act(() => {
      result.current.actions.confirmExit();
    });
    expect(mockRouter.push).toHaveBeenCalledWith("/");
  });

  // --- 写库失败必须可见且可重试（docs/ux-a11y-audit.md §3.5 P1）---
  describe("submit answer persistence failure", () => {
    const submit = vi.mocked(submitAnswerAction);

    beforeEach(() => {
      // mockClear 不会清 Once 队列，残留会让后续用例拿到上一条的返回值
      submit.mockReset();
      submit.mockResolvedValue({ data: { success: true, srs: undefined } });
    });

    const answerOnce = async (
      result: { current: ReturnType<typeof usePracticeController> },
    ) => {
      act(() => {
        result.current.actions.handleOptionClick("A", "single");
      });
      await waitFor(() => expect(submit).toHaveBeenCalled());
    };

    it("should surface a retryable error when the action rejects", async () => {
      submit.mockRejectedValueOnce(new Error("network down"));
      const { result } = renderHook(() => usePracticeController());

      await answerOnce(result);

      await waitFor(() => expect(saveErrorCalls()).toHaveLength(1));
      const options = lastSaveErrorOptions();
      expect(options?.description).toContain("答案未保存");
      expect(options?.description).toContain("network down");
      expect(options?.action?.label).toBe("重试");
      expect(typeof options?.action?.onClick).toBe("function");
    });

    it("should surface a retryable error when the action resolves {success:false}", async () => {
      submit.mockResolvedValueOnce({ data: { success: false, srs: undefined } });
      const { result } = renderHook(() => usePracticeController());

      await answerOnce(result);

      await waitFor(() => expect(saveErrorCalls()).toHaveLength(1));
      const options = lastSaveErrorOptions();
      expect(options?.description).toContain("服务端未确认写入");
      expect(options?.description).toContain("答案未保存");
      expect(options?.action?.label).toBe("重试");
      expect(toast.success).not.toHaveBeenCalled();
    });

    it("should resend the exact same payload when the retry action is used", async () => {
      submit
        .mockRejectedValueOnce(new Error("network down"))
        .mockResolvedValueOnce({ data: { success: true, srs: undefined } });
      const { result } = renderHook(() => usePracticeController());

      await answerOnce(result);
      await waitFor(() => expect(saveErrorCalls()).toHaveLength(1));

      const retry = lastSaveErrorOptions()?.action?.onClick;
      expect(retry).toBeTypeOf("function");

      await act(async () => {
        retry?.();
      });

      await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
      expect(submit.mock.calls[1][0]).toEqual(submit.mock.calls[0][0]);
      expect(submit.mock.calls[1][0]).toMatchObject({
        questionId: 1,
        userAnswer: "A",
        isCorrect: true,
        sessionId: "session-123",
      });
      // 重试成功后不再追加错误提示
      expect(saveErrorCalls()).toHaveLength(1);
    });

    it("should not show an error toast on the success path", async () => {
      submit.mockResolvedValueOnce({
        data: {
          success: true,
          srs: {
            stability: 2.5,
            difficulty: 5,
            due_date: new Date().toISOString(),
            state: State.Review,
            nextInterval: 3,
          },
        },
      });
      const { result } = renderHook(() => usePracticeController());

      await answerOnce(result);

      await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
      expect(saveErrorCalls()).toHaveLength(0);
      expect(toast.success).toHaveBeenCalledWith(
        "回答正确！",
        expect.objectContaining({ description: expect.stringContaining("3 天后") }),
      );
    });
  });
});
