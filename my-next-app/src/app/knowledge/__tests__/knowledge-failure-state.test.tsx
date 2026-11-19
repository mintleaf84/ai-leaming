/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TerminologyProvider } from "@/lib/hooks/use-terminology";

/**
 * W1 回归（批次 A：知识卡片页）：接口失败必须排在空态之前。
 *
 * 页面按 loading → error → empty → data 渲染；这里钉住的是"error 不被
 * 空态抢走"以及"重试真的接到 loadCards"。
 */

const holder = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));

vi.mock("../hooks/useKnowledgeCards", () => ({
  useKnowledgeCards: () => holder.state,
}));

vi.mock("../hooks/useStudyMode", () => ({
  useStudyMode: () => ({
    studyMode: false,
    studyIndex: 0,
    studyFlipped: false,
    toggleStudyFlip: vi.fn(),
    startStudy: vi.fn(),
    exitStudy: vi.fn(),
    nextCard: vi.fn(),
    prevCard: vi.fn(),
  }),
}));

import KnowledgePage from "../page";

function state(overrides: Record<string, unknown> = {}) {
  return {
    cards: [],
    filteredCards: [],
    categories: [],
    stats: { total: 0 },
    loading: false,
    isError: false,
    error: null,
    selectedCategory: null,
    setSelectedCategory: vi.fn(),
    searchQuery: "",
    setSearchQuery: vi.fn(),
    editingCard: null,
    setEditingCard: vi.fn(),
    isCreateModal: false,
    setIsCreateModal: vi.fn(),
    exporting: false,
    toast: null,
    handleSave: vi.fn(),
    handleExport: vi.fn(),
    loadCards: vi.fn(),
    ...overrides,
  };
}

describe("知识卡片：接口失败 ≠ 未找到匹配的卡片（W1 批次 A）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isError 时渲染错误态，空态文案不出现", () => {
    holder.state = state({ isError: true, error: new Error("接口 500") });

    render(
      <TerminologyProvider>
        <KnowledgePage />
      </TerminologyProvider>,
    );

    expect(screen.getByText("知识库加载失败")).toBeInTheDocument();
    expect(screen.queryByText("未找到匹配的卡片")).not.toBeInTheDocument();
  });

  it("点重试调用 loadCards", () => {
    const loadCards = vi.fn();
    holder.state = state({
      isError: true,
      error: new Error("接口 500"),
      loadCards,
    });

    render(
      <TerminologyProvider>
        <KnowledgePage />
      </TerminologyProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /重试/ }));

    expect(loadCards).toHaveBeenCalledTimes(1);
  });
});
