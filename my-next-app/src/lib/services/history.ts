import { db } from '@/lib/db';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

// DB 行类型定义
type SessionRow = {
    id: number | string;
    sessionName?: string;
    totalQuestions: number;
    correctCount: number;
    reviewCount: number;
    createdAt: string;
    practiceMode?: string;
};

type SessionLogRow = {
    questionId: string;
    questionContent: string;
    options: string;
    correctAnswer: string;
    userAnswer: string;
    isCorrect: number;
    duration: number;
    tags: string;
    source: string;
    explanation: string;
    correct_ratio: number;
    most_wrong_answer: string;
    reviewData: string;
    ai_mnemonic: string | null;
    material: string | null;
    material_html: string | null;
};

export type HistoryFilter = {
    dateFrom?: string;       // YYYY-MM-DD
    dateTo?: string;         // YYYY-MM-DD
    accuracyMin?: number;
    accuracyMax?: number;
    mode?: string;
    page?: number;
    pageSize?: number;
};

export type SessionHistoryItem = {
    id: string;
    sessionName?: string;
    totalQuestions: number;
    correctCount: number;
    reviewCount: number;
    createdAt: string;
    accuracy: number;
    practiceMode?: string;
};

export type PaginatedHistory = {
    items: SessionHistoryItem[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
};

export const historyService = {
    /**
     * Get paginated practice history for a user
     */
    getHistory: async (userId: number, filter: HistoryFilter = {}): Promise<PaginatedHistory> => {
        const page = filter.page || 1;
        const pageSize = filter.pageSize || 10;
        const offset = (page - 1) * pageSize;

        // Build dynamic WHERE clause
        const conditions: string[] = ['user_id = ?'];
        const params: (string | number | null)[] = [userId];

        if (filter.dateFrom) {
            conditions.push('date(created_at) >= date(?)');
            params.push(filter.dateFrom);
        }
        if (filter.dateTo) {
            conditions.push('date(created_at) <= date(?)');
            params.push(filter.dateTo);
        }
        if (filter.mode) {
            conditions.push('practice_mode = ?');
            params.push(filter.mode);
        }

        if (filter.accuracyMin !== undefined) {
            conditions.push('(CASE WHEN total_questions > 0 THEN ROUND((CAST(correct_count AS FLOAT) / total_questions) * 100) ELSE 0 END) >= ?');
            params.push(filter.accuracyMin);
        }
        if (filter.accuracyMax !== undefined) {
            conditions.push('(CASE WHEN total_questions > 0 THEN ROUND((CAST(correct_count AS FLOAT) / total_questions) * 100) ELSE 0 END) <= ?');
            params.push(filter.accuracyMax);
        }

        const whereClause = conditions.join(' AND ');

        // Get Total Count
        const countRow = db.prepare(`
      SELECT COUNT(*) as count FROM practice_sessions WHERE ${whereClause}
    `).get(...params) as { count: number };

        // Get Paginated Data
        const rows = db.prepare(`
      SELECT id, session_name as sessionName, total_questions as totalQuestions, correct_count as correctCount, 
             review_count as reviewCount, created_at as createdAt,
             practice_mode as practiceMode
      FROM practice_sessions 
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as SessionRow[];

        // 정확도 계산 후 SessionHistoryItem 배열로 변환
        const items: SessionHistoryItem[] = rows.map(r => ({
            id: String(r.id),
            sessionName: r.sessionName,
            totalQuestions: r.totalQuestions,
            correctCount: r.correctCount,
            reviewCount: r.reviewCount,
            createdAt: dayjs.utc(r.createdAt).toISOString(),
            accuracy: r.totalQuestions > 0 ? Math.round((r.correctCount / r.totalQuestions) * 100) : 0,
            practiceMode: r.practiceMode,
        }));

        return {
            items,
            total: countRow.count,
            page,
            pageSize,
            totalPages: Math.ceil(countRow.count / pageSize)
        };
    },

    /**
     * Get details of a specific session
     */
    getSessionDetail: async (sessionId: string, userId: number) => {
        const sessionRow = db.prepare(`
        SELECT id, total_questions as totalQuestions, correct_count as correctCount, 
                review_count as reviewCount, created_at as createdAt,
                practice_mode as practiceMode, session_name as sessionName
        FROM practice_sessions WHERE id = ? AND user_id = ?
    `).get(sessionId, userId) as SessionRow | undefined;

        if (!sessionRow) return null;

        const logs = db.prepare(`
        SELECT l.question_id as questionId, q.content as questionContent, q.options, q.answer as correctAnswer,
                l.user_answer as userAnswer, l.is_correct as isCorrect, l.duration_ms as duration,
                q.tags, q.source, q.explanation, q.correct_ratio, q.most_wrong_answer,
                q.ai_mnemonic,
                q.material, q.material_html,
                r.review_data as reviewData
        FROM practice_logs l
        JOIN questions q ON l.question_id = q.id
        LEFT JOIN session_reviews r ON l.session_id = r.session_id AND l.question_id = r.question_id
        WHERE l.session_id = ?
    `).all(sessionId) as SessionLogRow[];

        return {
            session: {
                id: String(sessionRow.id),
                sessionName: sessionRow.sessionName,
                totalQuestions: sessionRow.totalQuestions,
                correctCount: sessionRow.correctCount,
                reviewCount: sessionRow.reviewCount,
                createdAt: dayjs.utc(sessionRow.createdAt).toISOString(),
                accuracy: sessionRow.totalQuestions > 0 ? Math.round((sessionRow.correctCount / sessionRow.totalQuestions) * 100) : 0,
                practiceMode: sessionRow.practiceMode,
            },
            logs: logs.map(l => ({
                questionId: l.questionId,
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
                reviewData: l.reviewData ? JSON.parse(l.reviewData) : undefined,
                aiMnemonic: l.ai_mnemonic || null,
                material: l.material || null,
                materialHtml: l.material_html || null
            }))
        };
    }
};
