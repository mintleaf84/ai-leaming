/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

import { KnowledgeModal } from "../components/KnowledgeModal";
import { AIGenerateModal } from "../components/AIGenerateModal";
import { KnowledgeCardExpanded } from "../components/KnowledgeCardExpanded";
import { StudyModeOverlay } from "../components/StudyModeOverlay";
import { useStudyMode } from "../hooks/useStudyMode";
import type { KnowledgeCard } from "@/lib/services/knowledge";

/**
 * M6 批次 B2：知识库 4 处自建浮层换 Radix（`ui/dialog.tsx`）。
 *
 * 每个浮层守的是**行为**，不是「它长这样」：
 * 1. 打开后 `role="dialog"` + `aria-modal="true"` —— 自建 div 两个都没有；
 * 2. 焦点真的进了浮层（`dialog.contains(document.activeElement)`）且 Tab 出不去；
 * 3. Esc 能关；
 * 4. 关掉后焦点回到打开它的那个按钮（Radix 只认 `Dialog.Trigger`，
 *    这几个浮层是受控 `open`、没有 Trigger，所以组件里自己记了打开前的焦点）；
 * 5. 原本点遮罩**不**关闭的（两个表单弹窗）仍不关闭；原本点遮罩关闭的
 *    （卡片全屏）仍关闭。
 */

const CARD: KnowledgeCard = {
  id: 7,
  title: "广域课程的定义",
  category: "教育学基础",
  front: "什么是广域课程？",
  back: "合并数门相邻学科内容形成的课程。",
  tags: ["课程"],
  key_points: [{ term: "广域课程", definition: "合并相邻学科" }],
} as KnowledgeCard;

function overlay(): HTMLElement {
  return screen.getByTestId("dialog-overlay");
}

async function expectDialogOpen(): Promise<HTMLElement> {
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveAttribute("aria-modal", "true");
  return dialog;
}

/** Tab 若干次后焦点仍在浮层内（自建浮层会跑到遮罩后面的内容上） */
async function expectFocusTrapped(dialog: HTMLElement, times = 6) {
  const user = userEvent.setup();
  for (let i = 0; i < times; i += 1) {
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
  }
}

describe("KnowledgeModal：换成 Radix 后仍保住既有行为", () => {
  function Harness({ onClose }: { onClose?: () => void }) {
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>添加卡片</button>
        <KnowledgeModal
          isOpen={open}
          isCreate
          card={{
            title: "",
            category: "",
            tags: [],
            front: "",
            back: "",
            key_points: [],
          }}
          onClose={() => {
            onClose?.();
            setOpen(false);
          }}
          onSave={() => undefined}
          onChange={() => undefined}
        />
      </>
    );
  }

  it("打开后：有 dialog 语义、焦点在浮层内、Tab 出不去、Esc 可关、焦点回到触发按钮", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    const trigger = screen.getByRole("button", { name: "添加卡片" });
    trigger.focus();
    await user.click(trigger);

    const dialog = await expectDialogOpen();
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );
    await expectFocusTrapped(dialog);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("点遮罩不关闭（原本就没有遮罩关闭，表单里有未保存内容）", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "添加卡片" }));

    const dialog = await expectDialogOpen();
    await user.click(overlay());

    expect(onClose).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();
  });
});

describe("AIGenerateModal：换成 Radix 后仍保住既有行为", () => {
  function Harness({ onClose }: { onClose?: () => void }) {
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>AI 生成卡片</button>
        <AIGenerateModal
          isOpen={open}
          onClose={() => {
            onClose?.();
            setOpen(false);
          }}
          onSave={() => true}
        />
      </>
    );
  }

  it("打开后：有 dialog 语义、焦点在浮层内、Tab 出不去、Esc 可关（会重置输入）、焦点回到触发按钮", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    const trigger = screen.getByRole("button", { name: "AI 生成卡片" });
    trigger.focus();
    await user.click(trigger);

    const dialog = await expectDialogOpen();
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );
    await expectFocusTrapped(dialog);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("点遮罩不关闭（背后可能正在付费生成，误点不能丢进度）", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "AI 生成卡片" }));

    const dialog = await expectDialogOpen();
    await user.click(overlay());

    expect(onClose).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();
  });
});

describe("KnowledgeCardExpanded：换 Radix 但不能丢共享布局动画", () => {
  function Harness({ onClose }: { onClose?: () => void }) {
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>展开卡片</button>
        {open && (
          <KnowledgeCardExpanded
            card={CARD}
            onClose={() => {
              onClose?.();
              setOpen(false);
            }}
          />
        )}
      </>
    );
  }

  it("打开后：有 dialog 语义、焦点在浮层内、Tab 出不去", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "展开卡片" }));

    const dialog = await expectDialogOpen();
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );
    await expectFocusTrapped(dialog);
  });

  it("共享布局（layoutId）仍与网格卡片成对：动画契约没被换组件顺手删掉", async () => {
    // 见 knowledge-card-shared-layout.test.tsx：framer 在 jsdom 里不做 projection
    // （没有布局测量），所以那一条用 mock 断言 layoutId 配对，这里只钉住
    // 「展开态由弹窗承载、卡片内容仍渲染在 dialog 内」
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "展开卡片" }));
    const dialog = await expectDialogOpen();

    expect(dialog).toHaveAttribute(
      "aria-labelledby",
      `card-expanded-title-${CARD.id}`,
    );
    expect(
      document.getElementById(`card-expanded-title-${CARD.id}`),
    ).toHaveTextContent(CARD.title);
  });

  it("点遮罩仍关闭，Esc 也关闭", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "展开卡片" }));
    await expectDialogOpen();
    await user.click(overlay());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "展开卡片" }));
    await expectDialogOpen();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("StudyModeOverlay：Radix 只管语义与焦点，键盘仍归 useStudyMode", () => {
  const cards = [CARD, { ...CARD, id: 8, title: "第二张" }] as KnowledgeCard[];

  function Harness({ onExit }: { onExit?: () => void }) {
    const study = useStudyMode(cards);
    return (
      <>
        <button onClick={study.startStudy}>开始复习</button>
        <span data-testid="mode">{String(study.studyMode)}</span>
        <span data-testid="flipped">{String(study.studyFlipped)}</span>
        {study.studyMode && (
          <StudyModeOverlay
            cards={cards}
            studyIndex={study.studyIndex}
            studyFlipped={study.studyFlipped}
            toggleFlip={study.toggleStudyFlip}
            onNext={study.nextCard}
            onPrev={study.prevCard}
            onExit={() => {
              onExit?.();
              study.exitStudy();
            }}
          />
        )}
      </>
    );
  }

  it("进入后有 dialog 语义、焦点在浮层内、Tab 出不去", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "开始复习" }));

    const dialog = await expectDialogOpen();
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );
    await expectFocusTrapped(dialog);
  });

  it("Esc 只关一次：Esc 归 useStudyMode，Radix 不再重复触发一次关闭", async () => {
    const user = userEvent.setup();
    const onExit = vi.fn();
    render(<Harness onExit={onExit} />);
    await user.click(screen.getByRole("button", { name: "开始复习" }));
    await expectDialogOpen();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // onExit 是 Radix 的 onOpenChange 分支：它没被调用 → Radix 没和全局监听各关一次。
    // 一旦有人删掉 onEscapeKeyDown 里的 preventDefault，这里会变成 1 次。
    expect(onExit).not.toHaveBeenCalled();
    expect(screen.getByTestId("mode")).toHaveTextContent("false");
  });

  it("关掉后焦点回到「开始复习」按钮", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "开始复习" });
    trigger.focus();
    await user.click(trigger);
    await expectDialogOpen();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("空格翻转一次（卡片上的 role=button 只接 Enter，不和全局 Space 抢）", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "开始复习" }));
    await expectDialogOpen();

    expect(screen.getByTestId("flipped")).toHaveTextContent("false");
    await user.keyboard(" ");
    expect(screen.getByTestId("flipped")).toHaveTextContent("true");
  });

  it("翻转卡片是真按钮语义，Enter 可翻（jsx-a11y 的两条交互命中随之消失）", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "开始复习" }));
    await expectDialogOpen();

    const card = screen.getByRole("button", { name: "翻转看答案" });
    card.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByTestId("flipped")).toHaveTextContent("true");
    expect(
      screen.getByRole("button", { name: "翻转回问题" }),
    ).toBeInTheDocument();
  });
});
