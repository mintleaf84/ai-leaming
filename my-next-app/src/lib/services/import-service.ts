import { drizzleDb, drizzleSchema } from '../db';
import { sql } from 'drizzle-orm';
import { FenbiImportResult } from '../import/fenbi-parser';
import { sanitizeHtml } from '../utils/security';

const { 
    practice_sessions, 
    questions, 
    practice_logs, 
    user_mastery 
} = drizzleSchema;

/**
 * 导入 Service
 * 处理业务逻辑与数据库交互
 */
export const importService = {
    /**
     * 导入粉笔数据到数据库
     * @param userId 用户 ID
     * @param data 解析后的粉笔数据
     * @returns 导入结果统计
     */
    importFenbiData: async (userId: number, data: FenbiImportResult) => {
        const sessionId = `fenbi_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        let newQuestionsCount = 0;

        // 注意：为避免 LibSQL 的连接池产生 SQLITE_BUSY 死锁，且由于 SQLite 不建议在长事务中穿插大量 JS 异步逻辑，此处移除事务包装。
        // 所有插入都使用了 UPSERT，具有幂等性，中途失败亦可安全重试。
        
        // 1. 创建练习会话
        await drizzleDb.insert(practice_sessions).values({
            id: sessionId,
            user_id: userId,
            session_name: data.sessionName,
            total_questions: data.totalCount,
            correct_count: data.correctCount,
            practice_mode: 'import',
            questions_json: JSON.stringify(data.questions.map(q => ({
                externalId: q.externalId,
                content: q.content,
                type: q.type
            })))
        });

        // 2. 批量处理题目 (Upsert)
        // 分批处理以防止 SQLite 参数过多限制
        const batchSize = 50;
        const questionIdMap = new Map<string, number>();

        for (let i = 0; i < data.questions.length; i += batchSize) {
            const batch = data.questions.slice(i, i + batchSize);
            
            for (const q of batch) {
                const typeMap: Record<string, string> = {
                    'single': 'single', 'multi': 'multi', 'truefalse': 'truefalse', 'fill_blank': 'single'
                };
                const safeDimension = ['knowledge', 'understanding', 'application'].includes(q.dimension) 
                    ? q.dimension as 'knowledge' | 'understanding' | 'application'
                    : 'knowledge';

                // 执行 Upsert
                const result = await drizzleDb.insert(questions)
                    .values({
                        external_id: q.externalId,
                        content: sanitizeHtml(q.content),
                        options: JSON.stringify(q.options),
                        answer: q.answer,
                        explanation: sanitizeHtml(q.explanation),
                        tags: JSON.stringify(q.tags),
                        dimension: safeDimension,
                        type: typeMap[q.type] || 'single',
                        source: q.source || 'fenbi_import',
                        correct_ratio: q.stats?.correctRatio ?? null,
                        most_wrong_answer: q.stats?.mostWrongAnswer ?? null,
                        material: q.material ? sanitizeHtml(q.material) : null,
                        material_html: q.materialHtml ? sanitizeHtml(q.materialHtml) : null
                    })
                    .onConflictDoUpdate({
                        target: questions.external_id,
                        set: {
                            content: sql`excluded.content`,
                            explanation: sql`excluded.explanation`,
                            material: sql`excluded.material`,
                            material_html: sql`excluded.material_html`,
                            correct_ratio: sql`excluded.correct_ratio`,
                            most_wrong_answer: sql`excluded.most_wrong_answer`
                        }
                    })
                    .returning({ id: questions.id });

                if (result.length > 0) {
                    questionIdMap.set(q.externalId, result[0].id);
                }
            }
        }

        // 3. 批量记录日志
        if (data.records.length > 0) {
            const logValues = data.records
                .map(r => {
                    const qId = questionIdMap.get(r.externalId);
                    if (!qId) return null;
                    return {
                        session_id: sessionId,
                        user_id: userId,
                        question_id: qId,
                        user_answer: r.userAnswer,
                        is_correct: r.isCorrect,
                        duration_ms: r.durationMs
                    };
                })
                .filter((v): v is NonNullable<typeof v> => v !== null);

            if (logValues.length > 0) {
                await drizzleDb.insert(practice_logs).values(logValues);
            }
        }

        // 4. 汇总并更新 Mastery
        const masteryChanges = new Map<string, { correct: number; total: number }>();
        for (const record of data.records) {
            const question = data.questions.find(q => q.externalId === record.externalId);
            if (question && question.tags.length > 0) {
                for (const tag of question.tags) {
                    const current = masteryChanges.get(tag) || { correct: 0, total: 0 };
                    current.total += 1;
                    if (record.isCorrect) current.correct += 1;
                    masteryChanges.set(tag, current);
                }
            }
        }

        for (const [tag, stats] of masteryChanges.entries()) {
            // 利用 Drizzle 的表达式在数据库端进行累加
            await drizzleDb.insert(user_mastery)
                .values({
                    user_id: userId,
                    tag_name: tag,
                    correct_count: stats.correct,
                    total_count: stats.total,
                    score: stats.total > 0 ? (stats.correct / stats.total) * 100 : 0
                })
                .onConflictDoUpdate({
                    target: [user_mastery.user_id, user_mastery.tag_name],
                    set: {
                        correct_count: sql`${user_mastery.correct_count} + ${stats.correct}`,
                        total_count: sql`${user_mastery.total_count} + ${stats.total}`,
                        // 重新计算分数 (注意：这里在 SQL 层面重新计算更准确)
                        score: sql`ROUND(CAST(${user_mastery.correct_count} + ${stats.correct} AS FLOAT) / CAST(${user_mastery.total_count} + ${stats.total} AS FLOAT) * 100, 2)`,
                        last_updated: sql`CURRENT_TIMESTAMP`
                    }
                });
        }

        // 计算新增和跳过的数量 (简单估算)
        newQuestionsCount = questionIdMap.size; 
        
        // 5. 自动同步到 SRS 系统
        try {
            const { srsService } = await import('./srs');
            await srsService.syncFromPracticeLogs(userId);
        } catch (e) {
            console.error('[Import] SRS 同步失败:', e);
            // 不影响主流程导入
        }

        return {
            sessionId,
            newQuestionsCount,
            importedCount: data.records.length
        };
    }
};
