'use server';

import db from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { parseFenbiData, validateFenbiJson, ParsedQuestion, ParsedRecord } from '@/lib/import/fenbi-parser';
import { masteryService } from '@/lib/mastery-service';

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

        // 3. 创建练习会话
        const sessionId = `fenbi_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

        db.prepare(`
      INSERT INTO practice_sessions (id, user_id, session_name, total_questions, correct_count, practice_mode, questions_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
            sessionId,
            user.id,
            parsed.sessionName,  // 保存会话名称
            parsed.totalCount,
            parsed.correctCount,
            'import',  // 标记为导入模式
            JSON.stringify(parsed.questions.map(q => ({
                externalId: q.externalId,
                content: q.content,
                type: q.type
            })))
        );

        // 4. 处理题目（插入新题目或获取已有题目 ID）
        let newQuestionsCount = 0;
        let skippedQuestionsCount = 0;
        const questionIdMap = new Map<string, number>(); // externalId -> 内部 id

        const insertQuestion = db.prepare(`
      INSERT INTO questions (content, options, answer, explanation, tags, dimension, type, external_id, source, correct_ratio, most_wrong_answer)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

        const findQuestion = db.prepare(`
      SELECT id FROM questions WHERE external_id = ?
    `);

        const updateQuestionStats = db.prepare(`
            UPDATE questions 
            SET correct_ratio = ?, most_wrong_answer = ?
            WHERE id = ?
        `);

        for (const question of parsed.questions) {
            // 检查是否已存在
            const existing = findQuestion.get(question.externalId) as { id: number } | undefined;

            if (existing) {
                questionIdMap.set(question.externalId, existing.id);
                // 如果有统计数据，则更新
                if (question.stats?.correctRatio != null || question.stats?.mostWrongAnswer != null) {
                    updateQuestionStats.run(
                        question.stats?.correctRatio ?? null,
                        question.stats?.mostWrongAnswer ?? null,
                        existing.id
                    );
                }
                skippedQuestionsCount++;
            } else {
                // 转换题目类型以匹配系统格式
                const typeMap: Record<string, string> = {
                    'single': 'single',
                    'multi': 'multi',
                    'boolean': 'single',     // 判断题在系统中作为单选处理
                    'fill_blank': 'fill_blank'  // 填空题
                };

                const result = insertQuestion.run(
                    question.content,
                    JSON.stringify(question.options),
                    question.answer,
                    question.explanation,
                    JSON.stringify(question.tags),
                    question.dimension,
                    typeMap[question.type] || 'single',
                    question.externalId,
                    question.source,
                    question.stats?.correctRatio ?? null,      // 全站正确率
                    question.stats?.mostWrongAnswer ?? null    // 易错项
                );

                questionIdMap.set(question.externalId, result.lastInsertRowid as number);
                newQuestionsCount++;
            }
        }

        // 5. 记录作答日志
        const insertLog = db.prepare(`
      INSERT INTO practice_logs (session_id, user_id, question_id, user_answer, is_correct, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

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

                // 6. 更新掌握度（正确和错误都会更新）
                const question = parsed.questions.find(q => q.externalId === record.externalId);
                if (question && question.tags.length > 0) {
                    for (const tag of question.tags) {
                        masteryService.updateMastery(
                            user.id,
                            tag,
                            question.dimension,
                            record.isCorrect  // 正确会提升，错误会降低
                        );
                    }
                }
            }
        }

        return {
            success: true,
            sessionId,
            importedCount: parsed.records.length,
            newQuestionsCount,
            skippedQuestionsCount,
            message: `成功导入 ${parsed.records.length} 条作答记录，新增 ${newQuestionsCount} 道题目（统计数据: ${parsed.statsCount}/${parsed.totalCount}）`
        };

    } catch (error) {
        console.error('粉笔数据导入失败:', error);
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
