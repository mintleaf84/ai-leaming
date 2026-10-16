import { z } from "zod";

/**
 * 订阅套餐 Schema
 */
export const SubscriptionPlanSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  tier: z.string().optional(),
  price_monthly: z.number().min(0),
  features: z.array(z.string()).optional(),
  is_active: z.coerce.number().default(1),
  sort_order: z.number().optional(),
  limits: z.record(z.unknown()), // ai_chat, practice, etc.
});

/**
 * 为用户设置订阅的 Schema
 */
export const SetUserSubscriptionSchema = z.object({
  userId: z.number(),
  planId: z.string(),
  durationMonths: z.number().optional(),
});

/**
 * 用量类型 Schema
 */
export const UsageTypeSchema = z.enum([
  "ai_chat",
  "practice",
  "review",
  "rag",
  "ocr",
  "cultivation",
]);
