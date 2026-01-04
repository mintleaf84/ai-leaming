'use server';

import db from '@/lib/db';
import { requireUser } from '@/lib/auth/auth';

// 筛选参数类型
export type HistoryFilter = {
  dateFrom?: string;       // 开始日期 YYYY-MM-DD
  dateTo?: string;         // 结束日期 YYYY-MM-DD
  accuracyMin?: number;    // 最低正确率
  accuracyMax?: number;    // 最高正确率
  mode?: string;           // 练习模式
  page?: number;           // 页码 (从1开始)
  pageSize?: number;       // 每页数量
};

export type SessionHistoryItem = {
  id: string;
  sessionName?: string;      // 会话名称
  totalQuestions: number;
  correctCount: number;
  reviewCount: number;
  createdAt: string;
  accuracy: number;
  practiceMode?: string;   // 练习模式
};

export type PaginatedHistory = {
  items: SessionHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function getSessionHistoryAction(filter?: HistoryFilter): Promise<PaginatedHistory> {
  try {
    const user = await requireUser();
    const page = filter?.page || 1;
    const pageSize = filter?.pageSize || 10;
    const offset = (page - 1) * pageSize;

    // 构建动态 WHERE 子句
    const conditions: string[] = ['user_id = ?'];
    const params: any[] = [user.id];

    if (filter?.dateFrom) {
      conditions.push('date(created_at) >= date(?)');
      params.push(filter.dateFrom);
    }
    if (filter?.dateTo) {
      conditions.push('date(created_at) <= date(?)');
      params.push(filter.dateTo);
    }
    if (filter?.mode) {
      conditions.push('practice_mode = ?');
      params.push(filter.mode);
    }

    const whereClause = conditions.join(' AND ');

    // 获取总数
    const countRow = db.prepare(`
      SELECT COUNT(*) as count FROM practice_sessions WHERE ${whereClause}
    `).get(...params) as { count: number };

    // 获取分页数据
    const rows = db.prepare(`
      SELECT id, session_name as sessionName, total_questions as totalQuestions, correct_count as correctCount, 
             review_count as reviewCount, created_at as createdAt,
             practice_mode as practiceMode
      FROM practice_sessions 
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as any[];

    // 计算正确率并过滤
    let items = rows.map(r => ({
      ...r,
      accuracy: r.totalQuestions > 0 ? Math.round((r.correctCount / r.totalQuestions) * 100) : 0
    }));

    // 正确率筛选 (在应用层处理，因为 accuracy 是计算字段)
    if (filter?.accuracyMin !== undefined) {
      items = items.filter(i => i.accuracy >= filter.accuracyMin!);
    }
    if (filter?.accuracyMax !== undefined) {
      items = items.filter(i => i.accuracy <= filter.accuracyMax!);
    }

    return {
      items,
      total: countRow.count,
      page,
      pageSize,
      totalPages: Math.ceil(countRow.count / pageSize)
    };
  } catch (error) {
    console.error("Failed to fetch session history:", error);
    return { items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };
  }
}

// 获取可用的练习模式列表
export async function getAvailableModesAction(): Promise<string[]> {
  try {
    const user = await requireUser();
    const rows = db.prepare(`
      SELECT DISTINCT practice_mode FROM practice_sessions 
      WHERE user_id = ? AND practice_mode IS NOT NULL
    `).all(user.id) as { practice_mode: string }[];
    return rows.map(r => r.practice_mode).filter(Boolean);
  } catch {
    return [];
  }
}

export type SessionDetail = {
  session: SessionHistoryItem;
  logs: {
    questionContent: string;
    options: string[];           // 选项
    correctAnswer: string;       // 正确答案
    userAnswer: string;
    isCorrect: boolean;
    duration: number;
    tags: string[];              // 考点
    source: string;              // 来源
    explanation: string;         // 解析
    correctRatio: number | null; // 全站正确率
    mostWrongAnswer: string | null; // 易错项
    reviewData?: any;
  }[];
};

export async function getSessionDetailAction(sessionId: string): Promise<SessionDetail | null> {
  try {
    const user = await requireUser();
    const sessionRow = db.prepare(`
      SELECT id, total_questions as totalQuestions, correct_count as correctCount, 
             review_count as reviewCount, created_at as createdAt 
      FROM practice_sessions WHERE id = ? AND user_id = ?
    `).get(sessionId, user.id) as any;

    if (!sessionRow) return null;

    const logs = db.prepare(`
      SELECT q.content as questionContent, q.options, q.answer as correctAnswer,
             l.user_answer as userAnswer, l.is_correct as isCorrect, l.duration_ms as duration, 
             q.tags, q.source, q.explanation, q.correct_ratio, q.most_wrong_answer,
             r.review_data as reviewData
      FROM practice_logs l
      JOIN questions q ON l.question_id = q.id
      LEFT JOIN session_reviews r ON l.session_id = r.session_id AND l.question_id = r.question_id
      WHERE l.session_id = ?
    `).all(sessionId) as any[];

    return {
      session: {
        ...sessionRow,
        accuracy: sessionRow.totalQuestions > 0 ? Math.round((sessionRow.correctCount / sessionRow.totalQuestions) * 100) : 0
      },
      logs: logs.map(l => ({
        questionContent: l.questionContent,
        options: JSON.parse(l.options || '[]'),
        correctAnswer: l.correctAnswer || '',
        userAnswer: l.userAnswer || '',
        isCorrect: !!l.isCorrect,
        duration: l.duration || 0,
        tags: JSON.parse(l.tags || '[]'),
        source: l.source || '',
        explanation: l.explanation || '',
        correctRatio: l.correct_ratio,
        mostWrongAnswer: l.most_wrong_answer,
        reviewData: l.reviewData ? JSON.parse(l.reviewData) : undefined
      }))
    };
  } catch (error) {
    console.error("Failed to fetch session detail:", error);
    return null;
  }
}

export async function deleteSessionAction(sessionId: string) {
  try {
    const user = await requireUser();

    // Check ownership
    const session = db.prepare('SELECT id FROM practice_sessions WHERE id = ? AND user_id = ?').get(sessionId, user.id);
    if (!session) {
      return { success: false, message: "权限不足或会话不存在" };
    }

    // 开启事务确保数据完整性
    const deleteReviews = db.prepare('DELETE FROM session_reviews WHERE session_id = ?');
    const deleteLogs = db.prepare('DELETE FROM practice_logs WHERE session_id = ? AND user_id = ?');
    const deleteSession = db.prepare('DELETE FROM practice_sessions WHERE id = ? AND user_id = ?');

    const transaction = db.transaction((id: string, uid: number) => {
      deleteReviews.run(id);
      deleteLogs.run(id, uid);
      deleteSession.run(id, uid);
    });

    transaction(sessionId, user.id);
    return { success: true };
  } catch (error) {
    console.error("Failed to delete session:", error);
    return { success: false, message: "删除失败，请稍后重试" };
  }
}

/**
 * 重命名练习会话
 */
export async function renameSessionAction(sessionId: string, newName: string) {
  try {
    const user = await requireUser();

    // 检查权限
    const session = db.prepare('SELECT id FROM practice_sessions WHERE id = ? AND user_id = ?').get(sessionId, user.id);
    if (!session) {
      return { success: false, message: "权限不足或会话不存在" };
    }

    // 更新名称
    db.prepare('UPDATE practice_sessions SET session_name = ? WHERE id = ?').run(newName.trim() || null, sessionId);

    return { success: true };
  } catch (error) {
    console.error("Failed to rename session:", error);
    return { success: false, message: "重命名失败，请稍后重试" };
  }
}

