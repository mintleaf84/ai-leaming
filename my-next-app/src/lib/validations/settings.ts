import { z } from 'zod';

export const SystemSettingsSchema = z.object({
  reviewThreshold: z.number().min(0).max(100),
  aiSeverity: z.enum(['low', 'medium', 'high']),
  darkMode: z.boolean(),
});
