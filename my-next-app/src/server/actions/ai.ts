'use server';

import { generateStructuredData, generateTextWrapper } from '@/lib/ai/client';
import { getErrorMessage } from '@/lib/utils/error';
import { CorrectionQuizSchema, RegressionChallengeSchema, CorrectionQuiz, RegressionChallenge } from '@/lib/schemas';
import { questionService } from '@/lib/services/question';
import { getPromptFromDbSync, buildPrompt, DEFAULT_CORRECTION_PROMPT, DEFAULT_REGRESSION_PROMPT } from '@/lib/ai/prompts';
import { requireUser } from '@/lib/auth/auth';
import db from '@/lib/db';
import { checkAndConsumeQuota } from '@/lib/billing/subscription-service';

// Default Prompts imported from @/lib/ai/prompts

export async function generateCorrectionQuizAction(
  questionContent: string,
  wrongAnswer: string,
  correctAnswer: string,
  force: boolean = false
): Promise<CorrectionQuiz> {
  // 1. Ensure Table
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_quiz_cache (
        hash TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (e) {
    console.error('[QuizCache] Error creating table:', e);
  }

  // 2. Check Cache
  const cacheKey = generateHash(questionContent + wrongAnswer + correctAnswer);
  if (!force) {
    const cached = db.prepare('SELECT data FROM ai_quiz_cache WHERE hash = ?').get(cacheKey) as { data: string } | undefined;
    if (cached) {
      console.log('[QuizCache] 命中缓存');
      return JSON.parse(cached.data) as CorrectionQuiz;
    }
  }

  const dbTemplate = getPromptFromDbSync('correction_quiz');
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
      db.prepare('INSERT OR REPLACE INTO ai_quiz_cache (hash, data) VALUES (?, ?)').run(cacheKey, JSON.stringify(result));
    } catch (e) {
      console.error('[QuizCache] 保存失败:', e);
    }
    return result;
  } catch (error) {
    console.warn('Correction Quiz AI generation failed, using RAG fallback.');
    const similar = await questionService.searchSimilarQuestions(questionContent, 1);

    if (similar && similar.length > 0) {
      const q = similar[0];
      let options = [];
      try {
        options = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
        if (!Array.isArray(options)) options = [];
      } catch (e) {
        options = [];
      }

      return {
        analysis: "AI 生成暂时不可用，我们为您检索了一道相关的强化训练题。",
        distinctionPoint: "知识点辨析",
        quiz: {
          content: q.content,
          options: options,
          answer: q.answer,
          explanation: q.explanation || '库内相似真题解析'
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
  // 1. Ensure Table
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_challenge_cache (
        hash TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (e) {
    console.error('[ChallengeCache] Error creating table:', e);
  }

  // 2. Check Cache
  const cacheKey = generateHash(questionContent + tags.join('|'));
  if (!force) {
    const cached = db.prepare('SELECT data FROM ai_challenge_cache WHERE hash = ?').get(cacheKey) as { data: string } | undefined;
    if (cached) {
      console.log('[ChallengeCache] 命中缓存');
      return JSON.parse(cached.data) as RegressionChallenge;
    }
  }

  const dbTemplate = getPromptFromDbSync('regression_challenge');
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
        db.prepare('INSERT OR REPLACE INTO ai_challenge_cache (hash, data) VALUES (?, ?)').run(cacheKey, JSON.stringify(challenge));
      } catch (e) {
        console.error('[ChallengeCache] 保存失败:', e);
      }
      return challenge;
    } else {
      console.warn('Double Insurance failed: API B rejected API A. Falling back to library retrieval.');
      throw new Error('Double Insurance rejected');
    }

  } catch (error) {
    console.warn('AI Generation failed or rejected, falling back to RAG similarity search:', error);

    // Fallback: Retrieve similar real questions from the database
    const similarQuestions = await questionService.searchSimilarQuestions(questionContent, 5);

    if (similarQuestions && similarQuestions.length > 0) {
      // 提取并填充，确保满足 Schema 要求的 3 道题
      const mappedChallenges = similarQuestions.map(q => {
        let options = [];
        try {
          options = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
          if (!Array.isArray(options)) options = [];
        } catch (e) {
          options = [];
        }

        return {
          content: q.content,
          options: options,
          answer: q.answer,
          explanation: q.explanation || '库内相似真题解析，建议巩固相关知识点。'
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
    console.error('Final fallback failed: AI and RAG both unavailable.');
    throw new Error('无法生成挑战且本地题库检索失败，请检查 AI 配置');
  }
}


// 确保缓存表存在
function ensureFirstPrinciplesCacheTable() {
  try {
    db.exec(`
          CREATE TABLE IF NOT EXISTS first_principles_cache (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              question_hash TEXT UNIQUE NOT NULL,
              analysis TEXT NOT NULL,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS idx_fp_cache_hash ON first_principles_cache(question_hash);
      `);
  } catch (e) {
    console.error('[FirstPrinciples] 创建缓存表失败:', e);
  }
}

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

  ensureFirstPrinciplesCacheTable();

  // 1. Check Cache (skip if force=true)
  const cacheKey = generateHash(questionContent + correctAnswer + (wrongAnswer || ''));

  if (!force) {
    const cached = db.prepare(
      'SELECT analysis FROM first_principles_cache WHERE question_hash = ?'
    ).get(cacheKey) as { analysis: string } | undefined;

    if (cached) {
      console.log('[FirstPrinciples] 命中缓存');
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
  const dbTemplate = getPromptFromDbSync('first_principles');

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
    console.log('[FirstPrinciples] 开始调用 AI...');
    // User requested 'economy' model with specific timeout
    const result = await generateTextWrapper(prompt, 'economy', undefined, undefined, {
      timeout: 30000,
      retries: 1,
    });
    const text = result.text;
    console.log('[FirstPrinciples] AI 调用成功，长度:', text.length);

    // 4. Save to Cache
    try {
      db.prepare(
        'INSERT OR REPLACE INTO first_principles_cache (question_hash, analysis) VALUES (?, ?)'
      ).run(cacheKey, text);
    } catch (cacheError) {
      console.error('[FirstPrinciples] 缓存保存失败:', cacheError);
    }

    return { analysis: text, cached: false };
  } catch (error: unknown) {
    console.error('First Principles analysis failed:', error);
    throw new Error(`AI 分析失败: ${getErrorMessage(error, '请稍后重试')}`);
  }
}


