/** @vitest-environment jsdom */
import React, { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HistoryCardExpanded } from "../HistoryCardExpanded";

/**
 * 批次 B2：历史记录详情浮层从自建 fixed 浮层换成 ui/dialog。
 *
 * 改造前它手写锁 body.overflow（其实锁不住：本页真正的滚动容器是 layout 里的
 * <main overflow-y-auto>），没有 dialog 语义、没有 Esc、没有焦点移入/归还。
 */
vi.mock("@/server/actions/history", () => ({
  getSessionDetailAction: vi.fn(),
}));

vi.mock("@/server/actions/report", () => ({
  generateDeepAnalysisAction: vi.fn(),
  getAnalysisReportAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// 列表/头部/滑动视图与本文件要验的「dialog 语义 + 焦点 + 滚动锁」无关
vi.mock("../ExpandedHeader", () => ({
  ExpandedHeader: () => <div data-testid="expanded-header" />,
}));
vi.mock("../QuestionsListHeader", () => ({
  QuestionsListHeader: () => <div data-testid="list-header" />,
}));
vi.mock("../CardSwipeView", () => ({
  CardSwipeView: () => <div data-testid="card-view" />,
}));
vi.mock("react-virtuoso", () => ({
  Virtuoso: ({
    data,
    itemContent,
  }: {
    data?: unknown[];
    itemContent?: (index: number, item: unknown) => React.ReactNode;
  }) => (
    <div>
      {(data ?? []).map((item, index) => (
        <div key={index}>{itemContent?.(index, item)}</div>
      ))}
    </div>
  ),
}));
vi.mock("@/components/history", () => ({
  QuestionCard: () => <div data-testid="question-card" />,
  SessionSummary: () => null,
  // 答题卡是浮层内的兄弟节点：Radix 模态会把 DialogContent 之外的节点
  // aria-hidden + pointer-events:none，所以它必须留在 Content 里面
  AnswerSheet: () => <button data-testid="answer-sheet">答题卡</button>,
}));

import { getSessionDetailAction } from "@/server/actions/history";
import { getAnalysisReportAction } from "@/server/actions/report";

const detail = {
  session: {
    practiceMode: "smart",
    sessionName: "智能刷题 #1",
    accuracy: 75,
  },
  logs: [{ isCorrect: true }, { isCorrect: false }],
};

function Harness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <main>列表</main>
      <button onClick={() => setOpen(true)}>查看详情</button>
      {open && (
        <HistoryCardExpanded
          sessionId="sess-1"
          initialData={{ sessionName: "智能刷题 #1" }}
          onClose={() => {
            setOpen(false);
            onClose();
          }}
        />
      )}
    </QueryClientProvider>
  );
}

async function openDetail() {
  const trigger = screen.getByRole("button", { name: "查看详情" });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

describe("HistoryCardExpanded（批次 B2：换成 Dialog）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (
      getSessionDetailAction as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ data: detail });
    (
      getAnalysisReportAction as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ data: { success: false } });
  });

  it("有 dialog 语义：role=dialog + aria-modal + 可访问名称", async () => {
    render(<Harness onClose={vi.fn()} />);
    await openDetail();

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("练习记录详情");
  });

  it("打开后焦点移入浮层（原来完全不移焦点）", async () => {
    render(<Harness onClose={vi.fn()} />);
    await openDetail();

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
  });

  it("Esc 关闭（改造前没有 Esc）", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await openDetail();
    await screen.findByRole("dialog");

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("点遮罩仍能关闭（原有行为）", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await openDetail();
    await screen.findByRole("dialog");

    // 遮罩沿用改造前的 bg-background/60，防止换壳顺带改配色
    const overlay = document.querySelector(".bg-background\\/60");
    expect(overlay).not.toBeNull();
    fireEvent.pointerDown(overlay as Element, { button: 0 });
    fireEvent.click(overlay as Element);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("关闭后焦点回到触发元素（不再把焦点丢给 body）", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const trigger = await openDetail();
    await screen.findByRole("dialog");

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("答题卡浮层留在 dialog 内，不会被模态的 aria-hidden/pointer-events 屏蔽", async () => {
    render(<Harness onClose={vi.fn()} />);
    await openDetail();

    const dialog = await screen.findByRole("dialog");
    const answerSheet = await screen.findByTestId("answer-sheet");
    expect(dialog.contains(answerSheet)).toBe(true);
  });
});
