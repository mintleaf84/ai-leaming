/**
 * AI 客户端通用类型定义
 */

/** AI 模型路由记录（来自 ai_model_routes + ai_configs JOIN 查询） */
export interface AiModelRouteRow {
  model_name: string | null;
  api_key: string;
  api_url: string;
  model_economy: string | null;
  model_premium: string | null;
  model_embedding: string | null;
  model_rerank: string | null;
  model_knowledge: string | null;
  embedding_dimensions: number | null;
}

/** ai_configs 表行 */
export interface AiConfigRow {
  id: number;
  name: string;
  api_url: string;
  api_key: string;
  model_economy: string | null;
  model_premium: string | null;
  model_embedding: string | null;
  model_rerank: string | null;
  model_knowledge: string | null;
  embedding_dimensions: number | null;
  is_active: number;
}

/** 功能配置结果 */
export interface AiConfigResult {
  apiKey: string;
  baseURL: string;
  modelName: string;
  modelEconomy: string | null;
  modelPremium: string | null;
  modelEmbedding: string | null;
  modelRerank: string | null;
  modelKnowledge: string | null;
  embeddingDimensions: number;
}

/**
 * AI 原始响应错误 - 携带服务端返回的原始文本，便于调试
 */
export class AiRawResponseError extends Error {
  rawResponse?: string;
  constructor(message: string, rawResponse?: string) {
    super(message);
    this.name = "AiRawResponseError";
    this.rawResponse = rawResponse;
  }
}
