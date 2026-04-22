/**
 * 题目相关类型定义
 * Question Related Type Definitions
 */
import { z } from 'zod';
import { QuestionSchema, QuestionRowSchema, CorrectionQuizSchema, RegressionChallengeSchema } from '@/lib/schemas';

// 基础题目类型（直接从 Zod schema 推导，确保单源真相）
export type Question = z.infer<typeof QuestionRowSchema>;

// 数据库行类型（保持兼容性）
export type QuestionRow = Question;

// 纠错测验类型
export type CorrectionQuiz = z.infer<typeof CorrectionQuizSchema>;

// 回归挑战类型
export type RegressionChallenge = z.infer<typeof RegressionChallengeSchema>;


// 认知维度
export type Dimension = z.infer<typeof QuestionSchema>['dimension'] & ('knowledge' | 'understanding' | 'application');

// 维度中文映射
export const DIMENSION_LABELS: Record<string, string> = {
    knowledge: '识记',
    understanding: '理解',
    application: '应用'
};

// 题目类型 (从 Zod 推导)
export type QuestionType = NonNullable<z.infer<typeof QuestionSchema>['type']>;

