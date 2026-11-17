/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TerminologyProvider } from "@/lib/hooks/use-terminology";

/**
 * §3.7（批次 B4）第二半：knowledge/page.tsx 的分类/搜索筛选。
 *
 * 筛到 0 张时页面上只剩一块空态。以前它是纯视觉的 div —— 屏读用户只知道
 * "列表没了"，不知道原因和下一步。挂 role="status" 后，"没有匹配的卡片 +
 * 试试改搜索词"会被读出来。这里断言的是空态出现后 role=status 的内容。
 */

const holder = vi.hoisted(() => ({
  cards: {} as Record<string, unknown>,
}));

vi.mock("../hooks/useKnowledgeCards", () => ({
  useKnowledgeCards: () => holder.cards,
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

function makeCardsState(overrides: Record<string, unknown> = {}) {
  return {
    cards: [],
    filteredCards: [],
    categories: ["教育学"],
    stats: { total: 37 },
    loading: false,
    selectedCategory: "教育学",
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

describe("知识库空结果播报（§3.7）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("筛选结果为 0 张时，空态作为 role=status 被读出（含下一步该怎么做）", () => {
    holder.cards = makeCardsState();
    render(
      <TerminologyProvider>
        <KnowledgePage />
      </TerminologyProvider>,
    );

    const alerts = screen.getAllByRole("status");
    const emptyState = alerts.find((el) =>
      el.textContent?.includes("未找到匹配的卡片"),
    );
    expect(emptyState).toBeDefined();
    expect(emptyState).toHaveTextContent("尝试改变搜索词或切换分类");
  });

  it("有卡片时不渲染空态（避免误报）", () => {
    holder.cards = makeCardsState({
      filteredCards: [
        {
          id: 1,
          title: "认知发展理论",
          category: "教育学",
          tags: [],
          front: "正面",
          back: "背面",
          key_points: [],
        },
      ],
    });
    render(
      <TerminologyProvider>
        <KnowledgePage />
      </TerminologyProvider>,
    );

    expect(screen.queryByText("未找到匹配的卡片")).not.toBeInTheDocument();
  });
});
