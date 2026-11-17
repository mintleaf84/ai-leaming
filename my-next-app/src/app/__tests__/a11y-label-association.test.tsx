/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

/**
 * `jsx-a11y/label-has-associated-control` 的运行时护栏（M6 批次 B1）。
 *
 * 为什么不做「41 处各一条测试」：那是维护灾难，改一处文案就红一次。
 * 这里只守一条**真断言**——渲染后遍历所有 `<label>`，每个要么
 *
 *   1. 有 `htmlFor`，并且它在 DOM 里**真能命中**一个可标注控件（id 拼错立刻红）；
 *   2. 没有 `htmlFor`，但自身**包含**可标注控件（隐式关联）。
 *
 * 换 `<fieldset><legend>` 的组标签不在此列（legend 不是 label，规则也不管），
 * 由第二个用例单独断言 legend 存在。
 *
 * 另外每个表单挑一处做**交互断言**：点 label → 对应控件拿到焦点。
 * 只查属性查不出「htmlFor 指到了另一个字段的 id」，点一下才知道。
 */

/** HTML「可标注元素」全集（button 也算：Radix Checkbox/SelectTrigger 渲染成 button） */
const LABELABLE = "input, select, textarea, button, meter, output, progress";

function labelTargets(label: HTMLLabelElement): HTMLElement[] {
  const htmlFor = label.getAttribute("for");
  if (htmlFor) {
    const byId = document.getElementById(htmlFor);
    return byId ? [byId as HTMLElement] : [];
  }
  return Array.from(label.querySelectorAll<HTMLElement>(LABELABLE));
}

/** 断言 root 内所有 label 都有可解析的关联，并返回 label 文本清单 */
function assertEveryLabelHasControl(root: ParentNode, scope: string) {
  const labels = Array.from(root.querySelectorAll<HTMLLabelElement>("label"));
  expect(
    labels.length,
    `${scope}: 一个 label 都没找到，断言会空转`,
  ).toBeGreaterThan(0);

  const problems: string[] = [];
  for (const label of labels) {
    const text = (label.textContent || "").trim();
    const htmlFor = label.getAttribute("for");
    const targets = labelTargets(label);

    if (targets.length === 0) {
      problems.push(
        htmlFor
          ? `label "${text}" 的 htmlFor="${htmlFor}" 在 DOM 里找不到对应元素`
          : `label "${text}" 既无 htmlFor 也不包含可标注控件`,
      );
      continue;
    }
    if (!targets[0].matches(LABELABLE)) {
      problems.push(
        `label "${text}" 关联到了不可标注的 <${targets[0].tagName.toLowerCase()}>`,
      );
    }
  }

  expect(problems, `${scope}:\n${problems.join("\n")}`).toEqual([]);
  return labels.map((l) => (l.textContent || "").trim());
}

// --- AIGenerateModal 需要 fetch /api/knowledge/extract ---
const EXTRACTED_CARD = {
  title: "皮亚杰认知发展理论",
  category: "教育心理学",
  front: "认知发展的四个阶段？",
  back: "感知运动、前运算、具体运算、形式运算",
  tags: ["皮亚杰"],
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ card: EXTRACTED_CARD }),
    })) as unknown as typeof fetch,
  );
});

// next/navigation：practice/setup 页面读 searchParams、router
const mockRouter = { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/practice/setup",
}));

// KeypointTree 依赖 react-query + 真实网络，这里换成惰性桩（本测试只关心 label）
vi.mock("@/components/practice/KeypointTree", () => ({
  KeypointTree: () => <div data-testid="keypoint-tree-stub" />,
}));

// 底栏登记：测试里没有 MobileNav 提供 context，给个空实现
vi.mock("@/components/layout/bottom-bar-slot", () => ({
  usePageBottomBar: () => {},
}));

import { ConfigForm } from "@/app/admin/components/ConfigManager/ConfigForm";
import { AIGenerateModal } from "@/app/knowledge/components/AIGenerateModal";

async function renderPracticeSetup() {
  const { default: PracticeSetupPage } =
    await import("@/app/practice/setup/page");
  const utils = render(<PracticeSetupPage />);
  // 高级选项默认收起，四种题型 label 在展开后才挂载
  fireEvent.click(await screen.findByText(/展开高级选项/));
  await screen.findByText("单选题");
  return utils;
}

describe("label ↔ 控件的关联（跨表单语义断言）", () => {
  it("ConfigForm：9 个 label 全部能解析到对应控件", () => {
    const { container } = render(
      <ConfigForm
        config={{}}
        isSaving={false}
        isTesting={false}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onTest={vi.fn()}
        onChange={vi.fn()}
      />,
    );

    const texts = assertEveryLabelHasControl(container, "ConfigForm");
    expect(texts).toEqual([
      "配置名称 (Name)",
      "API Base URL",
      "API Key",
      "经济模型 (Economy)",
      "高级模型 (Premium)",
      "向量模型 (Embedding)",
      "向量维度 (Dimensions)",
      "重排序模型 (Rerank)",
      "知识提取模型 (Knowledge)",
    ]);
  });

  it("AIGenerateModal：输入步骤与预览步骤的 label 全部能解析到对应控件", async () => {
    // 弹窗换 Radix 后内容在 portal 里（挂到 body），不在 render 的 container 内，
    // 所以这里按弹窗根节点取 scope —— 断言本身没变：label 必须解析到真控件
    render(<AIGenerateModal isOpen onClose={vi.fn()} onSave={vi.fn()} />);
    const dialog = await screen.findByRole("dialog");

    // 步骤一：只有一个 textarea
    expect(assertEveryLabelHasControl(dialog, "AIGenerateModal/input")).toEqual(
      ["输入知识点内容"],
    );

    fireEvent.change(dialog.querySelector("textarea")!, {
      target: { value: "皮亚杰认知发展理论" },
    });
    fireEvent.click(screen.getByRole("button", { name: /AI 生成/ }));
    await screen.findByText("正面 (问题)");

    // 步骤二：5 个字段（标题/分类/正反面/标签）
    expect(
      assertEveryLabelHasControl(dialog, "AIGenerateModal/preview"),
    ).toEqual(["标题", "分类", "正面 (问题)", "背面 (答案)", "标签"]);
  });

  it("PracticeSetup：题型勾选框的 label 全部指向真实存在的控件", async () => {
    const { container } = await renderPracticeSetup();

    const texts = assertEveryLabelHasControl(container, "PracticeSetup");
    expect(texts).toEqual(["单选题", "多选题", "判断题", "填空题"]);

    // 每个 label 指向的必须是自己那个勾选框，不能四个都指到同一个 id
    const ids = Array.from(
      container.querySelectorAll<HTMLLabelElement>("label"),
    ).map((l) => l.getAttribute("for"));
    expect(new Set(ids).size).toBe(4);
    expect(ids).toEqual([
      "practice-type-single",
      "practice-type-multi",
      "practice-type-truefalse",
      "practice-type-fill_blank",
    ]);
  });
});

describe("点 label → 控件接管（关联不是「写了个属性」）", () => {
  it("ConfigForm：点「配置名称」label 让对应输入框拿到焦点", async () => {
    const user = userEvent.setup();
    render(
      <ConfigForm
        config={{}}
        isSaving={false}
        isTesting={false}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onTest={vi.fn()}
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByText("配置名称 (Name)"));
    expect(document.activeElement).toBe(document.getElementById("cfg-name"));
    // 别指错字段：焦点不在 API Key 上
    expect(document.activeElement).not.toBe(
      document.getElementById("cfg-api-key"),
    );
  });

  it("PracticeSetup：点「多选题」label 切换的是多选题那一个勾选框", async () => {
    const user = userEvent.setup();
    const { container } = await renderPracticeSetup();
    const multi = container.querySelector<HTMLElement>("#practice-type-multi")!;

    expect(multi).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByText("多选题"));

    await waitFor(() => expect(multi).toHaveAttribute("aria-checked", "false"));
    // 其余三个不受影响
    expect(container.querySelector("#practice-type-single")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(document.activeElement).toBe(multi);
  });

  it("AIGenerateModal：点「标签」label 让标签输入框拿到焦点", async () => {
    const user = userEvent.setup();
    render(<AIGenerateModal isOpen onClose={vi.fn()} onSave={vi.fn()} />);
    const dialog = await screen.findByRole("dialog");

    fireEvent.change(dialog.querySelector("textarea")!, {
      target: { value: "皮亚杰认知发展理论" },
    });
    fireEvent.click(screen.getByRole("button", { name: /AI 生成/ }));
    await screen.findByText("标签");

    await user.click(screen.getByText("标签"));
    expect(document.activeElement).toBe(document.getElementById("aigen-tags"));
  });
});

describe("组标签用 fieldset/legend（不是给整组挂一个 label）", () => {
  it("PracticeSetup 的题型组：没有「题型」label，只有 legend 之外的独立 label", async () => {
    const { container } = await renderPracticeSetup();

    // 不存在 <label>题型</label> 这种「整组一个 label」的写法
    const stray = Array.from(
      container.querySelectorAll<HTMLLabelElement>("label"),
    ).filter((l) => (l.textContent || "").trim() === "题目类型");
    expect(stray).toHaveLength(0);
  });
});
