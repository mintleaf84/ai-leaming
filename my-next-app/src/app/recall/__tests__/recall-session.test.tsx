import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * 编排层冒烟：拆成 hook + 屏之后，「谁调谁」必须还接得上。
 *
 * 这里盯两件单测覆盖不到、只能靠渲染证明的事：
 * 1. 作答屏的主操作同时存在于桌面端与移动端两处（同一个元素渲染两次）；
 * 2. 有主操作时 `usePageBottomBar` 的登记真的生效——否则移动端会出现
 *    「页面底栏 + MobileNav」两条固定底栏（layout-guard 会红）。
 */

const { mockFetchQueue, mockFetchCard } = vi.hoisted(() => ({
  mockFetchQueue: vi.fn(),
  mockFetchCard: vi.fn(),
}));

vi.mock("../lib/actions", () => ({
  fetchRecallQueue: mockFetchQueue,
  fetchRecallCard: mockFetchCard,
  submitRecall: vi.fn(),
  archiveRecallCard: vi.fn(),
  actionErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import {
  BottomBarProvider,
  useHasPageBottomBar,
} from "@/components/layout/bottom-bar-slot";

import RecallSession from "../RecallSession";

function BottomBarProbe() {
  return <span data-testid="probe">{useHasPageBottomBar() ? "有" : "无"}</span>;
}

describe("RecallSession 编排", () => {
  it("首卡到位即作答屏：两处主操作，且页面底栏已登记", async () => {
    mockFetchQueue.mockResolvedValue({
      total: 1,
      ids: [11],
      dueIds: [11],
      freshIds: [],
      dueCount: 1,
      freshCount: 0,
      estimatedMinutes: 2,
      streakDays: 3,
    });
    mockFetchCard.mockResolvedValue({
      cardId: 11,
      deckTitle: "冒烟卡组",
      kind: "list",
      prompt: "写出一条水的状态",
      items: [{ text: "固态", keywords: ["固态"] }],
      blanks: null,
      pendingItems: null,
      mode: "first",
    });

    render(
      <BottomBarProvider>
        <RecallSession
          initialQueue={{
            ids: [11],
            due: [11],
            fresh: [],
            total: 1,
            estimatedMinutes: 2,
          }}
        />
        <BottomBarProbe />
      </BottomBarProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("写出一条水的状态")).toBeInTheDocument(),
    );
    // 顶部合计来自队列（不是服务端快照）+ 连续天数
    expect(screen.getByText(/回忆 1 张 · 约 2 分钟/)).toBeInTheDocument();
    expect(screen.getByText("连续 3 天")).toBeInTheDocument();
    // 桌面/移动各一份「看答案」
    expect(screen.getAllByRole("button", { name: /看答案/ })).toHaveLength(2);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    // 登记发生在作答屏这次 commit 的 effect 里，计数落地会晚一拍
    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("有"),
    );
  });
});
