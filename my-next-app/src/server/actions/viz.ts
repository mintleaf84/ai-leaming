'use server';

import db from '@/lib/db';
import { requireUser } from '@/lib/auth/auth';

// ... existing actions

export interface KnowledgeNode {
  id: string;
  group: number;
  score: number;
}

export interface KnowledgeLink {
  source: string;
  target: string;
  value: number;
}

export interface KnowledgeGraphData {
  nodes: KnowledgeNode[];
  links: KnowledgeLink[];
}

export async function getKnowledgeGraphData(): Promise<KnowledgeGraphData> {
  const user = await requireUser();
  const masteryData = db.prepare('SELECT tag_name, score FROM user_mastery WHERE user_id = ?').all(user.id) as { tag_name: string; score: number }[];

  const nodes: KnowledgeNode[] = [
    { id: "核心知识体系", group: 0, score: 100 }
  ];
  const links: KnowledgeLink[] = [];

  // 1. 构建节点映射 (path -> score)
  const nodeMap = new Map<string, { score: number; count: number; childrenCounts: number; childrenScoreSum: number }>();

  // 初始化根节点
  nodeMap.set("核心知识体系", { score: 100, count: 1, childrenCounts: 0, childrenScoreSum: 0 });

  // 2. 预处理：聚合所有路径的所有节点
  // 遍历所有实际存在的掌握度数据
  masteryData.forEach(m => {
    // 路径: "A/B/C" -> ["A", "B", "C"]
    const parts = m.tag_name.split('/');

    // 遍历路径中的每一级
    // 0: A
    // 1: A/B
    // 2: A/B/C
    let currentPath = "";
    let parentPath = "核心知识体系";

    for (let i = 0; i < parts.length; i++) {
      const nodeName = parts.slice(0, i + 1).join('/'); // 使用完整路径作为 ID
      currentPath = nodeName;

      // 当前节点名称（用于显示）
      // id 必须是唯一的完整路径，但我们之后可能需要用 displayName 来显示

      // 如果节点尚未记录，初始化
      if (!nodeMap.has(currentPath)) {
        nodeMap.set(currentPath, { score: 0, count: 0, childrenCounts: 0, childrenScoreSum: 0 });
      }

      // 如果是叶子节点（当前条目对应的节点），设置分数
      // 注意：中间节点也会有自己的条目（如果存在），所以这里会覆盖 0
      if (nodeName === m.tag_name) {
        const node = nodeMap.get(currentPath)!;
        node.score = m.score;
        node.count = 1;
      }

      // 建立父子关系（用于构建边），临时记录
      // 我们不需要重复添加边，所以用 Set 或者最后再构建边
    }
  });

  // 3. 构建图结构 (Nodes & Links)
  // 为了计算中间节点的分数，我们再次遍历所有数据建立层级
  // 由于数据量不大，我们直接再次遍历构建边和节点
  const addedNodes = new Set<string>();
  addedNodes.add("核心知识体系");

  // 重新遍历，这次只负责添加节点和边
  masteryData.forEach(m => {
    const parts = m.tag_name.split('/');
    let parentId = "核心知识体系";

    for (let i = 0; i < parts.length; i++) {
      const currentId = parts.slice(0, i + 1).join('/'); // 完整路径作为 ID
      const displayName = parts[i]; // 显示名称

      // 添加节点
      if (!addedNodes.has(currentId)) {
        // 查找分数：如果是叶子或已有分数则使用，否则（纯中间节点）默认为 100 或后续计算
        const nodeData = nodeMap.get(currentId);
        // 知识点 ID 使用短名称展示太容易重名，前端最好修改为显示 displayName
        // 这里我们 ID 存完整路径，前端修改显示逻辑
        nodes.push({
          id: currentId, // 唯一标识
          group: i === 0 ? 1 : 2, // 1级分类是 group 1, 其他是 2
          score: nodeData?.count ? nodeData.score : 0 // 如果没有分数（纯结构节点），暂存 0
        });
        addedNodes.add(currentId);
      }

      // 添加边 (每个关系只添加一次)
      // 需要防止重复添加同一条边
      const linkExists = links.some(l => l.source === parentId && l.target === currentId);
      if (!linkExists) {
        links.push({ source: parentId, target: currentId, value: i === 0 ? 2 : 1 });
      }

      parentId = currentId;
    }
  });

  return { nodes, links };
}
