'use server';

import db from '@/lib/db';
import { requireUser } from '@/lib/auth';

// 错题项类型
export type WrongQuestionItem = {
    questionId: string;
    questionContent: string;
    tags: string[];
    wrongCount: number;       // 答错次数
    lastWrongAt: string;      // 最近答错时间
    correctAnswer: string;    // 正确答案
    userLastAnswer: string;   // 用户最近答案
};

// 按知识点分组的错题
export type WrongQuestionsByTag = {
    tag: string;
    count: number;
    questions: WrongQuestionItem[];
};

// 获取错题列表（排除已标记为掌握的题目）
export async function getWrongQuestionsAction(): Promise<WrongQuestionItem[]> {
    try {
        const user = await requireUser();

        // 查询所有答错的题目，排除已掌握的，按错误次数排序
        const rows = db.prepare(`
      SELECT 
        l.question_id as questionId,
        q.content as questionContent,
        q.tags,
        q.answer as correctAnswer,
        COUNT(*) as wrongCount,
        MAX(l.timestamp) as lastWrongAt,
        (SELECT user_answer FROM practice_logs 
         WHERE question_id = l.question_id AND user_id = ? AND is_correct = 0 
         ORDER BY timestamp DESC LIMIT 1) as userLastAnswer
      FROM practice_logs l
      JOIN questions q ON l.question_id = q.id
      WHERE l.user_id = ? AND l.is_correct = 0
        AND l.question_id NOT IN (SELECT question_id FROM mastered_questions WHERE user_id = ?)
      GROUP BY l.question_id
      ORDER BY wrongCount DESC, lastWrongAt DESC
    `).all(user.id, user.id, user.id) as any[];

        return rows.map(r => ({
            questionId: r.questionId,
            questionContent: r.questionContent,
            tags: JSON.parse(r.tags || '[]'),
            wrongCount: r.wrongCount,
            lastWrongAt: r.lastWrongAt,
            correctAnswer: r.correctAnswer,
            userLastAnswer: r.userLastAnswer || ''
        }));
    } catch (error) {
        console.error("Failed to fetch wrong questions:", error);
        return [];
    }
}

// 获取按知识点分组的错题
export async function getWrongQuestionsByTagAction(): Promise<WrongQuestionsByTag[]> {
    try {
        const questions = await getWrongQuestionsAction();

        // 按标签分组
        const tagMap = new Map<string, WrongQuestionItem[]>();

        questions.forEach(q => {
            q.tags.forEach(tag => {
                if (!tagMap.has(tag)) {
                    tagMap.set(tag, []);
                }
                tagMap.get(tag)!.push(q);
            });
        });

        // 转换为数组并按数量排序
        return Array.from(tagMap.entries())
            .map(([tag, questions]) => ({
                tag,
                count: questions.length,
                questions
            }))
            .sort((a, b) => b.count - a.count);
    } catch (error) {
        console.error("Failed to fetch wrong questions by tag:", error);
        return [];
    }
}

// 获取错题统计
export async function getWrongQuestionsStatsAction() {
    try {
        const user = await requireUser();

        // 总错题数
        const totalRow = db.prepare(`
      SELECT COUNT(DISTINCT question_id) as count
      FROM practice_logs
      WHERE user_id = ? AND is_correct = 0
    `).get(user.id) as { count: number };

        // 最近7天新增错题
        const recentRow = db.prepare(`
      SELECT COUNT(DISTINCT question_id) as count
      FROM practice_logs
      WHERE user_id = ? AND is_correct = 0 
      AND date(timestamp) >= date('now', '-7 days')
    `).get(user.id) as { count: number };

        // 高频错题数 (错2次以上)
        const frequentRow = db.prepare(`
      SELECT COUNT(*) as count FROM (
        SELECT question_id, COUNT(*) as cnt
        FROM practice_logs
        WHERE user_id = ? AND is_correct = 0
        GROUP BY question_id
        HAVING cnt >= 2
      )
    `).get(user.id) as { count: number };

        return {
            total: totalRow.count,
            recent: recentRow.count,
            frequent: frequentRow.count
        };
    } catch (error) {
        console.error("Failed to fetch wrong questions stats:", error);
        return { total: 0, recent: 0, frequent: 0 };
    }
}

// 创建错题专项练习会话
export async function createWrongQuestionsPracticeAction(questionIds: string[]) {
    try {
        const user = await requireUser();

        if (questionIds.length === 0) {
            return { success: false, message: '请选择要练习的错题' };
        }

        // 创建练习会话
        const sessionId = `wrong-${Date.now()}`;

        db.prepare(`
      INSERT INTO practice_sessions (id, user_id, total_questions, correct_count, review_count, practice_mode, questions_json)
      VALUES (?, ?, ?, 0, 0, 'review', ?)
    `).run(sessionId, user.id, questionIds.length, JSON.stringify(questionIds));

        return { success: true, sessionId };
    } catch (error) {
        console.error("Failed to create wrong questions practice:", error);
        return { success: false, message: '创建练习失败' };
    }
}

// 错题详情类型（包含完整信息）
export type WrongQuestionDetail = WrongQuestionItem & {
    options: string[];           // 所有选项
    explanation: string;         // 解析
    questionType: string;        // 题目类型
    historyLogs: {               // 历史作答记录
        timestamp: string;
        userAnswer: string;
        isCorrect: boolean;
    }[];
};

// 获取错题详情（含历史作答记录）
export async function getWrongQuestionDetailAction(questionId: string): Promise<WrongQuestionDetail | null> {
    try {
        const user = await requireUser();

        // 获取题目基本信息
        const question = db.prepare(`
            SELECT 
                id, content, options, answer, explanation, tags, type
            FROM questions 
            WHERE id = ?
        `).get(questionId) as any;

        if (!question) {
            return null;
        }

        // 获取错误统计
        const wrongStats = db.prepare(`
            SELECT 
                COUNT(*) as wrongCount,
                MAX(timestamp) as lastWrongAt
            FROM practice_logs 
            WHERE question_id = ? AND user_id = ? AND is_correct = 0
        `).get(questionId, user.id) as any;

        // 获取历史作答记录
        const historyLogs = db.prepare(`
            SELECT 
                timestamp,
                user_answer as userAnswer,
                is_correct as isCorrect
            FROM practice_logs 
            WHERE question_id = ? AND user_id = ?
            ORDER BY timestamp DESC
            LIMIT 20
        `).all(questionId, user.id) as any[];

        // 获取用户最近一次错误答案
        const lastWrongAnswer = db.prepare(`
            SELECT user_answer 
            FROM practice_logs 
            WHERE question_id = ? AND user_id = ? AND is_correct = 0 
            ORDER BY timestamp DESC LIMIT 1
        `).get(questionId, user.id) as any;

        return {
            questionId: String(question.id),
            questionContent: question.content,
            options: JSON.parse(question.options || '[]'),
            correctAnswer: question.answer,
            explanation: question.explanation || '',
            tags: JSON.parse(question.tags || '[]'),
            questionType: question.type || 'single',
            wrongCount: wrongStats?.wrongCount || 0,
            lastWrongAt: wrongStats?.lastWrongAt || '',
            userLastAnswer: lastWrongAnswer?.user_answer || '',
            historyLogs: historyLogs.map(log => ({
                timestamp: log.timestamp,
                userAnswer: log.userAnswer,
                isCorrect: Boolean(log.isCorrect)
            }))
        };
    } catch (error) {
        console.error("Failed to fetch wrong question detail:", error);
        return null;
    }
}

// 标记错题为已掌握
export async function markAsMasteredAction(questionId: string, note?: string): Promise<{ success: boolean; message?: string }> {
    try {
        const user = await requireUser();

        db.prepare(`
            INSERT OR REPLACE INTO mastered_questions (user_id, question_id, note, mastered_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `).run(user.id, questionId, note || null);

        return { success: true };
    } catch (error) {
        console.error("Failed to mark as mastered:", error);
        return { success: false, message: '标记失败' };
    }
}

// 取消已掌握标记（恢复到错题本）
export async function unmarkMasteredAction(questionId: string): Promise<{ success: boolean; message?: string }> {
    try {
        const user = await requireUser();

        db.prepare(`
            DELETE FROM mastered_questions 
            WHERE user_id = ? AND question_id = ?
        `).run(user.id, questionId);

        return { success: true };
    } catch (error) {
        console.error("Failed to unmark mastered:", error);
        return { success: false, message: '取消标记失败' };
    }
}

// 获取已掌握的错题列表
export async function getMasteredQuestionsAction(): Promise<{
    questionId: string;
    questionContent: string;
    tags: string[];
    masteredAt: string;
    note: string | null;
}[]> {
    try {
        const user = await requireUser();

        const rows = db.prepare(`
            SELECT 
                m.question_id as questionId,
                q.content as questionContent,
                q.tags,
                m.mastered_at as masteredAt,
                m.note
            FROM mastered_questions m
            JOIN questions q ON m.question_id = q.id
            WHERE m.user_id = ?
            ORDER BY m.mastered_at DESC
        `).all(user.id) as any[];

        return rows.map(r => ({
            questionId: String(r.questionId),
            questionContent: r.questionContent,
            tags: JSON.parse(r.tags || '[]'),
            masteredAt: r.masteredAt,
            note: r.note
        }));
    } catch (error) {
        console.error("Failed to fetch mastered questions:", error);
        return [];
    }
}
