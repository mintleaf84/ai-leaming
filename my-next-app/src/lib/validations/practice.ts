import { z } from "zod";

export const PracticeSessionConfigSchema = z.object({
  mode: z.enum(['smart', 'mistakes', 'review', 'random', 'daily_challenge', 'exam', 'tag_focus', 'dimension_focus', 'intelligent_review', 'focus', 'first-principles']),
  limit: z.number().int().min(1).max(100).default(25),
  types: z.array(z.enum(['single', 'multi', 'truefalse'])).optional(),
  tags: z.array(z.string()).optional(),
  dimensions: z.array(z.enum(['knowledge', 'understanding', 'application'])).optional(),
  enableReview: z.boolean().default(true),
  enableTimer: z.boolean().default(false),
});

export const SubmitAnswerSchema = z.object({
  questionId: z.number().int(),
  userAnswer: z.string(),
  isCorrect: z.boolean(),
  duration: z.number().int(),
  sessionId: z.string().optional(),
  totalDurationMs: z.number().int().optional(),
});
