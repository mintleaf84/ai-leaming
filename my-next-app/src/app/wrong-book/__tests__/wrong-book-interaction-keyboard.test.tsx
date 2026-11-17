/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

import { FolderTreeView } from "../components/FolderTreeView";
import { TagTreeView } from "../components/TagTreeView";
import { WrongQuestionCard } from "../components/WrongQuestionCard";
import { RecommendedQuestionsDialog } from "../components/RecommendedQuestionsDialog";
import { QuestionCountPicker } from "../components/QuestionCountPicker";
import type {
  WrongQuestionItem,
  WrongQuestionsByTag,
} from "@/lib/services/wrong-question";
import type { QuestionFolder } from "@/lib/services/question-folder";
import type { RagResult } from "@/lib/ai/rag";

/**
 * M6 批次 B5（错题本部分）：把 6 处「有 onClick 的静态元素」换成真语义元素 /
 * 把便捷点击挪进真按钮，然后**用键盘把这些行为再跑一遍**。
 *
 * 为什么断言键盘而不是只断言「现在是 button」：
 * 1. 换成 `<button>` 的收益就是 Enter/Space 由浏览器原生提供，必须钉住它真的触发；
 * 2. 卡片/行这类「复合交互面」若补 role+tabIndex+onKeyDown，很容易同一按键触发两次，
 *    `toHaveBeenCalledTimes(n)` 就是防空转的那颗钉子；
 * 3. 带播放按钮的行/卡片必须验「播放按钮没被套在选择按钮里」—— 嵌套 button 在 HTML 里
 *    不合法，读屏器会念两个控件（比原来的 div 更糟）。
 */

function makeQuestion(id: number): WrongQuestionItem {
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

function makeFolder(id: number, name: string): QuestionFolder {
  return {
    id,
    userId: 1,
    name,
    parentId: null,
    color: "#3b82f6",
    sortOrder: 0,
    createdAt: null,
    questionCount: 3,
  };
}

const TAG_GROUPS: WrongQuestionsByTag[] = [
  {
    tag: "教育学/课程",
    count: 2,
    questions: [makeQuestion(1), makeQuestion(2)],
  },
];

type FolderTreeProps = Parameters<typeof FolderTreeView>[0];

function renderTree(overrides: Partial<FolderTreeProps> = {}) {
  const props: FolderTreeProps = {
    tagGroups: TAG_GROUPS,
    folders: [makeFolder(1, "重点错题")],
    selectedFolderId: null,
    onSelectFolder: vi.fn(),
    onCreateFolder: vi.fn(),
    onRenameFolder: vi.fn(),
    onDeleteFolder: vi.fn(),
    onStartPractice: vi.fn(),
    ...overrides,
  };
  render(<FolderTreeView {...props} />);
  return props;
}

describe("FolderTreeView：知识点行 / 文件夹行都能键盘操作", () => {
  it("知识点行：点击 = 选中 + 展开，Enter/Space 触发同一动作且每次只回调一次", async () => {
    const user = userEvent.setup();
    const props = renderTree();

    // 根节点默认展开
    const rootRow = screen.getByRole("button", { name: /教育学/ });
    expect(rootRow).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /课程/ })).toBeInTheDocument();

    rootRow.focus();
    await user.keyboard("{Enter}");
    expect(props.onSelectFolder).toHaveBeenCalledTimes(1);
    expect(props.onSelectFolder).toHaveBeenCalledWith("tag:教育学");
    expect(rootRow).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /课程/ })).toBeNull();

    // Space 同样激活；不能因为两种键各绑一次而重复回调
    await user.keyboard(" ");
    expect(props.onSelectFolder).toHaveBeenCalledTimes(2);
    expect(rootRow).toHaveAttribute("aria-expanded", "true");

    // 鼠标路径没变
    await user.click(rootRow);
    expect(props.onSelectFolder).toHaveBeenCalledTimes(3);
    expect(props.onSelectFolder).toHaveBeenLastCalledWith("tag:教育学");
  });

  it("无子节点的知识点行不带 aria-expanded（叶子不该谎报可展开）", () => {
    renderTree();
    expect(screen.getByRole("button", { name: /课程/ })).not.toHaveAttribute(
      "aria-expanded",
    );
  });

  it("文件夹行：选择按钮是行里唯一的选择入口，Enter 可选中，更多操作是它的兄弟", async () => {
    const user = userEvent.setup();
    const props = renderTree();

    const selectButton = screen.getByRole("button", { name: /重点错题/ });
    const menuButton = screen.getByRole("button", { name: "文件夹更多操作" });

    // 不制造嵌套 button：菜单按钮不能落在选择按钮内部
    expect(selectButton.contains(menuButton)).toBe(false);
    expect(selectButton.querySelectorAll("button")).toHaveLength(0);

    selectButton.focus();
    await user.keyboard("{Enter}");
    expect(props.onSelectFolder).toHaveBeenCalledTimes(1);
    expect(props.onSelectFolder).toHaveBeenCalledWith("folder:1");

    await user.click(selectButton);
    expect(props.onSelectFolder).toHaveBeenCalledTimes(2);

    // 点更多操作不再顺带"选中文件夹"
    await user.click(menuButton);
    expect(props.onSelectFolder).toHaveBeenCalledTimes(2);
  });

  it("Tab 能走到知识点行与文件夹行（不再只有鼠标可达）", async () => {
    const user = userEvent.setup();
    renderTree();

    const tagRow = screen.getByRole("button", { name: /教育学/ });
    const folderRow = screen.getByRole("button", { name: /重点错题/ });

    const reached = new Set<Element>();
    for (let i = 0; i < 8 && reached.size < 2; i += 1) {
      await user.tab();
      const active = document.activeElement;
      if (active === tagRow || active === folderRow) reached.add(active);
    }
    expect(reached.has(tagRow)).toBe(true);
    expect(reached.has(folderRow)).toBe(true);
  });

  it("选中态用 aria-current 播报（不只是背景色）", () => {
    renderTree({ selectedFolderId: "folder:1" });
    expect(screen.getByRole("button", { name: /重点错题/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});

describe("TagTreeView：节点行展开按钮 + 兄弟练习按钮", () => {
  it("Enter 展开/收起节点，练习按钮不在展开按钮内部", async () => {
    const user = userEvent.setup();
    render(
      <TagTreeView groupedQuestions={TAG_GROUPS} onStartPractice={vi.fn()} />,
    );

    const rootRow = screen.getByRole("button", { name: /教育学/ });
    expect(rootRow).toHaveAttribute("aria-expanded", "true");
    const leafRow = screen.getByRole("button", { name: /课程/ });
    expect(leafRow).toBeInTheDocument();

    const practice = within(leafRow.parentElement as HTMLElement).getByRole(
      "button",
      { name: "开始练习" },
    );
    expect(rootRow.contains(practice)).toBe(false);
    expect(leafRow.contains(practice)).toBe(false);

    rootRow.focus();
    await user.keyboard("{Enter}");
    expect(rootRow).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /课程/ })).toBeNull();

    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: /课程/ })).toBeInTheDocument();
  });

  it("题量 <= 5 时点播放按钮直接开始练习（不再依赖外层 span 的点击）", async () => {
    const user = userEvent.setup();
    const onStartPractice = vi.fn();
    render(
      <TagTreeView
        groupedQuestions={TAG_GROUPS}
        onStartPractice={onStartPractice}
      />,
    );

    const leafRow = screen.getByRole("button", { name: /课程/ });
    const practice = within(leafRow.parentElement as HTMLElement).getByRole(
      "button",
      { name: "开始练习" },
    );

    // 键盘同样可点：触发器就是真按钮
    practice.focus();
    await user.keyboard("{Enter}");
    expect(onStartPractice).toHaveBeenCalledTimes(1);
    expect(onStartPractice).toHaveBeenCalledWith([1, 2], 2);

    await user.click(practice);
    expect(onStartPractice).toHaveBeenCalledTimes(2);

    // 点播放不该顺带展开/收起节点（叶子没有 aria-expanded，题目列表也仍收起）
    expect(leafRow).not.toHaveAttribute("aria-expanded");
    expect(screen.queryByText("错题内容 1")).toBeNull();
  });
});

describe("QuestionCountPicker：≤5 题时 handler 落在调用方传进来的按钮上", () => {
  it("没有包裹层、没有嵌套按钮，点击与 Enter 都会开始练习", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <QuestionCountPicker totalCount={3} onConfirm={onConfirm}>
        <button type="button" onClick={() => undefined}>
          开始练习
        </button>
      </QuestionCountPicker>,
    );

    const trigger = screen.getByRole("button", { name: "开始练习" });
    // 整个子树只有一个按钮：原来那层 <span onClick> 已去掉
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(trigger.parentElement?.tagName).not.toBe("SPAN");

    trigger.focus();
    await user.keyboard("{Enter}");
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(3);

    await user.click(trigger);
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it("子按钮自己的 onClick 仍先执行（不吞掉调用方的行为）", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onChildClick = vi.fn();
    render(
      <QuestionCountPicker totalCount={3} onConfirm={onConfirm}>
        <button type="button" onClick={onChildClick}>
          开始练习
        </button>
      </QuestionCountPicker>,
    );

    await user.click(screen.getByRole("button", { name: "开始练习" }));
    expect(onChildClick).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("> 5 题仍弹选项浮层，选 10 题后回调 10（既有交互不变）", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <QuestionCountPicker totalCount={20} onConfirm={onConfirm}>
        <button type="button">开始练习</button>
      </QuestionCountPicker>,
    );

    await user.click(screen.getByRole("button", { name: "开始练习" }));
    await user.click(await screen.findByRole("button", { name: /^10 题$/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(10);
  });
});

type CardProps = Parameters<typeof WrongQuestionCard>[0];

function renderCard(overrides: Partial<CardProps> = {}) {
  const props: CardProps = {
    question: makeQuestion(1),
    isSelected: false,
    isExpanded: false,
    detail: null,
    isLoadingDetail: false,
    onToggleSelect: vi.fn(),
    onToggleDetail: vi.fn(),
    onPractice: vi.fn(),
    onMarkAsMastered: vi.fn(),
    ...overrides,
  };
  render(<WrongQuestionCard {...props} />);
  return props;
}

describe("WrongQuestionCard：内容区是按钮，与勾选按钮互不干扰", () => {
  it("Enter / Space / 点击各只展开一次，内容区里没有嵌套 button", async () => {
    const user = userEvent.setup();
    const props = renderCard();

    const detailButton = screen.getByRole("button", { name: /错题内容 1/ });
    expect(detailButton).toHaveAttribute("aria-expanded", "false");
    expect(detailButton.querySelectorAll("button")).toHaveLength(0);

    detailButton.focus();
    await user.keyboard("{Enter}");
    expect(props.onToggleDetail).toHaveBeenCalledTimes(1);

    await user.keyboard(" ");
    expect(props.onToggleDetail).toHaveBeenCalledTimes(2);

    await user.click(detailButton);
    expect(props.onToggleDetail).toHaveBeenCalledTimes(3);

    // 勾选按钮是独立控件：点它不展开详情
    const select = screen.getByRole("button", { name: "选择该题" });
    expect(select).toHaveAttribute("aria-pressed", "false");
    await user.click(select);
    expect(props.onToggleSelect).toHaveBeenCalledTimes(1);
    expect(props.onToggleDetail).toHaveBeenCalledTimes(3);
  });

  it("Tab 能走到内容区按钮（不再只有鼠标可达），且不与勾选按钮抢焦点顺序", async () => {
    const user = userEvent.setup();
    renderCard();

    const detailButton = screen.getByRole("button", { name: /错题内容 1/ });
    // 顺序：勾选 → 内容区 → 练习
    await user.tab();
    expect(screen.getByRole("button", { name: "选择该题" })).toHaveFocus();
    await user.tab();
    expect(detailButton).toHaveFocus();
  });

  it("已展开/已选中时 aria-expanded 与 aria-pressed 都如实反映", () => {
    renderCard({ isExpanded: true, isSelected: true });
    expect(screen.getByRole("button", { name: /错题内容 1/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "取消选择该题" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

describe("RecommendedQuestionsDialog：推荐卡片是按钮，键盘也能开始练习", () => {
  const questions = [
    { content: "相似题 A", score: 0.9, metadata: { question_id: 11 } },
    { content: "相似题 B", score: 0.8, metadata: { question_id: 12 } },
  ] as unknown as RagResult[];

  function renderDialog(onStartPractice = vi.fn()) {
    render(
      <RecommendedQuestionsDialog
        isOpen
        onClose={vi.fn()}
        questions={questions}
        isLoading={false}
        isInitializing={false}
        onStartPractice={onStartPractice}
      />,
    );
    return onStartPractice;
  }

  it("点卡片 / 卡片上按 Enter 都会用全部推荐题开始练习", async () => {
    const user = userEvent.setup();
    const onStartPractice = renderDialog();

    const card = await screen.findByRole("button", { name: /相似题 A/ });
    expect(card.tagName).toBe("BUTTON");

    card.focus();
    await user.keyboard("{Enter}");
    expect(onStartPractice).toHaveBeenCalledTimes(1);
    expect(onStartPractice).toHaveBeenCalledWith([11, 12]);

    await user.click(card);
    expect(onStartPractice).toHaveBeenCalledTimes(2);
  });

  it("每张推荐卡恰好一个按钮（外层不再留一个「可点 div」）", async () => {
    renderDialog();
    await waitFor(() =>
      expect(screen.getByText("相似题 B")).toBeInTheDocument(),
    );
    expect(screen.getAllByRole("button", { name: /相似题/ })).toHaveLength(2);
  });
});
