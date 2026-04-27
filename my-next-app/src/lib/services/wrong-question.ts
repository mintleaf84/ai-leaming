import { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, and, desc, sql, gte, inArray, notInArray } from 'drizzle-orm';
import { practice_logs, questions, question_srs, mastered_questions, practice_sessions } from '@/lib/db/drizzle-schema';
import dayjs from 'dayjs';

export interface WrongQuestionItem {
    questionId: number;
    questionContent: string;
    tags: string[];
    wrongCount: number;
    lastWrongAt: string;
    correctAnswer: string;
    userLastAnswer: string;
    srs?: {
        stability: number;
        difficulty: number;
        due_date: string;
    };
}

/**
 * 错题服务 - 管理错题本、掌握状态及智能推荐
 */
export const wrongQuestionService = {
    /**
     * 获取错题列表 (排除已掌握)
     */
    async getList(userId: number): Promise<WrongQuestionItem[]> {
        // 1. 获取已掌握题目 ID 列表
        const masteredIds = await drizzleDb.select({ id: mastered_questions.question_id })
            .from(mastered_questions)
            .where(eq(mastered_questions.user_id, userId));
        const excludeIds = masteredIds.map(m => m.id);

        // 2. 聚合查询错题
        const query = drizzleDb.select({
            questionId: practice_logs.question_id,
            questionContent: questions.content,
            tags: questions.tags,
            correctAnswer: questions.answer,
            wrongCount: sql<number>`COUNT(*)`,
            lastWrongAt: sql<string>`MAX(${practice_logs.timestamp})`,
            stability: question_srs.stability,
            difficulty: question_srs.difficulty,
            due_date: question_srs.due_date,
        })
        .from(practice_logs)
        .innerJoin(questions, eq(practice_logs.question_id, questions.id))
        .leftJoin(question_srs, and(
            eq(practice_logs.question_id, question_srs.question_id),
            eq(practice_logs.user_id, question_srs.user_id)
        ))
        .where(and(
            eq(practice_logs.user_id, userId),
            eq(practice_logs.is_correct, false),
            excludeIds.length > 0 ? notInArray(practice_logs.question_id, excludeIds) : undefined
        ))
        .groupBy(practice_logs.question_id)
        .orderBy(desc(sql`wrongCount`), desc(sql`lastWrongAt`));

        const rows = await query;

        // 3. 为每一项异步获取最近一次错误答案 (SQLite 不好在聚合中直接取非聚合列)
        // 优化建议：如果是大规模列表，可以考虑分两次查询或使用 JSON 聚合
        return await Promise.all(rows.map(async r => {
            const [lastLog] = await drizzleDb.select({ user_answer: practice_logs.user_answer })
                .from(practice_logs)
                .where(and(
                    eq(practice_logs.question_id, r.questionId!),
                    eq(practice_logs.user_id, userId),
                    eq(practice_logs.is_correct, false)
                ))
                .orderBy(desc(practice_logs.timestamp))
                .limit(1);

            return {
                questionId: r.questionId!,
                questionContent: r.questionContent!,
                tags: typeof r.tags === 'string' ? JSON.parse(r.tags) : (r.tags || []),
                wrongCount: r.wrongCount,
                lastWrongAt: r.lastWrongAt,
                correctAnswer: r.correctAnswer!,
                userLastAnswer: lastLog?.user_answer || '',
                srs: r.stability ? {
                    stability: r.stability,
                    difficulty: r.difficulty || 0,
                    due_date: r.due_date || ''
                } : undefined
            };
        }));
    },

    /**
     * 获取错题统计
     */
    async getStats(userId: number) {
        const [total, recent, frequent] = await Promise.all([
            // 总数
            drizzleDb.select({ count: sql`COUNT(DISTINCT ${practice_logs.question_id})` })
                .from(practice_logs)
                .where(and(eq(practice_logs.user_id, userId), eq(practice_logs.is_correct, false)))
                .get() as Promise<{ count: number }>,
            
            // 最近 7 天
            drizzleDb.select({ count: sql`COUNT(DISTINCT ${practice_logs.question_id})` })
                .from(practice_logs)
                .where(and(
                    eq(practice_logs.user_id, userId),
                    eq(practice_logs.is_correct, false),
                    gte(practice_logs.timestamp, dayjs().subtract(7, 'day').format('YYYY-MM-DD HH:mm:ss'))
                ))
                .get() as Promise<{ count: number }>,

            // 高频 (2次及以上)
            drizzleDb.all<any>(sql`
                SELECT COUNT(*) as count FROM (
                    SELECT question_id FROM ${practice_logs}
                    WHERE user_id = ${userId} AND is_correct = 0
                    GROUP BY question_id
                    HAVING COUNT(*) >= 2
                )
            `).then(r => r[0] as { count: number })
        ]);

        return {
            total: total?.count || 0,
            recent: recent?.count || 0,
            frequent: frequent?.count || 0
        };
    },

    /**
     * 智能推荐错题 (基于权重算法)
     */
    async getRandomRecommended(userId: number, options: { count?: number; tag?: string; mode?: 'priority' | 'random' } = {}) {
        const { count = 10, tag, mode = 'priority' } = options;
        
        // 核心加权 SQL 逻辑迁移
        const priorityOrder = sql`(COUNT(*) * 5.0 + (JULIANDAY('now') - JULIANDAY(MAX(${practice_logs.timestamp}))) * 2.0) * (ABS(RANDOM() % 1000) / 1000.0) DESC`;
        const randomOrder = sql`RANDOM()`;

        let query = drizzleDb.select({
            questionId: practice_logs.question_id,
            questionContent: questions.content,
            tags: questions.tags,
            correctAnswer: questions.answer,
            wrongCount: sql<number>`COUNT(*)`,
            lastWrongAt: sql<string>`MAX(${practice_logs.timestamp})`
        })
        .from(practice_logs)
        .innerJoin(questions, eq(practice_logs.question_id, questions.id))
        .where(and(
            eq(practice_logs.user_id, userId),
            eq(practice_logs.is_correct, false),
            // 排除已掌握
            sql`${practice_logs.question_id} NOT IN (SELECT question_id FROM ${mastered_questions} WHERE user_id = ${userId})`,
            tag ? sql`EXISTS (SELECT 1 FROM json_each(${questions.tags}) WHERE value = ${tag})` : undefined
        ))
        .groupBy(practice_logs.question_id)
        .orderBy(mode === 'priority' ? priorityOrder : randomOrder)
        .limit(Math.min(count, 50));

        const rows = await query;
        return rows.map(r => ({
            questionId: r.questionId!,
            questionContent: r.questionContent!,
            tags: typeof r.tags === 'string' ? JSON.parse(r.tags) : (r.tags || []),
            wrongCount: r.wrongCount,
            lastWrongAt: r.lastWrongAt || '',
            correctAnswer: r.correctAnswer!,
            userLastAnswer: '' // 推荐模式下暂不填充上次答案以换取性能
        }));
    },

    /**
     * 标记为已掌握
     */
    async markAsMastered(userId: number, questionId: number, note?: string) {
        await drizzleDb.insert(mastered_questions).values({
            user_id: userId,
            question_id: questionId,
            note: note || null,
        }).onConflictDoUpdate({
            target: [mastered_questions.user_id, mastered_questions.question_id],
            set: { mastered_at: sql`CURRENT_TIMESTAMP`, note: note || null }
        });
        return true;
    },

    /**
     * 取消掌握标记
     */
    async unmarkMastered(userId: number, questionId: number) {
        await drizzleDb.delete(mastered_questions)
            .where(and(eq(mastered_questions.user_id, userId), eq(mastered_questions.question_id, questionId)));
        return true;
    },

    /**
     * 获取错题详情 (含历史作答记录)
     */
    async getDetail(userId: number, questionId: number) {
        // 1. 获取题目与 SRS
        const [question] = await drizzleDb.select()
            .from(questions)
            .leftJoin(question_srs, and(
                eq(questions.id, question_srs.question_id),
                eq(question_srs.user_id, userId)
            ))
            .where(eq(questions.id, questionId))
            .limit(1);

        if (!question) return null;

        // 2. 聚合错误统计
        const [stats] = await drizzleDb.select({
            wrongCount: sql<number>`COUNT(*)`,
            lastWrongAt: sql<string>`MAX(${practice_logs.timestamp})`
        })
        .from(practice_logs)
        .where(and(
            eq(practice_logs.question_id, questionId),
            eq(practice_logs.user_id, userId),
            eq(practice_logs.is_correct, false)
        ));

        // 3. 获取历史记录
        const history = await drizzleDb.select({
            timestamp: practice_logs.timestamp,
            userAnswer: practice_logs.user_answer,
            isCorrect: practice_logs.is_correct
        })
        .from(practice_logs)
        .where(and(
            eq(practice_logs.question_id, questionId),
            eq(practice_logs.user_id, userId)
        ))
        .orderBy(desc(practice_logs.timestamp))
        .limit(20);

        return {
            questionId: question.questions.id,
            questionContent: question.questions.content,
            options: typeof question.questions.options === 'string' ? JSON.parse(question.questions.options) : (question.questions.options || []),
            correctAnswer: question.questions.answer,
            explanation: question.questions.explanation || '',
            tags: typeof question.questions.tags === 'string' ? JSON.parse(question.questions.tags) : (question.questions.tags || []),
            questionType: question.questions.type || 'single',
            wrongCount: stats?.wrongCount || 0,
            lastWrongAt: stats?.lastWrongAt || '',
            historyLogs: history.map(h => ({
                timestamp: h.timestamp,
                userAnswer: h.userAnswer,
                isCorrect: Boolean(h.isCorrect)
            })),
            srs: question.question_srs?.stability ? {
                stability: question.question_srs.stability,
                difficulty: question.question_srs.difficulty || 0,
                due_date: question.question_srs.due_date || ''
            } : undefined
        };
    }
};
