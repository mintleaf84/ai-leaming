import db from './db';

const DIMENSION_ORDER = ['knowledge', 'understanding', 'application'] as const;
type Dimension = typeof DIMENSION_ORDER[number];

const BASE_CORRECT_SCORE = 10;
const BASE_INCORRECT_PENALTY = 30;
const MAX_SCORE = 100;
const MIN_SCORE = 0;

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
   * Update mastery for a specific tag and dimension
   */
  updateMastery: (userId: number, tagName: string, dimension: Dimension, isCorrect: boolean, isMonitoredCorrect: boolean = false): MasteryUpdateResult[] => {
    const results: MasteryUpdateResult[] = [];

    // 1. Get current score for the tag
    const currentEntry = db.prepare('SELECT score FROM user_mastery WHERE user_id = ? AND tag_name = ?').get(userId, tagName) as { score: number } | undefined;
    const currentScore = currentEntry?.score ?? 0;

    let change = 0;

    if (isCorrect) {
      // If suspicious (monitored correct), no score increase
      change = isMonitoredCorrect ? 0 : BASE_CORRECT_SCORE;
    } else {
      // High Mastery Protection: If score is 100, k=1. Otherwise k=3 (penalty is 30)
      const k = currentScore >= MAX_SCORE ? 1 : 3;
      change = -(BASE_CORRECT_SCORE * k);
    }

    let newScore = Math.max(MIN_SCORE, Math.min(MAX_SCORE + 10, currentScore + change));

    // Update the main tag
    db.prepare(`
      INSERT INTO user_mastery (user_id, tag_name, score, last_updated) 
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, tag_name) DO UPDATE SET 
        score = excluded.score,
        last_updated = CURRENT_TIMESTAMP
    `).run(userId, tagName, newScore);

    results.push({ tagName, previousScore: currentScore, newScore, change });

    // 2. Downward Penalty Logic
    if (!isCorrect && dimension === 'application') {
      const penaltyChange = -(currentScore * 0.3);
      const afterPenaltyScore = Math.max(MIN_SCORE, newScore + penaltyChange);

      db.prepare('UPDATE user_mastery SET score = ?, last_updated = CURRENT_TIMESTAMP WHERE user_id = ? AND tag_name = ?')
        .run(afterPenaltyScore, userId, tagName);

      results[0].newScore = afterPenaltyScore;
      results[0].change += penaltyChange;
    }

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
