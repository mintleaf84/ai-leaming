import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 状态机单测（`useRecallSession`）。
 *
 * 这里盯的是**语义**，不是渲染：五个在 E2E / 其它单测里被当作契约的行为——
 * 1. 重测只呈现 `pendingItems`，改判下标用**卡内下标**；
 * 2.「全没想起」成功后 `finalVerdicts` 与 `preview.verdicts` 全置 `miss`；
 * 3. 提交失败锁判定，重试沿用同一 `clientKey` 与同一份载荷；
 * 4. 全对不自动进下一张（`nextReviewText` 必须先被看到）；
 * 5. 换卡/全做完的推进仍由 `advance()` 负责。
 */

const {
  mockFetchQueue,
  mockFetchCard,
  mockSubmit,
  mockArchive,
  mockToastError,
  mockToastSuccess,
} = vi.hoisted(() => ({
  mockFetchQueue: vi.fn(),
  mockFetchCard: vi.fn(),
  mockSubmit: vi.fn(),
  mockArchive: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

// 只替换 IO 适配层：actionErrorMessage 是纯函数，这里给等价的最简实现，
// 免得把真实模块里的 `@/server/actions/recall`（会拉 DB/环境校验）带进 jsdom
vi.mock("../../lib/actions", () => ({
  fetchRecallQueue: mockFetchQueue,
  fetchRecallCard: mockFetchCard,
  submitRecall: mockSubmit,
  archiveRecallCard: mockArchive,
  actionErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));

vi.mock("sonner", () => ({
  toast: { error: mockToastError, success: mockToastSuccess },
}));

import {
  useRecallSession,
  type UseRecallSessionResult,
} from "../use-recall-session";
import type {
  RecallCardView,
  RecallQueueView,
  RecallSubmitView,
} from "../../lib/actions";
import type { RecallInitialQueue } from "../../types";

const INITIAL_QUEUE: RecallInitialQueue = {
  ids: [11, 12],
  due: [11],
  fresh: [12],
  total: 2,
  estimatedMinutes: 3,
};

/** 空队列 / 「有卡却拿不到编号」的服务端快照（身份稳定：hook 的 effect 依赖它） */
const EMPTY_QUEUE: RecallInitialQueue = {
  ids: [],
  due: [],
  fresh: [],
  total: 0,
  estimatedMinutes: 0,
};
const MISMATCHED_QUEUE: RecallInitialQueue = {
  ids: [],
  due: [],
  fresh: [],
  total: 4,
  estimatedMinutes: 3,
};

function queueView(ids: number[]): RecallQueueView {
  return {
    total: ids.length,
    ids,
    dueIds: ids,
    freshIds: [],
    dueCount: ids.length,
    freshCount: 0,
    estimatedMinutes: 3,
    streakDays: 2,
  };
}

function listCard(overrides: Partial<RecallCardView> = {}): RecallCardView {
  return {
    cardId: 11,
    deckTitle: "e2e-recall",
    kind: "list",
    prompt: "写出水的三种状态",
    items: [
      { text: "固态", keywords: ["固态"] },
      { text: "液态", keywords: ["液态"] },
      { text: "气态", keywords: ["气态"] },
    ],
    blanks: null,
    pendingItems: null,
    mode: "first",
    ...overrides,
  };
}

function submitView(
  overrides: Partial<RecallSubmitView> = {},
): RecallSubmitView {
  return {
    verdicts: ["ok", "ok", "ok"],
    rating: "good",
    nextDue: "2026-11-20T00:00:00.000Z",
    pendingItems: null,
    nextReviewText: "下次 11 月 20 日",
    ...overrides,
  };
}

/** 走到作答屏（首卡已就位） */
async function renderAtQuestion(card: RecallCardView = listCard()) {
  mockFetchQueue.mockResolvedValue(queueView([11, 12]));
  mockFetchCard.mockResolvedValueOnce(card);
  const rendered = renderHook(() => useRecallSession(INITIAL_QUEUE));
  await waitFor(() => expect(rendered.result.current.phase).toBe("question"));
  return rendered;
}

/** 作答 → 判分屏（模拟用户输入） */
async function revealWith(
  result: { current: UseRecallSessionResult },
  typed: string,
) {
  act(() => {
    result.current.setTyped(typed);
  });
  act(() => {
    result.current.reveal();
  });
  await waitFor(() => expect(result.current.phase).toBe("judge"));
}

describe("useRecallSession", () => {
  beforeEach(() => {
    // 用 reset 而不是 clear：`mockReturnValueOnce` 的队列不会被 clearAllMocks 清掉，
    // 会泄漏到下一个用例（表现为"莫名拿到上一例的卡"）
    vi.resetAllMocks();
  });

  it("冷启动取卡成功：loading → question，预判覆盖全部条目", async () => {
    const { result } = await renderAtQuestion();

    expect(result.current.card?.cardId).toBe(11);
    expect(mockFetchCard).toHaveBeenCalledWith(11);

    await revealWith(result, "固态");

    expect(result.current.preview?.presented).toEqual([0, 1, 2]);
    expect(result.current.preview?.verdicts).toEqual(["ok", "miss", "miss"]);
    // 进入判分屏时 finalVerdicts 就是预判结果（用户还没改判）
    expect(result.current.finalVerdicts).toEqual(["ok", "miss", "miss"]);
  });

  it("重测：只呈现 pendingItems，且下标是卡内下标", async () => {
    const { result } = await renderAtQuestion(
      listCard({ mode: "retest", pendingItems: [1, 2] }),
    );

    await revealWith(result, "液态");

    expect(result.current.preview?.presented).toEqual([1, 2]);
    expect(result.current.preview?.verdicts).toEqual(["ok", "miss"]);
    expect(result.current.finalVerdicts).toHaveLength(2);
    expect(result.current.retestCount).toBe(2);
  });

  it("改判：overrides 用卡内下标，且只含真正变化的条目", async () => {
    const { result } = await renderAtQuestion(
      listCard({ mode: "retest", pendingItems: [1, 2] }),
    );
    await revealWith(result, "液态");
    mockSubmit.mockResolvedValue(submitView({ verdicts: ["ok", "ok"] }));

    // 改判 position 1 → 对应卡内下标 2 那一条
    act(() => {
      result.current.toggleVerdict(1);
    });
    expect(result.current.finalVerdicts).toEqual(["ok", "ok"]);

    await act(async () => {
      await result.current.commitVerdicts();
    });

    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: 11,
        typed: "液态",
        // 下标 1（卡内下标 2）改判；下标 0（卡内下标 1）没动 → 不进 overrides
        overrides: [{ index: 2, to: "ok" }],
        clientKey: expect.any(String),
      }),
    );
  });

  it("改判两次回到原判定：overrides 为空", async () => {
    const { result } = await renderAtQuestion();
    await revealWith(result, "固态");
    mockSubmit.mockResolvedValue(submitView());

    act(() => {
      result.current.toggleVerdict(1);
    });
    act(() => {
      result.current.toggleVerdict(1);
    });
    expect(result.current.finalVerdicts).toEqual(["ok", "miss", "miss"]);

    await act(async () => {
      await result.current.commitVerdicts();
    });

    expect(mockSubmit.mock.calls[0][0].overrides).toEqual([]);
  });

  it("提交失败：锁住判定，重试沿用同一 clientKey 与同一份载荷", async () => {
    const { result } = await renderAtQuestion();
    await revealWith(result, "固态");

    mockSubmit
      .mockRejectedValueOnce(new Error("网络断了"))
      .mockResolvedValueOnce(submitView());

    await act(async () => {
      await result.current.commitVerdicts();
    });

    expect(result.current.retryLocked).toBe(true);
    expect(result.current.result).toBeNull();
    expect(mockToastError).toHaveBeenCalled();
    const firstPayload = mockSubmit.mock.calls[0][0];
    expect(firstPayload.clientKey).toEqual(expect.any(String));

    // 锁定期间改判是空操作：否则界面会显示一个没被提交过的判定
    const lockedVerdicts = result.current.finalVerdicts;
    act(() => {
      result.current.toggleVerdict(1);
    });
    expect(result.current.finalVerdicts).toEqual(lockedVerdicts);

    await act(async () => {
      await result.current.commitVerdicts();
    });

    expect(mockSubmit.mock.calls[1][0]).toEqual(firstPayload);
    expect(result.current.retryLocked).toBe(false);
    expect(result.current.result?.nextReviewText).toBe("下次 11 月 20 日");
  });

  it("「全没想起」：载荷带 allBlank，成功后逐条 verdict 全 miss", async () => {
    const { result } = await renderAtQuestion();
    await revealWith(result, "固态 液态 气态");
    expect(result.current.finalVerdicts).toEqual(["ok", "ok", "ok"]);

    mockSubmit.mockResolvedValue(
      submitView({
        verdicts: ["miss", "miss", "miss"],
        rating: "again",
        pendingItems: [0, 1, 2],
        nextReviewText: "明天只重测这 3 条",
      }),
    );

    await act(async () => {
      await result.current.markAllBlank();
    });

    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: 11, allBlank: true }),
    );
    expect(result.current.finalVerdicts).toEqual(["miss", "miss", "miss"]);
    expect(result.current.preview?.verdicts).toEqual(["miss", "miss", "miss"]);
  });

  it("全对不自动进下一张：停在判分屏，只有 advance() 才换卡", async () => {
    const { result } = await renderAtQuestion();
    await revealWith(result, "固态 液态 气态");
    mockSubmit.mockResolvedValue(submitView());

    await act(async () => {
      await result.current.commitVerdicts();
    });

    // 结论块必须先被看到：（1）仍在判分屏（2）没有偷偷取第二张卡
    expect(result.current.phase).toBe("judge");
    expect(result.current.result?.nextReviewText).toBe("下次 11 月 20 日");
    expect(mockFetchCard).toHaveBeenCalledTimes(1);

    mockFetchCard.mockResolvedValueOnce(
      listCard({
        cardId: 12,
        kind: "cloze",
        items: null,
        blanks: [{ answers: ["水"] }],
      }),
    );
    await act(async () => {
      await result.current.advance();
    });

    expect(mockFetchCard).toHaveBeenLastCalledWith(12);
    expect(result.current.phase).toBe("question");
    expect(result.current.card?.cardId).toBe(12);
    // 换卡即换一次作答：输入、预判、结论都要清干净
    expect(result.current.typed).toBe("");
    expect(result.current.preview).toBeNull();
    expect(result.current.result).toBeNull();

    await act(async () => {
      await result.current.advance();
    });
    expect(result.current.phase).toBe("done");
  });

  it("重试必须重放首次载荷：「全没想起」失败后按「确认结果」也不能换成 overrides", async () => {
    // 服务端按 clientKey 重放首次结果。如果重试换了提交方式，服务端返回首次结论、
    // 界面显示新选择 —— 两边不一致。这里钉住「同一 key = 同一载荷」是结构保证。
    const { result } = await renderAtQuestion();
    await revealWith(result, "固态");

    mockSubmit
      .mockRejectedValueOnce(new Error("网络断了"))
      .mockResolvedValueOnce(
        submitView({ verdicts: ["miss", "miss", "miss"], rating: "again" }),
      );

    await act(async () => {
      await result.current.markAllBlank();
    });
    expect(result.current.retryLocked).toBe(true);
    const firstPayload = mockSubmit.mock.calls[0][0];
    expect(firstPayload.allBlank).toBe(true);
    expect(firstPayload.overrides).toBeUndefined();

    // 用户在锁定期间点了另一个按钮：仍然只能重放首次那份 allBlank 载荷
    await act(async () => {
      await result.current.commitVerdicts();
    });
    expect(mockSubmit.mock.calls[1][0]).toEqual(firstPayload);
    expect(mockSubmit.mock.calls[1][0].overrides).toBeUndefined();
  });

  it("队列被重新拉取（新 initialQueue）：上一轮的作答/预判/结论/锁全部清空", async () => {
    mockFetchQueue.mockResolvedValue(queueView([11, 12]));
    mockFetchCard.mockResolvedValueOnce(listCard());
    const { result, rerender } = renderHook(
      ({ q }: { q: RecallInitialQueue }) => useRecallSession(q),
      { initialProps: { q: INITIAL_QUEUE } },
    );
    await waitFor(() => expect(result.current.phase).toBe("question"));

    await revealWith(result, "固态");
    // 制造 retryLocked：首次提交失败
    mockSubmit.mockRejectedValueOnce(new Error("网络断了"));
    await act(async () => {
      await result.current.commitVerdicts();
    });
    expect(result.current.retryLocked).toBe(true);

    // 服务端重渲染下发新队列（对象身份变化 → 同一个 hook 实例重跑 bootstrap）
    const secondQueue: RecallInitialQueue = {
      ids: [21],
      due: [21],
      fresh: [],
      total: 1,
      estimatedMinutes: 1,
    };
    mockFetchQueue.mockResolvedValue(queueView([21]));
    mockFetchCard.mockResolvedValueOnce(listCard({ cardId: 21 }));
    rerender({ q: secondQueue });

    await waitFor(() => expect(result.current.card?.cardId).toBe(21));
    // 关键：新卡首屏不能带上一轮的答案/预判/结论，也不能还锁着
    expect(result.current.typed).toBe("");
    expect(result.current.preview).toBeNull();
    expect(result.current.result).toBeNull();
    expect(result.current.retryLocked).toBe(false);
    expect(result.current.phase).toBe("question");
  });

  it("空队列进 empty 态；有卡却拿不到编号时进 error 态", async () => {
    mockFetchQueue.mockResolvedValue(queueView([]));
    const empty = renderHook(() => useRecallSession(EMPTY_QUEUE));
    await waitFor(() => expect(empty.result.current.phase).toBe("empty"));
    expect(mockFetchCard).not.toHaveBeenCalled();
    empty.unmount();

    // 队列说「今天有 4 张」，却一个编号都没给：必须是错误态，不能显示成「今天没有卡」
    mockFetchQueue.mockResolvedValue({ ...queueView([]), total: 4 });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const error = renderHook(() => useRecallSession(MISMATCHED_QUEUE));
    await waitFor(() => expect(error.result.current.phase).toBe("error"));
    expect(error.result.current.loadError).toContain("缺少卡片编号");
    consoleError.mockRestore();
  });
});
