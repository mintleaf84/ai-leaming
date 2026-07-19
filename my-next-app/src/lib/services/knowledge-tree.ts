/**
 * 知识体系树服务 - 处理知识点层级结构计算
 */

export interface KnowledgeNode {
  name: string;
  path: string; // 查询所需的完整路径
  children: KnowledgeNode[];
  count: number; // 该节点及其子节点下的题目总数
}

import { drizzleDb } from "@/lib/db";
import { questions } from "@/lib/db/drizzle-schema";
import { sql } from "drizzle-orm";

export const KnowledgeTreeService = {
  /**
   * 从数据库获取所有标签的聚合统计
   */
  async getAggregatedTags(): Promise<{ tag: string; count: number }[]> {
    const rawTags = await drizzleDb
      .select({
        tag: sql<string>`json_each.value`,
        count: sql<number>`count(*)`,
      })
      .from(sql`${questions} AS q, json_each(q.tags)`)
      .groupBy(sql`json_each.value`)
      .orderBy(sql`json_each.value`)
      .all();

    return rawTags as { tag: string; count: number }[];
  },

  /**
   * 将平铺的标签列表转换为树形结构
   * 标签格式示例: "数学/几何/三角形"
   * @param rawTags 包含标签名和题目计数的原始数据
   */
  buildKnowledgeTree(
    rawTags: { tag: string; count: number }[],
  ): KnowledgeNode[] {
    const root: KnowledgeNode[] = [];

    // 1. 构建基础树形结构
    rawTags.forEach(({ tag, count }) => {
      const parts = tag.split("/");
      let currentLevel = root;
      let currentPath = "";

      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        let existingNode = currentLevel.find((n) => n.name === part);

        if (!existingNode) {
          existingNode = {
            name: part,
            path: currentPath,
            children: [],
            count: 0,
          };
          currentLevel.push(existingNode);
        }

        // 如果是叶子节点，记录该标签的直接计数
        if (index === parts.length - 1) {
          existingNode.count += count;
        }

        currentLevel = existingNode.children;
      });
    });

    // 2. 递归汇总子节点计数到父节点
    this.recalculateNodeCounts(root);

    return root;
  },

  /**
   * 递归累加子节点的计数
   */
  recalculateNodeCounts(nodes: KnowledgeNode[]): number {
    let total = 0;
    for (const node of nodes) {
      if (node.children.length > 0) {
        // 中间节点的 count = 自身的直接计数 + 所有子节点的计数
        const childrenTotal = this.recalculateNodeCounts(node.children);
        node.count += childrenTotal;
      }
      total += node.count;
    }
    return total;
  },
};
