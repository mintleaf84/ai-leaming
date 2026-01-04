'use server';

import { generateStructuredData, generateTextWrapper } from '@/lib/ai/client';
import { CorrectionQuizSchema, RegressionChallengeSchema, CorrectionQuiz, RegressionChallenge } from '@/lib/schemas';
import { questionService } from '@/lib/services/question';
import { getPromptFromDbSync, buildPrompt, DEFAULT_CORRECTION_PROMPT, DEFAULT_REGRESSION_PROMPT } from '@/lib/ai/prompts';

// Default Prompts imported from @/lib/ai/prompts

export async function generateCorrectionQuizAction(
  questionContent: string,
  wrongAnswer: string,
  correctAnswer: string
): Promise<CorrectionQuiz> {
  const dbTemplate = getPromptFromDbSync('correction_quiz');
  const template = dbTemplate || DEFAULT_CORRECTION_PROMPT;

  const prompt = buildPrompt(template, {
    questionContent,
    wrongAnswer,
    correctAnswer
  });

  try {
    return await generateStructuredData(CorrectionQuizSchema, prompt, 'premium');
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
  tags: string[]
): Promise<RegressionChallenge> {
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
