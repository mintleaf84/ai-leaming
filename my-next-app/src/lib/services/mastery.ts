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
    const results: MasteryUpdateResult[] = [];

    // 1. 获取当前数据
    const currentEntry = db.prepare(
      'SELECT score, correct_count, total_count FROM user_mastery WHERE user_id = ? AND tag_name = ?'
    ).get(userId, tagName) as { score: number; correct_count: number; total_count: number } | undefined;

    const previousScore = currentEntry?.score ?? 0;
    const currentCorrect = currentEntry?.correct_count ?? 0;
    const currentTotal = currentEntry?.total_count ?? 0;

    // 2. 更新计数
    // 可疑答对（监控正确）时：不增加正确数，但增加总数
    let newCorrect = currentCorrect;
    if (isCorrect && !isMonitoredCorrect) {
      newCorrect = currentCorrect + 1;
    }
    const newTotal = currentTotal + 1;

    // 3. 计算新分数（准确率 × 100）
    const newScore = newTotal > 0 ? (newCorrect / newTotal) * 100 : 0;
    const change = newScore - previousScore;

    // 4. 更新数据库
    db.prepare(`
      INSERT INTO user_mastery (user_id, tag_name, score, correct_count, total_count, last_updated) 
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, tag_name) DO UPDATE SET 
        score = excluded.score,
        correct_count = excluded.correct_count,
        total_count = excluded.total_count,
        last_updated = CURRENT_TIMESTAMP
    `).run(userId, tagName, newScore, newCorrect, newTotal);

    results.push({ tagName, previousScore, newScore, change });

    return results;
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
