/**
 * 题目相关类型定义
 * Question Related Type Definitions
 */
import { z } from 'zod';
import { QuestionSchema, QuestionRowSchema, CorrectionQuizSchema, RegressionChallengeSchema } from '@/lib/schemas';

// 基础题目类型（从 Zod schema 推导）
export type Question = z.infer<typeof QuestionSchema> & { id: number };

// 数据库行类型
export type QuestionRow = z.infer<typeof QuestionRowSchema>;

// 纠错测验类型
export type CorrectionQuiz = z.infer<typeof CorrectionQuizSchema>;

// 回归挑战类型
export type RegressionChallenge = z.infer<typeof RegressionChallengeSchema>;

// 认知维度
export type Dimension = 'knowledge' | 'understanding' | 'application';

// 维度中文映射
export const DIMENSION_LABELS: Record<Dimension, string> = {
    knowledge: '识记',
    understanding: '理解',
    application: '应用'
};

// 题目类型
export type QuestionType = 'single' | 'multi' | 'truefalse';
