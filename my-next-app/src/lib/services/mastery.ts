import db from '@/lib/db';

const DIMENSION_ORDER = ['knowledge', 'understanding', 'application'] as const;
type Dimension = typeof DIMENSION_ORDER[number];

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

export const masteryService = {
  /**
   * 更新指定标签的掌握度（准确率算法）
   * score = (correct_count / total_count) × 100
   */
  updateMastery: (userId: number, tagName: string, _dimension: Dimension, isCorrect: boolean, isMonitoredCorrect: boolean = false): MasteryUpdateResult[] => {
    const incCorrect = (isCorrect && !isMonitoredCorrect) ? 1 : 0;
    
    // 1. 原子化更新 (Thread Safe)
    // 核心逻辑：直接在数据库层面进行累加计算，避开 JS 层的竞态
    db.prepare(`
      INSERT INTO user_mastery (user_id, tag_name, score, correct_count, total_count, last_updated) 
      VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, tag_name) DO UPDATE SET 
        correct_count = user_mastery.correct_count + excluded.correct_count,
        total_count = user_mastery.total_count + 1,
        score = (CAST(user_mastery.correct_count + excluded.correct_count AS FLOAT) / (user_mastery.total_count + 1)) * 100,
        last_updated = CURRENT_TIMESTAMP
    `).run(userId, tagName, incCorrect ? 100 : 0, incCorrect);

    // 2. 获取更新后的结果用于返回 (仅供 UI 反馈)
    const updated = db.prepare(
      'SELECT score FROM user_mastery WHERE user_id = ? AND tag_name = ?'
    ).get(userId, tagName) as { score: number };

    return [{ 
      tagName, 
      previousScore: 0, // 由于是原子操作，前置分数不再保留以换取性能
      newScore: updated.score, 
      change: 0 
    }];
  },

  getMastery: (userId: number, tagName: string): number => {
    const row = db.prepare('SELECT score FROM user_mastery WHERE user_id = ? AND tag_name = ?').get(userId, tagName) as { score: number } | undefined;
    return row?.score ?? 0;
  },

  /**
   * 获取某个知识点及其所有子知识点的平均掌握度
   */
  getHierarchyMastery: (userId: number, parentPath: string): { avgScore: number; count: number } => {
    const result = db.prepare(`
      SELECT AVG(score) as avgScore, COUNT(*) as count 
      FROM user_mastery 
      WHERE user_id = ? AND (tag_name = ? OR tag_name LIKE ?)
    `).get(userId, parentPath, parentPath + '/%') as { avgScore: number | null; count: number };
    return { avgScore: result.avgScore ?? 0, count: result.count };
  },

  /**
   * 获取知识点树形结构
   */
  getMasteryTree: (userId: number): MasteryTreeNode[] => {
    const rows = db.prepare(`
      SELECT tag_name, score 
      FROM user_mastery 
      WHERE user_id = ?
      ORDER BY tag_name
    `).all(userId) as { tag_name: string; score: number }[];

    // 构建树形结构
    const nodeMap = new Map<string, MasteryTreeNode>();
    const roots: MasteryTreeNode[] = [];

    for (const row of rows) {
      const parts = row.tag_name.split('/');
      const node: MasteryTreeNode = {
        name: parts[parts.length - 1],
        path: row.tag_name,
        score: row.score,
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
