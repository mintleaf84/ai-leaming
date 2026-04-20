'use server';
import logger from '@/lib/logger';

import db from '@/lib/db';
import { requireUser } from '@/lib/auth/auth';
import { parseFenbiData, validateFenbiJson, _ParsedQuestion, _ParsedRecord } from '@/lib/import/fenbi-parser';
import { _masteryService } from '@/lib/services/mastery';
import { sanitizeHtml } from '@/lib/utils/security';
import { cookies } from 'next/headers';
import { COOKIE_NAME } from '@/lib/auth/auth-edge';

/**
 * 导入结果
 */
export interface ImportResult {
    success: boolean;
    sessionId?: string;
    importedCount: number;
    newQuestionsCount: number;
    skippedQuestionsCount: number;
    message: string;
}

/**
 * 获取当前用户的导入鉴权 Token
 */
export async function getImportTokenAction(): Promise<string | null> {
    const sessionCookie = (await cookies()).get(COOKIE_NAME)?.value;
    return sessionCookie || null;
}

/**
 * 导入粉笔 APP 数据
 */
export async function importFenbiDataAction(
    exerciseJson: string,
    solutionsJson: string,
    statsJson?: string
): Promise<ImportResult> {
    try {
        const user = await requireUser();

        // 1. 验证 JSON 格式
        const validation = validateFenbiJson(exerciseJson, solutionsJson);
        if (!validation.valid) {
            return {
                success: false,
                importedCount: 0,
                newQuestionsCount: 0,
                skippedQuestionsCount: 0,
                message: validation.error || 'JSON 格式无效'
            };
        }

        // 2. 解析数据
        const parsed = parseFenbiData(exerciseJson, solutionsJson, statsJson);

        if (parsed.questions.length === 0) {
            return {
                success: false,
                importedCount: 0,
                newQuestionsCount: 0,
                skippedQuestionsCount: 0,
                message: '解析结果为空，请检查数据格式'
            };
        }

        // 3. 准备导入上下文
        const sessionId = `fenbi_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        let newQuestionsCount = 0;
        let skippedQuestionsCount = 0;
        const questionIdMap = new Map<string, number>(); // externalId -> 内部 id

        // 5. 使用事务执行所有数据库操作
        const executeTransaction = db.transaction(() => {
            // 3. 创建练习会话
            db.prepare(`
              INSERT INTO practice_sessions (id, user_id, session_name, total_questions, correct_count, practice_mode, questions_json)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                sessionId,
                user.id,
                parsed.sessionName,
                parsed.totalCount,
                parsed.correctCount,
                'import',
                JSON.stringify(parsed.questions.map(q => ({
                    externalId: q.externalId,
                    content: q.content,
                    type: q.type
                })))
            );

            // 4. 处理题目
            const insertQuestion = db.prepare(`
              INSERT INTO questions (content, options, answer, explanation, tags, dimension, type, external_id, source, correct_ratio, most_wrong_answer, material, material_html)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const findQuestion = db.prepare(`
              SELECT id FROM questions WHERE external_id = ?
            `);

            const updateQuestionStats = db.prepare(`
                UPDATE questions 
                SET correct_ratio = ?, most_wrong_answer = ?
                WHERE id = ?
            `);

            const updateFullQuestion = db.prepare(`
                UPDATE questions 
                SET material = ?, material_html = ?, content = ?, explanation = ?,
                    type = ?, answer = ?, options = ?
                WHERE id = ?
            `);

            const ALLOWED_DIMENSIONS = ['knowledge', 'understanding', 'application'];

            for (const question of parsed.questions) {
                const existing = findQuestion.get(question.externalId) as { id: number } | undefined;
                
                // 维度合法性校验：如果维度不在白名单内，回退到 'knowledge'
                const safeDimension = ALLOWED_DIMENSIONS.includes(question.dimension) ? question.dimension : 'knowledge';

                if (existing) {
                    questionIdMap.set(question.externalId, existing.id);
                    if (question.stats?.correctRatio != null || question.stats?.mostWrongAnswer != null) {
                        updateQuestionStats.run(
                            question.stats?.correctRatio ?? null,
                            question.stats?.mostWrongAnswer ?? null,
                            existing.id
                        );
                    }

                    const typeMap: Record<string, string> = {
                        'single': 'single', 'multi': 'multi', 'truefalse': 'truefalse', 'fill_blank': 'single'
                    };

                    updateFullQuestion.run(
                        question.material ? sanitizeHtml(question.material) : null,
                        question.materialHtml ? sanitizeHtml(question.materialHtml) : null,
                        sanitizeHtml(question.content),
                        sanitizeHtml(question.explanation),
                        typeMap[question.type] || 'single',
                        question.answer,
                        JSON.stringify(question.options),
                        existing.id
                    );
                    skippedQuestionsCount++;
                } else {
                    const typeMap: Record<string, string> = {
                        'single': 'single', 'multi': 'multi', 'truefalse': 'truefalse', 'fill_blank': 'single'
                    };

                    const result = insertQuestion.run(
                        sanitizeHtml(question.content),
                        JSON.stringify(question.options),
                        question.answer,
                        sanitizeHtml(question.explanation),
                        JSON.stringify(question.tags),
                        safeDimension,
                        typeMap[question.type] || 'single',
                        question.externalId,
                        question.source || 'fenbi_import', // 取题目真实的来源，无则降级为fenbi_import
                        question.stats?.correctRatio ?? null,
                        question.stats?.mostWrongAnswer ?? null,
                        question.material ? sanitizeHtml(question.material) : null,
                        question.materialHtml ? sanitizeHtml(question.materialHtml) : null
                    );

                    questionIdMap.set(question.externalId, result.lastInsertRowid as number);
                    newQuestionsCount++;
                }
            }

            // 5. 记录日志并累计 Mastery 变化
            const insertLog = db.prepare(`
              INSERT INTO practice_logs (session_id, user_id, question_id, user_answer, is_correct, duration_ms)
              VALUES (?, ?, ?, ?, ?, ?)
            `);

            // 维护一个内存中的 tag 计数器以减少数据库写入
            const masteryChanges = new Map<string, { correct: number; total: number; dimension: string }>();

            for (const record of parsed.records) {
                const questionId = questionIdMap.get(record.externalId);
                if (questionId) {
                    insertLog.run(
                        sessionId,
                        user.id,
                        questionId,
                        record.userAnswer,
                        record.isCorrect ? 1 : 0,
                        record.durationMs
                    );

                    const question = parsed.questions.find(q => q.externalId === record.externalId);
                    if (question && question.tags.length > 0) {
                        for (const tag of question.tags) {
                            const current = masteryChanges.get(tag) || { correct: 0, total: 0, dimension: question.dimension };
                            current.total += 1;
                            if (record.isCorrect) current.correct += 1;
                            masteryChanges.set(tag, current);
                        }
                    }
                }
            }

            // 批量应用 Mastery 变化 (显著减少数据库 IO)
            for (const [tag, stats] of masteryChanges.entries()) {
                // 这里我们稍微修改逻辑：如果导入量很大，这样能节省大量事务内开销
                // 我们调用一个新的批量更新方法或模拟它
                const currentEntry = db.prepare(
                    'SELECT score, correct_count, total_count FROM user_mastery WHERE user_id = ? AND tag_name = ?'
                ).get(user.id, tag) as { score: number; correct_count: number; total_count: number } | undefined;

                const newCorrect = (currentEntry?.correct_count ?? 0) + stats.correct;
                const newTotal = (currentEntry?.total_count ?? 0) + stats.total;
                const newScore = newTotal > 0 ? (newCorrect / newTotal) * 100 : 0;

                db.prepare(`
                    INSERT INTO user_mastery (user_id, tag_name, score, correct_count, total_count, last_updated) 
                    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(user_id, tag_name) DO UPDATE SET 
                      score = excluded.score,
                      correct_count = excluded.correct_count,
                      total_count = excluded.total_count,
                      last_updated = CURRENT_TIMESTAMP
                `).run(user.id, tag, newScore, newCorrect, newTotal);
            }
        });

        executeTransaction();

        return {
            success: true,
            sessionId,
            importedCount: parsed.records.length,
            newQuestionsCount,
            skippedQuestionsCount,
            message: `成功导入 ${parsed.records.length} 条作答记录，新增 ${newQuestionsCount} 道题目`
        };

    } catch (error) {
        logger.error({ err: error }, '粉笔数据导入失败');
        return {
            success: false,
            importedCount: 0,
            newQuestionsCount: 0,
            skippedQuestionsCount: 0,
            message: `导入失败: ${(error as Error).message}`
        };
    }
}

/**
 * 预览导入数据（不实际写入）
 */
export async function previewFenbiDataAction(
    exerciseJson: string,
    solutionsJson: string,
    statsJson?: string
): Promise<{
    valid: boolean;
    error?: string;
    preview?: {
        sessionName: string;
        totalCount: number;
        correctCount: number;
        errorCount: number;
        accuracy: number;
        sampleQuestions: Array<{
            content: string;
            type: string;
            tags: string[];
        }>;
    };
}> {
    try {
        // 验证格式
        const validation = validateFenbiJson(exerciseJson, solutionsJson);
        if (!validation.valid) {
            return { valid: false, error: validation.error };
        }

        // 解析数据
        const parsed = parseFenbiData(exerciseJson, solutionsJson, statsJson);

        return {
            valid: true,
            preview: {
                sessionName: parsed.sessionName,
                totalCount: parsed.totalCount,
                correctCount: parsed.correctCount,
                errorCount: parsed.errorCount,
                accuracy: parsed.totalCount > 0
                    ? Math.round((parsed.correctCount / parsed.totalCount) * 100)
                    : 0,
                sampleQuestions: parsed.questions.slice(0, 3).map(q => ({
                    content: q.content.length > 80 ? q.content.substring(0, 80) + '...' : q.content,
                    type: q.type === 'single' ? '单选' : q.type === 'multi' ? '多选' : '判断',
                    tags: q.tags
                }))
            }
        };
    } catch (error) {
        return {
            valid: false,
            error: `解析失败: ${(error as Error).message}`
        };
    }
}
