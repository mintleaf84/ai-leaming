'use server';
import logger from '@/lib/logger';

import { generateStructuredData, generateTextWrapper } from '@/lib/ai/client';
import { getErrorMessage } from '@/lib/utils/error';
import { CorrectionQuizSchema, RegressionChallengeSchema, CorrectionQuiz, RegressionChallenge } from '@/lib/schemas';
import { questionService } from '@/lib/services/question';
import { getPromptFromDb, buildPrompt, DEFAULT_CORRECTION_PROMPT, DEFAULT_REGRESSION_PROMPT } from '@/lib/ai/prompts';
import { requireUser } from '@/lib/auth/auth';
import db, { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, and, sql } from 'drizzle-orm';
import { checkAndConsumeQuota } from '@/lib/billing/subscription-service';

// Default Prompts imported from @/lib/ai/prompts

export async function generateCorrectionQuizAction(
  questionContent: string,
  wrongAnswer: string,
  correctAnswer: string,
  force: boolean = false
): Promise<CorrectionQuiz> {
  // 1. Ensure Table (handled by Drizzle migrations)

  // 2. Check Cache
  const cacheKey = generateHash(questionContent + wrongAnswer + correctAnswer);
  if (!force) {
    const cached = await drizzleDb.query.ai_quiz_cache.findFirst({
      where: eq(drizzleSchema.ai_quiz_cache.hash, cacheKey)
    });
    if (cached) {
      logger.info('[QuizCache] 命中缓存');
      return JSON.parse(cached.data) as CorrectionQuiz;
    }
  }

  // 3. Quota Check (Only if cache miss)
  const user = await requireUser();
  const userIdNum = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
  if (!isNaN(userIdNum)) {
    const quotaResult = checkAndConsumeQuota(userIdNum, 'review');
    if (!quotaResult.allowed) {
      throw new Error(quotaResult.message || '今日 AI 复盘次数已用完，请升级套餐解锁更多。');
    }
  }

  const dbTemplate = await getPromptFromDb('correction_quiz');
  const template = dbTemplate || DEFAULT_CORRECTION_PROMPT;

  const prompt = buildPrompt(template, {
    questionContent,
    wrongAnswer,
    correctAnswer
  });

  try {
    const result = await generateStructuredData(CorrectionQuizSchema, prompt, 'premium');
    // 4. Save to Cache
    try {
      await drizzleDb.insert(drizzleSchema.ai_quiz_cache)
        .values({ hash: cacheKey, data: JSON.stringify(result) })
        .onConflictDoUpdate({ target: drizzleSchema.ai_quiz_cache.hash, set: { data: JSON.stringify(result) } });
    } catch (e) {
      logger.error({ err: e }, '[QuizCache] 保存失败');
    }
    return result;
  } catch (error) {
    logger.warn('Correction Quiz AI generation failed, using RAG fallback.');
    const similar = await questionService.searchSimilarQuestions(questionContent, 1);

    if (similar && similar.length > 0) {
      const q = similar[0];
      let options = [];
      try {
        options = typeof (q as any).options === 'string' ? JSON.parse((q as any).options) : (q as any).options;
        if (!Array.isArray(options)) options = [];
      } catch (_e) {
        options = [];
      }

      return {
        analysis: "AI 生成暂时不可用，我们为您检索了一道相关的强化训练题。",
        distinctionPoint: "知识点辨析",
        quiz: {
          content: (q as any).content,
          options: options,
          answer: (q as any).answer,
          explanation: (q as any).explanation || '库内相似真题解析'
        }
      };
    }
    throw error;
  }
}

export async function generateRegressionChallengeAction(
  questionContent: string,
  tags: string[],
  force: boolean = false
): Promise<RegressionChallenge> {
  // 1. Ensure Table (handled by Drizzle migrations)

  // 2. Check Cache
  const cacheKey = generateHash(questionContent + tags.join('|'));
  if (!force) {
    const cached = await drizzleDb.query.ai_challenge_cache.findFirst({
      where: eq(drizzleSchema.ai_challenge_cache.hash, cacheKey)
    });
    if (cached) {
      logger.info('[ChallengeCache] 命中缓存');
      return JSON.parse(cached.data) as RegressionChallenge;
    }
  }

  // 3. Quota Check (Only if cache miss)
  const user = await requireUser();
  const userIdNum = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
  if (!isNaN(userIdNum)) {
    const quotaResult = checkAndConsumeQuota(userIdNum, 'review');
    if (!quotaResult.allowed) {
      throw new Error(quotaResult.message || '今日 AI 复盘次数已用完，请升级套餐解锁更多。');
    }
  }

  const dbTemplate = await getPromptFromDb('regression_challenge');
  const template = dbTemplate || DEFAULT_REGRESSION_PROMPT;

  const prompt = buildPrompt(template, {
    questionContent,
    tags: tags.join(', ')
  });

  try {
    // API A: Generate
    const challenge = await generateStructuredData(RegressionChallengeSchema, prompt, 'premium');

    // API B: Validate
    const validationPrompt = `
      作为质量审计专家，请评估以下回归挑战题目的质量。
      
      原题背景: "${questionContent}"
      生成的挑战题目: ${JSON.stringify(challenge)}
      
      这些题目是否逻辑严密、无歧义，且真正考察了原题知识点的对立面或深度变式？
      请仅回答 "YES" 或 "NO"。
    `;

    const { text: validationResult } = await generateTextWrapper(validationPrompt, 'premium');

    if (validationResult.includes('YES')) {
      // 4. Save Cache only if valid
      try {
        await drizzleDb.insert(drizzleSchema.ai_challenge_cache)
          .values({ hash: cacheKey, data: JSON.stringify(challenge) })
          .onConflictDoUpdate({ target: drizzleSchema.ai_challenge_cache.hash, set: { data: JSON.stringify(challenge) } });
      } catch (e) {
        logger.error({ err: e }, '[ChallengeCache] 保存失败');
      }
      return challenge;
    } else {
      logger.warn('Double Insurance failed: API B rejected API A. Falling back to library retrieval.');
      throw new Error('Double Insurance rejected');
    }

  } catch (error) {
    logger.warn({ err: error }, 'AI Generation failed or rejected, falling back to RAG similarity search');

    // Fallback: Retrieve similar real questions from the database
    const similarQuestions = await questionService.searchSimilarQuestions(questionContent, 5);

    if (similarQuestions && similarQuestions.length > 0) {
      // 提取并填充，确保满足 Schema 要求的 3 道题
      const mappedChallenges = similarQuestions.map(q => {
        let options = [];
        try {
          options = typeof (q as any).options === 'string' ? JSON.parse((q as any).options) : (q as any).options;
          if (!Array.isArray(options)) options = [];
        } catch (_e) {
          options = [];
        }

        return {
          content: (q as any).content,
          options: options,
          answer: (q as any).answer,
          explanation: (q as any).explanation || '库内相似真题解析，建议巩固相关知识点。'
        };
      });

      // 填充补齐 3 道题
      while (mappedChallenges.length < 3) {
        mappedChallenges.push({ ...mappedChallenges[0] });
      }

      return {
        logicType: 'complement',
        challenges: mappedChallenges.slice(0, 3)
      } as RegressionChallenge;
    }

    // 最终兜底
    logger.error('Final fallback failed: AI and RAG both unavailable.');
    throw new Error('无法生成挑战且本地题库检索失败，请检查 AI 配置');
  }
}


// (ensureFirstPrinciplesCacheTable 移除，已由 Drizzle 管理)

// 生成内容哈希
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

export async function generateFirstPrinciplesAction(
  questionContent: string,
  explanation: string,
  correctAnswer: string,
  wrongAnswer?: string,
  force: boolean = false
): Promise<{ analysis: string; cached?: boolean }> {
  const user = await requireUser();

  if (!questionContent) {
    throw new Error('缺少题目内容');
  }

  // 1. Check Cache (skip if force=true)
  const cacheKey = generateHash(questionContent + correctAnswer + (wrongAnswer || ''));

  if (!force) {
    const cached = await drizzleDb.query.first_principles_cache.findFirst({
      where: eq(drizzleSchema.first_principles_cache.question_hash, cacheKey)
    });

    if (cached) {
      logger.info('[FirstPrinciples] 命中缓存');
      return { analysis: cached.analysis, cached: true };
    }
  }

  // 2. Check Quota
  // Note: Cast user.id to number as checkAndConsumeQuota expects number
  const userIdNum = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
  if (!isNaN(userIdNum)) {
    const quotaResult = checkAndConsumeQuota(userIdNum, 'first_principles');
    if (!quotaResult.allowed) {
      throw new Error(quotaResult.message || '今日第一性原理分析次数已用完，请升级套餐解锁更多。');
    }
  }

  // 3. Build Prompt (User's original prompt logic)
  // Use DB template if exists, otherwise use hardcoded logic from user request to ensure fidelity
  const dbTemplate = await getPromptFromDb('first_principles');

  let prompt: string;
  if (dbTemplate) {
    prompt = buildPrompt(dbTemplate, {
      questionContent,
      explanation: explanation || '略',
      correctAnswer,
      wrongAnswer: wrongAnswer || '无'
    });
  } else {
    // User's requested specific prompt format
    prompt = `请用"第一性原理"解析这道题。要求：
1. 直接给答案，只说底层逻辑，不超过200字
2. 不要使用黑话，用通俗易懂的语言
3. 严格基于提供的题目内容和选项进行分析，禁止引用题目中未提及的观点，禁止编造不存在的选项。

题目：${questionContent}
正确答案：${correctAnswer}
${wrongAnswer ? `用户选择：${wrongAnswer}` : ''}
${explanation ? `参考解析：${explanation}` : ''}

回复格式：
【答案】X
【核心逻辑】...`;
  }

  try {
    logger.info('[FirstPrinciples] 开始调用 AI...');
    // User requested 'economy' model with specific timeout
    const result = await generateTextWrapper(prompt, 'economy', undefined, undefined, {
      timeout: 30000,
      retries: 1,
    });
    const text = result.text;
    logger.info({ value: text.length }, '[FirstPrinciples] AI 调用成功，长度');

    // 4. Save to Cache
    try {
      await drizzleDb.insert(drizzleSchema.first_principles_cache)
        .values({ question_hash: cacheKey, analysis: text })
        .onConflictDoUpdate({ target: drizzleSchema.first_principles_cache.question_hash, set: { analysis: text } });
    } catch (cacheError) {
      logger.error({ err: cacheError }, '[FirstPrinciples] 缓存保存失败');
    }

    return { analysis: text, cached: false };
  } catch (error: unknown) {
    logger.error({ err: error }, 'First Principles analysis failed');
    throw new Error(`AI 分析失败: ${getErrorMessage(error, '请稍后重试')}`);
  }
}


