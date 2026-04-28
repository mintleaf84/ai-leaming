import { z } from "zod";

export const RandomWrongQuestionsSchema = z.object({
  count: z.number().int().min(1).max(50).default(15),
  tag: z.string().optional(),
  mode: z.enum(['priority', 'random']).default('priority'),
});

export const MarkMasteredSchema = z.object({
  questionId: z.number().int(),
  note: z.string().optional(),
});
