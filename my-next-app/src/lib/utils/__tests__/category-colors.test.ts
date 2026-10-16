import { describe, it, expect } from "vitest";
import { getCategoryColor, CATEGORY_COLORS } from "../category-colors";

describe("getCategoryColor（分类颜色工具）", () => {
  it("空字符串应返回第一个颜色（索引 0）", () => {
    expect(getCategoryColor("")).toEqual(CATEGORY_COLORS[0]);
  });

  it("相同分类名称应始终返回相同颜色", () => {
    const color1 = getCategoryColor("数学");
    const color2 = getCategoryColor("数学");
    expect(color1).toEqual(color2);
  });

  it("不同分类名称可能返回不同颜色", () => {
    // 确保不同输入有时会映射到不同颜色
    const results = new Set(
      ["语文", "数学", "英语", "物理", "化学", "生物"].map((c) =>
        JSON.stringify(getCategoryColor(c)),
      ),
    );
    // 至少有超过 1 种颜色被使用
    expect(results.size).toBeGreaterThan(1);
  });

  it("返回值应包含 bg 和 text 属性", () => {
    const color = getCategoryColor("任意分类");
    expect(color).toHaveProperty("bg");
    expect(color).toHaveProperty("text");
  });

  it("返回值应是 CATEGORY_COLORS 中的有效元素", () => {
    const color = getCategoryColor("测试分类");
    expect(CATEGORY_COLORS).toContainEqual(color);
  });

  it("单字符分类名应正常处理", () => {
    const color = getCategoryColor("A");
    expect(CATEGORY_COLORS).toContainEqual(color);
  });

  it("长分类名应正常处理", () => {
    const longName = "这是一个非常长的分类名称测试字符串";
    const color = getCategoryColor(longName);
    expect(CATEGORY_COLORS).toContainEqual(color);
  });

  it("CATEGORY_COLORS 数组应包含预设的 6 种颜色", () => {
    expect(CATEGORY_COLORS).toHaveLength(6);
  });
});
