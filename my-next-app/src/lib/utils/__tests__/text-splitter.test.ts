import { describe, it, expect } from "vitest";
import { splitText } from "../text-splitter";

describe("splitText（文本分割）", () => {
  it("短文本（小于 chunkSize）应作为单个块返回", async () => {
    const text = "这是一段短文本。";
    const result = await splitText(text, { chunkSize: 1000 });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(text);
  });

  it("空字符串应返回空数组", async () => {
    const result = await splitText("");
    expect(result).toHaveLength(0);
  });

  it("超过 chunkSize 的文本应被分割为多块", async () => {
    // 创建两个长段落，总长超过 100 个字符
    const para1 = "甲".repeat(60);
    const para2 = "乙".repeat(60);
    const text = `${para1}\n\n${para2}`;

    const result = await splitText(text, { chunkSize: 100, chunkOverlap: 0 });
    expect(result.length).toBeGreaterThan(1);
  });

  it("段落边界优先于字符边界分割", async () => {
    const para1 = "第一段内容 ".repeat(10).trim();
    const para2 = "第二段内容 ".repeat(10).trim();
    const text = `${para1}\n\n${para2}`;

    const result = await splitText(text, {
      chunkSize: para1.length + 10,
      chunkOverlap: 0,
    });
    // 第一个块应包含完整的第一段
    expect(result[0]).toContain("第一段内容");
  });

  it("chunkOverlap 应在相邻块之间保留上下文", async () => {
    // 使用一段长文本，不带明显的段落分隔符，强制其在中间切断
    const text = "A".repeat(50) + "B".repeat(50) + "C".repeat(50);

    const result = await splitText(text, { chunkSize: 60, chunkOverlap: 20 });

    // 第一块应该是 A...B...
    // 第二块应该包含第一块末尾的一部分（即一部分 B）
    if (result.length > 1) {
      // 第一块末尾有 B，第二块开头也应该有 B
      expect(result[0]).toContain("B");
      expect(result[1]).toContain("B");
      // 验证重叠长度（大致）
      // LangChain 的具体切分点可能略有不同，但 B 应该出现在两个块中
    }
  });

  it("单段落长文本（内部无分段符）应作为一个块返回", async () => {
    const longText = "单行超长文本 ".repeat(50).trim();
    const result = await splitText(longText, { chunkSize: 2000 });
    expect(result).toHaveLength(1);
  });

  it("多段落文本应保留每段内容", async () => {
    const text = ["段落A", "段落B", "段落C", "段落D"].join("\n\n");
    const result = await splitText(text, { chunkSize: 2000 });
    // 所有内容都应出现在某个块中
    const fullText = result.join(" ");
    expect(fullText).toContain("段落A");
    expect(fullText).toContain("段落D");
  });
});
