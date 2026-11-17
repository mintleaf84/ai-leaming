import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { TagSelector } from "../TagSelector";

/**
 * 新建标签 + IME 组合态（docs/ux-a11y-audit.md §3.1）：
 * 拼音输入 "jiao" 时按 Enter 是确认候选词，不能建出一个名为 "jiao" 的标签。
 *
 * 服务端动作按 `docs/engineering.md` 的测试惯例整体 mock：这里测的是键盘事件
 * 的分流，不是 action 本身（action 有自己的集成测试）。
 */
vi.mock("@/server/actions/note-tag", () => ({
  getTagsAction: vi.fn(async () => ({ success: true, tags: [] })),
  createTagAction: vi.fn(async () => ({ success: true, tagId: 1 })),
  getNoteTagsAction: vi.fn(async () => ({ success: true, tags: [] })),
  setNoteTagsAction: vi.fn(async () => ({ success: true })),
}));

import { createTagAction } from "@/server/actions/note-tag";

describe("TagSelector 新建标签 IME 组合态", () => {
  beforeEach(() => {
    vi.mocked(createTagAction).mockClear();
  });

  async function openAndType(value: string) {
    render(<TagSelector noteId={1} />);
    fireEvent.click(screen.getByRole("button", { name: "添加标签" }));
    const input = await screen.findByPlaceholderText("新建标签...");
    fireEvent.change(input, { target: { value } });
    return input;
  }

  it("组合态（isComposing）按 Enter 不创建标签", async () => {
    const input = await openAndType("jiao");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(createTagAction).not.toHaveBeenCalled();
  });

  it("组合态（keyCode 229）按 Enter 不创建标签", async () => {
    const input = await openAndType("jiao");
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(createTagAction).not.toHaveBeenCalled();
  });

  it("反证：非组合态的普通 Enter 仍然创建标签", async () => {
    const input = await openAndType("教综");
    fireEvent.keyDown(input, { key: "Enter", isComposing: false });
    expect(createTagAction).toHaveBeenCalledWith("教综");
  });
});
