'use server';

import logger from '@/lib/logger';
import { generateStructuredData, generateTextWrapper } from '@/lib/ai/client';
import { getErrorMessage } from '@/lib/utils/error';
import { 
    CorrectionQuizSchema, 
    RegressionChallengeSchema, 
    type CorrectionQuiz, 
    type RegressionChallenge, 
    type QuestionRow 
} from '@/lib/schemas';
import { questionService } from '@/lib/services/question';
import { getPromptFromDb, buildPrompt, DEFAULT_CORRECTION_PROMPT, DEFAULT_REGRESSION_PROMPT } from '@/lib/ai/prompts';
import { requireUser } from '@/lib/auth/auth';
import { checkAndConsumeQuota } from '@/lib/billing/subscription-service';
import { aiCacheService } from '@/lib/services/ai-cache';

/**
 * 生成错题强化练习
 */
export async function generateCorrectionQuizAction(
    questionContent: string,
    wrongAnswer: string,
    correctAnswer: string,
    force: boolean = false
): Promise<CorrectionQuiz> {
    const cacheKey = generateHash(questionContent + wrongAnswer + correctAnswer);
    
    // 1. 检查缓存
    if (!force) {
        const cached = await aiCacheService.getQuiz(cacheKey);
        if (cached) {
            logger.info('[QuizCache] 命中缓存');
            return cached;
        }
    }

    // 2. 配额检查
    const user = await requireUser();
    const userIdNum = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
    if (!isNaN(userIdNum)) {
        const quotaResult = await checkAndConsumeQuota(userIdNum, 'review');
        if (!quotaResult.allowed) {
            throw new Error(quotaResult.message || '今日 AI 复盘次数已用完，请升级套餐解锁更多。');
        }
    }

    // 3. 获取 Prompt 模板
    const dbTemplate = await getPromptFromDb('correction_quiz');
    const template = dbTemplate || DEFAULT_CORRECTION_PROMPT;
    const prompt = buildPrompt(template, { questionContent, wrongAnswer, correctAnswer });

    try {
        // 4. 调用 AI 生成
        const result = await generateStructuredData(CorrectionQuizSchema, prompt, 'premium');
        
        // 5. 保存到缓存
        await aiCacheService.setQuiz(cacheKey, result);
        return result;
    } catch (error) {
        // 6. 兜底方案：RAG 检索相似题
        logger.warn({ err: error }, 'Correction Quiz AI generation failed, using RAG fallback.');
        const similar = await questionService.searchSimilarQuestions(questionContent, 1);

        if (similar && similar.length > 0) {
            const q = similar[0] as QuestionRow;
            let options = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
            
            return {
                analysis: "AI 生成暂时不可用，我们为您检索了一道相关的强化训练题。",
                distinctionPoint: "知识点辨析",
                quiz: {
                    content: q.content,
                    options: Array.isArray(options) ? options : [],
                    answer: q.answer,
                    explanation: q.explanation || '库内真题解析'
                }
            };
        }
        throw error;
    }
}

/**
 * 生成回归挑战练习
 */
export async function generateRegressionChallengeAction(
    questionContent: string,
    tags: string[],
    force: boolean = false
): Promise<RegressionChallenge> {
    const cacheKey = generateHash(questionContent + tags.join('|'));
    
    // 1. 检查缓存
    if (!force) {
        const cached = await aiCacheService.getChallenge(cacheKey);
        if (cached) {
            logger.info('[ChallengeCache] 命中缓存');
            return cached;
        }
    }

    // 2. 配额检查
    const user = await requireUser();
    const userIdNum = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
    if (!isNaN(userIdNum)) {
        const quotaResult = await checkAndConsumeQuota(userIdNum, 'review');
        if (!quotaResult.allowed) {
            throw new Error(quotaResult.message || '今日 AI 复盘次数已用完，请升级套餐解锁更多。');
        }
    }

    const dbTemplate = await getPromptFromDb('regression_challenge');
    const template = dbTemplate || DEFAULT_REGRESSION_PROMPT;
    const prompt = buildPrompt(template, { questionContent, tags: tags.join(', ') });

    try {
        // 3. AI 生成
        const challenge = await generateStructuredData(RegressionChallengeSchema, prompt, 'premium');

        // 4. 双重校验 (API B 校验 API A)
        const validationPrompt = `
      作为质量审计专家，请评估以下回归挑战题目的质量。
      
      原题背景: "${questionContent}"
      生成的挑战题目: ${JSON.stringify(challenge)}
      
      这些题目是否逻辑严密、无歧义，且真正考察了原题知识点的对立面或深度变式？
      请仅回答 "YES" 或 "NO"。
    `;

        const { text: validationResult } = await generateTextWrapper(validationPrompt, 'premium');

        if (validationResult.includes('YES')) {
            await aiCacheService.setChallenge(cacheKey, challenge);
            return challenge;
        } else {
            logger.warn('Double Insurance failed: API B rejected API A.');
            throw new Error('Double Insurance rejected');
        }

    } catch (error) {
        // 5. 兜底方案：RAG 相似题库
        logger.warn({ err: error }, 'AI Generation failed, falling back to RAG similarity search');
        const similarQuestions = await questionService.searchSimilarQuestions(questionContent, 5);

        if (similarQuestions && similarQuestions.length > 0) {
            const mappedChallenges = (similarQuestions as QuestionRow[]).map(q => {
                let options = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
                return {
                    content: q.content,
                    options: Array.isArray(options) ? options : [],
                    answer: q.answer,
                    explanation: q.explanation || '库内相似真题解析'
                };
            });

            while (mappedChallenges.length < 3) {
                mappedChallenges.push({ ...mappedChallenges[0] });
            }

            return {
                logicType: 'complement',
                challenges: mappedChallenges.slice(0, 3)
            } as RegressionChallenge;
        }

        throw new Error('无法生成挑战且本地题库检索失败，请检查 AI 配置');
    }
}

/**
 * 生成第一性原理分析
 */
export async function generateFirstPrinciplesAction(
    questionContent: string,
    explanation: string,
    correctAnswer: string,
    wrongAnswer?: string,
    force: boolean = false
): Promise<{ analysis: string; cached?: boolean }> {
    if (!questionContent) throw new Error('缺少题目内容');

    const cacheKey = generateHash(questionContent + correctAnswer + (wrongAnswer || ''));

    // 1. 检查缓存
    if (!force) {
        const cachedAnalysis = await aiCacheService.getFirstPrinciples(cacheKey);
        if (cachedAnalysis) {
            logger.info('[FirstPrinciples] 命中缓存');
            return { analysis: cachedAnalysis, cached: true };
        }
    }

    // 2. 配额检查
    const user = await requireUser();
    const userIdNum = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
    if (!isNaN(userIdNum)) {
        const quotaResult = await checkAndConsumeQuota(userIdNum, 'first_principles');
        if (!quotaResult.allowed) {
            throw new Error(quotaResult.message || '今日第一性原理分析次数已用完，请升级套餐解锁更多。');
        }
    }

    // 3. 构建 Prompt
    const dbTemplate = await getPromptFromDb('first_principles');
    const prompt = dbTemplate 
        ? buildPrompt(dbTemplate, { questionContent, explanation: explanation || '略', correctAnswer, wrongAnswer: wrongAnswer || '无' })
        : `请用"第一性原理"解析这道题。要求：直接给答案，只说底层逻辑，不超过200字。题目：${questionContent} 正确答案：${correctAnswer} ${wrongAnswer ? `用户选择：${wrongAnswer}` : ''}`;

    try {
        // 4. 调用 AI (Economy 模型)
        const { text } = await generateTextWrapper(prompt, 'economy', undefined, undefined, { timeout: 30000, retries: 1 });
        
        // 5. 保存到缓存
        await aiCacheService.setFirstPrinciples(cacheKey, text);
        return { analysis: text, cached: false };
    } catch (error: unknown) {
        logger.error({ err: error }, 'First Principles analysis failed');
        throw new Error(`AI 分析失败: ${getErrorMessage(error, '请稍后重试')}`);
    }
}

// 辅助：哈希生成
function generateHash(content: string): string {
    const normalized = content.trim().slice(0, 100) + content.length;
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
        const char = normalized.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString(36);
}
