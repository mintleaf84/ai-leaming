/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TerminologyProvider } from "@/lib/hooks/use-terminology";
import { KnowledgeHeader } from "../components/KnowledgeHeader";

/**
 * §3.7（批次 B4）：知识库的卡片总数与分类切换只有视觉变化。
 *
 * 断言的是**整句**（"知识卡片共 N 张。当前分类：X，共 M 张。"）在数字变化后
 * 真的更新，而不是"有个 status 元素"。
 *
 * 另一条用例是防刷屏的反证：搜索框是逐字输入的，此时播报里**不能**带命中数，
 * 否则用户每敲一个字母就被打断一次。
 */

function renderHeader(
  props: Partial<React.ComponentProps<typeof KnowledgeHeader>> = {},
) {
  const merged = {
    stats: { total: 37 },
    categories: ["教育学", "心理学"],
    selectedCategory: "",
    setSelectedCategory: vi.fn(),
    filteredCount: 37,
    onAdd: vi.fn(),
    onAIGenerate: vi.fn(),
    onStudy: vi.fn(),
    onExport: vi.fn(),
    exporting: false,
    searchQuery: "",
    setSearchQuery: vi.fn(),
    ...props,
  } as React.ComponentProps<typeof KnowledgeHeader>;

  return render(
    <TerminologyProvider>
      <KnowledgeHeader {...merged} />
    </TerminologyProvider>,
  );
}

describe("知识库计数播报（§3.7）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("播报整句：总数 + 当前分类 + 该分类下的张数", () => {
    renderHeader();

    expect(screen.getByRole("status")).toHaveTextContent(
      "知识卡片共 37 张。当前分类：全部分类，共 37 张。",
    );
  });

  it("卡片总数变化（37 → 38）后播报文本真的更新", () => {
    const { rerender } = renderHeader();
    expect(screen.getByRole("status")).toHaveTextContent("知识卡片共 37 张");

    rerender(
      <TerminologyProvider>
        <KnowledgeHeader
          stats={{ total: 38 }}
          categories={["教育学", "心理学"]}
          selectedCategory=""
          setSelectedCategory={vi.fn()}
          filteredCount={38}
          onAdd={vi.fn()}
          onAIGenerate={vi.fn()}
          onStudy={vi.fn()}
          onExport={vi.fn()}
          exporting={false}
          searchQuery=""
          setSearchQuery={vi.fn()}
        />
      </TerminologyProvider>,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("知识卡片共 38 张。");
    expect(status).not.toHaveTextContent("知识卡片共 37 张。");
  });

  it("切换分类后播报新分类与该分类张数", () => {
    const { rerender } = renderHeader();

    rerender(
      <TerminologyProvider>
        <KnowledgeHeader
          stats={{ total: 37 }}
          categories={["教育学", "心理学"]}
          selectedCategory="教育学"
          setSelectedCategory={vi.fn()}
          filteredCount={12}
          onAdd={vi.fn()}
          onAIGenerate={vi.fn()}
          onStudy={vi.fn()}
          onExport={vi.fn()}
          exporting={false}
          searchQuery=""
          setSearchQuery={vi.fn()}
        />
      </TerminologyProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "知识卡片共 37 张。当前分类：教育学，共 12 张。",
    );
  });

  it("搜索中不播报命中数（防逐键刷屏）", () => {
    renderHeader({ searchQuery: "认知", filteredCount: 3 });

    const text = screen.getByRole("status").textContent ?? "";
    expect(text).toContain("知识卡片共 37 张");
    expect(text).not.toContain("共 3 张");
  });
});
