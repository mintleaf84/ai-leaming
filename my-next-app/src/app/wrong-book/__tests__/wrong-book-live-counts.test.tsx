/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * §3.7（批次 B4）：错题本的计数（总题数 / 已掌握 / 已选）只靠视觉数字变化。
 * 屏读用户听到孤立一个数字无法判断含义，所以断言的是**整句**播报文本，
 * 且断言它在计数变化后真的更新了（不是"元素存在"就算过）。
 *
 * 依赖边界：mock `use-wrong-book-controller`（页面唯一数据来源），
 * 只验证页面这一层对计数变化的播报行为。
 */

const holder = vi.hoisted(() => ({
  controller: {} as Record<string, unknown>,
}));

vi.mock("../hooks/use-wrong-book-controller", () => ({
  useWrongBookController: () => holder.controller,
}));

import WrongBookPage from "../page";

function makeQuestion(id: number) {
  return {
    questionId: id,
    questionContent: `错题内容 ${id}`,
    tags: ["教育学"],
    wrongCount: 2,
    lastWrongAt: "2026-11-01T00:00:00.000Z",
    correctAnswer: "A",
    userLastAnswer: "B",
  };
}

function makeController(overrides: Record<string, unknown> = {}) {
  const questions = [makeQuestion(1), makeQuestion(2), makeQuestion(3)];
  return {
    questions,
    groupedQuestions: [],
    masteredQuestions: [
      { questionId: 9, questionContent: "已掌握题", tags: [], masteredAt: null, note: null },
      { questionId: 10, questionContent: "已掌握题2", tags: [], masteredAt: null, note: null },
    ],
    stats: { total: 37, recent: 5, frequent: 3 },
    page: 1,
    pageSize: 20,
    total: 37,
    hasMore: true,
    isLoadingMore: false,
    loadMore: vi.fn(),
    goToPage: vi.fn(),
    isLoading: false,
    loadError: null,
    viewMode: "list",
    setViewMode: vi.fn(),
    selectedIds: new Set<number>(),
    isCreating: false,
    isRandomLoading: false,
    expandedQuestionId: null,
    questionDetail: null,
    isLoadingDetail: false,
    recommendedQuestions: [],
    isRecommendLoading: false,
    showRecommendDialog: false,
    isInitializing: false,
    initializeProgress: null,
    folders: [],
    selectedFolderId: null,
    folderQuestions: [],
    showAddToFolderDialog: false,
    isFolderSubmitting: false,
    pendingDeleteFolder: null,
    isDeletingFolder: false,
    toggleSelect: vi.fn(),
    selectAll: vi.fn(),
    startPractice: vi.fn(),
    startRandomPractice: vi.fn(),
    toggleQuestionDetail: vi.fn(),
    handleMarkAsMastered: vi.fn(),
    handleUnmarkMastered: vi.fn(),
    handleRecommendSimilar: vi.fn(),
    closeRecommendDialog: vi.fn(),
    handleStartRecommended: vi.fn(),
    handleSelectFolder: vi.fn(),
    handleCreateFolder: vi.fn(),
    handleRenameFolder: vi.fn(),
    requestDeleteFolder: vi.fn(),
    confirmDeleteFolder: vi.fn(),
    cancelDeleteFolder: vi.fn(),
    openAddToFolderDialog: vi.fn(),
    closeAddToFolderDialog: vi.fn(),
    handleAddToFolder: vi.fn(),
    loadData: vi.fn(),
    ...overrides,
  };
}

describe("错题本计数播报（§3.7）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("初始播报整句（总题数 + 已掌握 + 已选），不是一个裸数字", () => {
    holder.controller = makeController();
    render(<WrongBookPage />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("错题共 37 道，其中已掌握 2 道，已选 0 道。");
    // 反证：不能只播数字
    expect(status.textContent?.trim()).not.toBe("0");
  });

  it("已选 0 → 3 之后文本真的更新为整句（不是只有元素还在）", () => {
    holder.controller = makeController();
    const { rerender } = render(<WrongBookPage />);
    expect(screen.getByRole("status")).toHaveTextContent("已选 0 道。");

    holder.controller = makeController({
      selectedIds: new Set([1, 2, 3]),
    });
    rerender(<WrongBookPage />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("已选 3 道。");
    expect(status).toHaveTextContent("错题共 37 道，其中已掌握 2 道，已选 3 道。");
  });

  it("同屏只有一个 role=status，且它是 sr-only（不改视觉）", () => {
    holder.controller = makeController({ selectedIds: new Set([1]) });
    render(<WrongBookPage />);

    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveClass("sr-only");
  });
});
