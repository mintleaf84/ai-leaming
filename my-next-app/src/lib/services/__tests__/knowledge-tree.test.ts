import { describe, it, expect } from "vitest";
import { KnowledgeTreeService } from "../knowledge-tree";

describe("KnowledgeTreeService - buildKnowledgeTree", () => {
  it("应该能处理平铺的标签", () => {
    const raw = [
      { tag: "A/B/C", count: 2 },
      { tag: "A/B/D", count: 3 },
    ];
    const tree = KnowledgeTreeService.buildKnowledgeTree(raw);

    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("A");
    expect(tree[0].count).toBe(5); // 2 + 3
    expect(tree[0].children[0].name).toBe("B");
    expect(tree[0].children[0].count).toBe(5);
    expect(tree[0].children[0].children).toHaveLength(2);
  });

  it("应该能处理具有不同深度的路径", () => {
    const raw = [
      { tag: "一级", count: 10 },
      { tag: "一级/二级", count: 5 },
    ];
    const tree = KnowledgeTreeService.buildKnowledgeTree(raw);

    const root = tree.find((n) => n.name === "一级");
    expect(root?.count).toBe(15);
    expect(root?.children[0].name).toBe("二级");
    expect(root?.children[0].count).toBe(5);
  });

  it("应该能正确累加多条支路的计数", () => {
    const raw = [
      { tag: "Java/基础", count: 10 },
      { tag: "Java/进阶", count: 5 },
      { tag: "Python", count: 8 },
    ];
    const tree = KnowledgeTreeService.buildKnowledgeTree(raw);

    const java = tree.find((n) => n.name === "Java");
    expect(java?.count).toBe(15);
    const python = tree.find((n) => n.name === "Python");
    expect(python?.count).toBe(8);
  });

  it("空输入应该返回空数组", () => {
    expect(KnowledgeTreeService.buildKnowledgeTree([])).toEqual([]);
  });
});
