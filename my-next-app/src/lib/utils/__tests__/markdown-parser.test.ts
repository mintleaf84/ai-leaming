import { describe, it, expect } from "vitest";
import { parseMarkdownToChapters } from "../markdown-parser";

describe("parseMarkdownToChapters（Markdown 解析为章节）", () => {
  it("应从 # 标题开始正确解析章节", () => {
    const md = "# 第一章\n\n这是第一章内容。\n\n## 第一节\n\n这是第一节内容。";
    const result = parseMarkdownToChapters(md);

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("第一章");
    expect(result[0].level).toBe(1);
    expect(result[0].content).toContain("第一章内容");
    expect(result[1].title).toBe("第一节");
    expect(result[1].level).toBe(2);
  });

  it("空字符串应返回空数组", () => {
    expect(parseMarkdownToChapters("")).toHaveLength(0);
  });

  it('无标题的纯文本应归入 "前言" 章节', () => {
    const md = "这是没有标题的内容。";
    const result = parseMarkdownToChapters(md);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("前言");
    expect(result[0].content).toContain("没有标题");
  });

  it('开头为标题时不应创建空的 "前言" 章节', () => {
    const md = "# 直接从标题开始\n\n内容在这里。";
    const result = parseMarkdownToChapters(md);
    expect(result[0].title).toBe("直接从标题开始");
    // 不应有空的前言
    expect(
      result.find((c) => c.title === "前言" && !c.content),
    ).toBeUndefined();
  });

  it("应正确解析 ### 三级标题", () => {
    const md = "# 一级\n## 二级\n### 三级\n内容";
    const result = parseMarkdownToChapters(md);
    const thirdLevel = result.find((c) => c.level === 3);
    expect(thirdLevel).toBeDefined();
    expect(thirdLevel!.title).toBe("三级");
  });

  it("连续多个同级标题应各自独立解析", () => {
    const md = "## 节一\n节一内容\n## 节二\n节二内容\n## 节三\n节三内容";
    const result = parseMarkdownToChapters(md);
    expect(result).toHaveLength(3);
    expect(result.map((c) => c.title)).toEqual(["节一", "节二", "节三"]);
  });

  it("章节内容应去除首尾空白", () => {
    const md = "# 标题\n\n\n  内容行  \n\n";
    const result = parseMarkdownToChapters(md);
    expect(result[0].content).toBe("内容行");
  });

  it("只有标题没有内容的章节 content 应为空字符串", () => {
    const md = "# 空章节";
    const result = parseMarkdownToChapters(md);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("");
  });

  it("不应解析代码块内部的 # 为章节标题", () => {
    const md =
      '# 第一章\n\n```python\n# 这是一个注释\nprint("Hello")\n```\n\n## 第二章';
    const result = parseMarkdownToChapters(md);

    // 如果解析正确，应该只有 2 个章节
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("第一章");
    expect(result[1].title).toBe("第二章");

    // 验证代码块内容被完整保留在第一章
    expect(result[0].content).toContain("```python");
    expect(result[0].content).toContain("# 这是一个注释");
  });
});
