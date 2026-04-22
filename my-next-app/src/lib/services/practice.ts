
import { db } from '@/lib/db';
import { Question, Dimension } from '@/types';
import { safeGet, safeAll } from '@/lib/db/safe-query';
import { PracticeSessionRowSchema, QuestionRowSchema } from '@/lib/schemas';
import { z } from 'zod';

export interface PracticeSessionConfig {
    mode: 'random' | 'wrong' | 'tag' | 'first-principles';
    limit: number;
    types?: string[];
    tags?: string[];
    dimensions?: string[];
    enableReview?: boolean;
    enableTimer?: boolean;
}

export const practiceService = {
    /**
     * Resumes the latest valid session for a user
     */
    async resumeSession(userId: number) {
        const lastSession = safeGet(
            db.prepare(`
          SELECT * FROM practice_sessions 
          WHERE user_id = ? AND created_at > datetime('now', '-1 day') 
          ORDER BY created_at DESC LIMIT 1
        `),
            [userId],
            PracticeSessionRowSchema
        );

        if (lastSession && lastSession.questions_json) {
            const logCount = safeGet(
                db.prepare('SELECT count(*) as count FROM practice_logs WHERE session_id = ?'),
                [lastSession.id],
                z.object({ count: z.number() })
            );

            // If not finished (logs < total), resume it
            if (logCount && logCount.count < lastSession.total_questions) {
                return {
                    questions: lastSession.questions_json as unknown as Question[],
                    sessionId: lastSession.id,
                    resumed: true,
                    completedCount: logCount.count
                };
            }
        }
        return null;
    },

    /**
     * Create a new random session
     */
    async createRandomSession(userId: number, limit: number = 10) {
        const sessionId = Math.random().toString(36).substring(2, 15);
        const questions = safeAll(
            db.prepare('SELECT * FROM questions ORDER BY RANDOM() LIMIT ?'),
            [limit],
            QuestionRowSchema
        );

        if (!questions || questions.length === 0) {
            return { questions: [], sessionId: "" };
        }

        db.prepare(`
      INSERT INTO practice_sessions (id, user_id, total_questions, questions_json, practice_mode) 
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, userId, questions.length, JSON.stringify(questions), 'random');

        return { questions, sessionId };
    },

    /**
     * Submit an answer for a question
     */
    async submitAnswer(
        userId: number,
        sessionId: string | null,
        questionId: number,
        userAnswer: string,
        isCorrect: boolean,
        duration: number
    ) {
        // 1. Log response
        db.prepare(`
      INSERT INTO practice_logs (session_id, user_id, question_id, user_answer, is_correct, duration_ms) 
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, userId, questionId, userAnswer, isCorrect ? 1 : 0, duration);

        // 2. Update session stats
        if (sessionId) {
            db.prepare(`
        UPDATE practice_sessions 
        SET correct_count = correct_count + ?
        WHERE id = ? AND user_id = ?
      `).run(isCorrect ? 1 : 0, sessionId, userId);
        }

        // 3. Update mastery (async-like)
        // Dynamic import to avoid cycles if any (though mastery is separate)
        // Assuming mastery logic is purely db based
        const q = db.prepare('SELECT tags, dimension FROM questions WHERE id = ?').get(questionId) as { tags: string, dimension: string };
        if (q) {
            let tags: string[] = [];
            try {
                tags = JSON.parse(q.tags);
            } catch (_e) {
                tags = [];
            }

            const { masteryService } = await import('@/lib/services/mastery');
            tags.forEach((tag: string) => {
                masteryService.updateMastery(userId, tag, q.dimension as Dimension, isCorrect);
            });
        }

        return { success: true };
    },

    /**
     * Submit an answer with server-side validation
     * Returns isCorrect and correctAnswer
     */
    async submitAnswerWithValidation(
        userId: number,
        sessionId: string | null,
        questionId: number,
        userAnswer: string,
        duration: number
    ) {
        // 1. Fetch question's correct answer
        const question = safeGet(
            db.prepare('SELECT answer FROM questions WHERE id = ?'),
            [questionId],
            z.object({ answer: z.string() })
        );

        if (!question) {
            throw new Error(`Question ${questionId} not found`);
        }

        const correctAnswer = question.answer;
        const isCorrect = userAnswer === correctAnswer;

        // 2. Log response
        db.prepare(`
      INSERT INTO practice_logs (session_id, user_id, question_id, user_answer, is_correct, duration_ms) 
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, userId, questionId, userAnswer, isCorrect ? 1 : 0, duration);

        // 3. Update session stats
        if (sessionId) {
            db.prepare(`
        UPDATE practice_sessions 
        SET correct_count = correct_count + ?
        WHERE id = ? AND user_id = ?
      `).run(isCorrect ? 1 : 0, sessionId, userId);
        }

        // 4. Update mastery
        const q = db.prepare('SELECT tags, dimension FROM questions WHERE id = ?').get(questionId) as { tags: string, dimension: string };
        if (q) {
            let tags: string[] = [];
            try {
                tags = JSON.parse(q.tags);
            } catch (_e) {
                tags = [];
            }

            const { masteryService } = await import('@/lib/services/mastery');
            tags.forEach((tag: string) => {
                masteryService.updateMastery(userId, tag, q.dimension as Dimension, isCorrect);
            });
        }

        return { isCorrect, correctAnswer };
    }
};
