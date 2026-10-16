import { z } from "zod";

/**
 * AI 配置保存 Schema
 */
export const SaveAiConfigSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  api_key: z.string().min(1),
  api_url: z.string().url(),
  model_economy: z.string().optional(),
  model_premium: z.string().optional(),
  model_embedding: z.string().optional(),
  model_rerank: z.string().optional(),
  model_knowledge: z.string().optional(),
  embedding_dimensions: z.number().optional(),
  is_active: z.boolean().optional(),
});

/**
 * 模型路由保存 Schema
 */
export const SaveAiModelRouteSchema = z.object({
  feature: z.string().min(1),
  config_id: z.number(),
  model_name: z.string().min(1),
});

/**
 * 连接测试 Schema
 */
export const TestAiConnectionSchema = z.object({
  apiKey: z.string(),
  apiUrl: z.string(),
  modelName: z.string(),
});
