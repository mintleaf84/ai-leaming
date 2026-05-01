import { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, and, sql, or, like } from 'drizzle-orm';

type Dimension = 'knowledge' | 'understanding' | 'application';

export interface MasteryUpdateResult {
  tagName: string;
  previousScore: number;
  newScore: number;
  change: number;
}

export interface MasteryTreeNode {
  name: string;       // 当前节点名称
  path: string;       // 完整路径
  score: number;      // 掌握度分数
  level: number;      // 层级深度（0=根）
  children: MasteryTreeNode[];
}

/**
 * 掌握度服务 (Drizzle LibSQL 版)
 */
export const masteryService = {
  /**
   * 更新指定标签的掌握度（准确率算法）
   * score = (correct_count / total_count) × 100
   */
  updateMastery: async (userId: number, tagName: string, _dimension: Dimension, isCorrect: boolean, isMonitoredCorrect: boolean = false): Promise<MasteryUpdateResult[]> => {
    const incCorrect = (isCorrect && !isMonitoredCorrect) ? 1 : 0;

    // 1. 先读取当前状态
    const [current] = await drizzleDb.select()
      .from(drizzleSchema.user_mastery)
      .where(and(
        eq(drizzleSchema.user_mastery.user_id, userId),
        eq(drizzleSchema.user_mastery.tag_name, tagName)
      ))
      .limit(1);

    const prevCorrect = current?.correct_count ?? 0;
    const prevTotal = current?.total_count ?? 0;
    const previousScore = current?.score ?? 0;

    // 2. 在 JS 层计算新分数
    const newCorrect = prevCorrect + incCorrect;
    const newTotal = prevTotal + 1;
    const newScore = (newCorrect / newTotal) * 100;

    // 3. 原子化写入 (Upsert)
    await drizzleDb.insert(drizzleSchema.user_mastery).values({
      user_id: userId,
      tag_name: tagName,
      score: newScore,
      correct_count: newCorrect,
      total_count: newTotal,
      last_updated: sql`CURRENT_TIMESTAMP`
    }).onConflictDoUpdate({
      target: [drizzleSchema.user_mastery.user_id, drizzleSchema.user_mastery.tag_name],
      set: {
        correct_count: newCorrect,
        total_count: newTotal,
        score: newScore,
        last_updated: sql`CURRENT_TIMESTAMP`
      }
    });

    return [{ 
      tagName, 
      previousScore,
      newScore,
      change: newScore - previousScore,
    }];
  },

  /**
   * 获取单体掌握度
   */
  getMastery: async (userId: number, tagName: string): Promise<number> => {
    const [row] = await drizzleDb.select({ score: drizzleSchema.user_mastery.score })
      .from(drizzleSchema.user_mastery)
      .where(and(
        eq(drizzleSchema.user_mastery.user_id, userId),
        eq(drizzleSchema.user_mastery.tag_name, tagName)
      ))
      .limit(1);
    return row?.score ?? 0;
  },

  /**
   * 获取某个知识点及其所有子知识点的平均掌握度
   */
  getHierarchyMastery: async (userId: number, parentPath: string): Promise<{ avgScore: number; count: number }> => {
    const [result] = await drizzleDb.select({ 
        avgScore: sql<number>`AVG(${drizzleSchema.user_mastery.score})`, 
        count: sql<number>`COUNT(*)` 
      })
      .from(drizzleSchema.user_mastery)
      .where(and(
        eq(drizzleSchema.user_mastery.user_id, userId),
        or(
          eq(drizzleSchema.user_mastery.tag_name, parentPath),
          like(drizzleSchema.user_mastery.tag_name, parentPath + '/%')
        )
      ));
    return { avgScore: result?.avgScore ?? 0, count: result?.count ?? 0 };
  },

  /**
   * 获取知识点树形结构
   */
  getMasteryTree: async (userId: number): Promise<MasteryTreeNode[]> => {
    const rows = await drizzleDb.select({ 
        tag_name: drizzleSchema.user_mastery.tag_name, 
        score: drizzleSchema.user_mastery.score 
      })
      .from(drizzleSchema.user_mastery)
      .where(eq(drizzleSchema.user_mastery.user_id, userId))
      .orderBy(drizzleSchema.user_mastery.tag_name);

    // 构建树形结构
    const nodeMap = new Map<string, MasteryTreeNode>();
    const roots: MasteryTreeNode[] = [];

    for (const row of rows) {
      const parts = row.tag_name.split('/');
      const node: MasteryTreeNode = {
        name: parts[parts.length - 1],
        path: row.tag_name,
        score: row.score || 0,
        level: parts.length - 1,
        children: []
      };
      nodeMap.set(row.tag_name, node);

      // 找到父节点
      if (parts.length === 1) {
        roots.push(node);
      } else {
        const parentPath = parts.slice(0, -1).join('/');
        const parent = nodeMap.get(parentPath);
        if (parent) {
          parent.children.push(node);
        } else {
          roots.push(node); // 父节点不存在时作为根节点
        }
      }
    }

    return roots;
  }
};
