import { createExecutor, definePlugin } from '@cherrystudio/ai-core';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import db from '@/lib/db';
import { logApiCall } from '@/lib/api-stats-service';

/**
 * AI 原始响应错误 - 携带服务端返回的原始文本，便于调试
 */
export class AiRawResponseError extends Error {
    rawResponse?: string;
    constructor(message: string, rawResponse?: string) {
        super(message);
        this.name = 'AiRawResponseError';
        this.rawResponse = rawResponse;
    }
}

/** AI 模型路由记录（来自 ai_model_routes + ai_configs JOIN 查询） */
interface AiModelRouteRow {
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
interface AiConfigRow {
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

/** feature_flags / ai_model_routes 中的功能开关行 */
interface FeatureFlagRow {
    enabled: number;
}

/**
 * 确保数据库表存在 (容错处理)
 */
function ensureSettingsTable() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (e) { }
}

/**
 * 核心配置与注册逻辑
 */
async function ensureProviderRegistered(apiKey: string, baseURL: string) {
  const openaiProvider = createOpenAI({
    apiKey,
    baseURL,
  });
  // 注册 OpenAI 兼容 provider（运行时动态配置）
  void openaiProvider; // Provider 通过 createExecutor 内部管理
}

/**
 * 动态获取配置 (支持多服务商路由)
 */
export function getAiConfig(feature?: string, overrideKey?: string, overrideUrl?: string) {
  ensureSettingsTable();

  // 默认值
  let apiKey = overrideKey || process.env.AI_API_KEY || '';
  let baseURL = overrideUrl || process.env.AI_API_URL || 'https://api.openai.com/v1';
  let modelName = 'DeepSeek-R1';

  const defaultResult = {
    apiKey,
    baseURL,
    modelName,
    modelEconomy: 'gpt-4o-mini',
    modelPremium: 'gpt-4o',
    modelEmbedding: 'text-embedding-3-small',
    modelRerank: '',
    modelKnowledge: '',
    embeddingDimensions: 1024
  };

  // 1. 如果指定了覆盖，优先处理
  if (overrideKey && overrideUrl) {
    return defaultResult;
  }

  try {
    // 2. 尝试从路由表获取该功能的配置
    if (feature) {
      const route = db.prepare(`
        SELECT r.model_name, c.api_key, c.api_url, c.model_economy, c.model_premium, c.model_embedding, c.model_rerank, c.model_knowledge, c.embedding_dimensions
        FROM ai_model_routes r
        JOIN ai_configs c ON r.config_id = c.id
        WHERE r.feature = ?
      `).get(feature) as AiModelRouteRow | undefined;

      if (route) {
        return {
          ...defaultResult,
          apiKey: route.api_key || apiKey,
          baseURL: route.api_url || baseURL,
          modelName: route.model_name,
          modelEconomy: route.model_economy,
          modelPremium: route.model_premium,
          modelEmbedding: route.model_embedding,
          modelRerank: route.model_rerank,
          modelKnowledge: route.model_knowledge,
          embeddingDimensions: route.embedding_dimensions || 1024
        };
      }
    }

    // 3. 兜底：获取当前激活的全局配置
    const activeConfig = db.prepare("SELECT * FROM ai_configs WHERE is_active = 1").get() as AiConfigRow | undefined;

    if (activeConfig) {
      const result = {
        ...defaultResult,
        apiKey: activeConfig.api_key || apiKey,
        baseURL: activeConfig.api_url || baseURL,
        modelName: activeConfig.model_premium || 'gpt-4o',
        modelEconomy: activeConfig.model_economy,
        modelPremium: activeConfig.model_premium,
        modelEmbedding: activeConfig.model_embedding,
        modelRerank: activeConfig.model_rerank,
        modelKnowledge: activeConfig.model_knowledge,
        embeddingDimensions: activeConfig.embedding_dimensions || 1024
      };

      // 如果指定了具体 feature 但路由没找到，尝试从激活配置的对应列取
      if (feature === 'economy') result.modelName = activeConfig.model_economy ?? result.modelName;
      if (feature === 'premium') result.modelName = activeConfig.model_premium ?? result.modelName;
      if (feature === 'embedding') result.modelName = activeConfig.model_embedding ?? result.modelName;
      if (feature === 'rerank') result.modelName = activeConfig.model_rerank ?? result.modelName;
      if (feature === 'knowledge') result.modelName = activeConfig.model_knowledge ?? result.modelName;

      return result;
    }
  } catch (e) {
    console.error('[AiClient] 获取配置失败:', e);
  }

  return defaultResult;
}

/**
 * 获取执行器实例
 */
async function getExecutor(apiKey: string, baseURL: string) {
  await ensureProviderRegistered(apiKey, baseURL);
  return createExecutor('openai-chat', { apiKey, baseURL });
}

/**
 * 健壮的 JSON 提取工具 (借鉴 Cherry Studio)
 */
function extractJson(text: string): unknown {
  // 1. 移除 DeepSeek 等模型的 <think> 标签内容
  const cleanedText = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  // 2. 尝试正则匹配 Markdown 代码块中的 JSON
  const jsonBlockMatch = cleanedText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const targetText = jsonBlockMatch ? jsonBlockMatch[1] : cleanedText;

  try {
    // 3. 直接解析 (处理可能的非法控制字符)
    const normalizedText = targetText.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
    return JSON.parse(normalizedText);
  } catch (e) {
    // 4. 极致兜底：尝试寻找第一个 { 和最后一个 }
    const firstBrace = targetText.indexOf('{');
    const lastBrace = targetText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      try {
        const braceText = targetText.substring(firstBrace, lastBrace + 1).replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
        return JSON.parse(braceText);
      } catch (innerError) {
        throw new Error('无法从响应中提取有效的 JSON 格式');
      }
    }
    throw new Error('无法从响应中提取有效的 JSON 格式');
  }
}

/**
 * 指数退避重试辅助函数 (借鉴 Cherry Studio)
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    if (retries <= 0) throw error;

    // 仅针对可重试的错误进行重试 (如 429, 500, 502, 503, 504)
    const status = error instanceof Error ? (error as Error & { status?: number }).status : undefined;
    const isRetryable = !status || [429, 500, 502, 503, 504].includes(status);

    if (isRetryable) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[AiRetry] 发生错误，正在重试 (${retries} 次剩余):`, msg);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

/**
 * 结构化数据生成 (带健壮的解析、重试与动态超时)
 */
export async function generateStructuredData<T>(
  schema: z.ZodType<T>,
  prompt: string,
  tier: 'economy' | 'premium' = 'economy',
  options?: { retries?: number; timeout?: number }
) {
  const { apiKey, baseURL, modelName } = getAiConfig(tier);
  const executor = await getExecutor(apiKey, baseURL);
  const resolvedModelName = modelName || 'gpt-4o';

  const isReasoningModel = resolvedModelName.toLowerCase().includes('r1') || resolvedModelName.toLowerCase().includes('thinking');
  let timeout = isReasoningModel ? 90000 : 45000;
  if (options?.timeout) timeout = options.timeout;

  const retries = options?.retries !== undefined ? options.retries : 3;

  // 检查是否为已知可能不支持原生 JSON Schema 的接口 (如 DeepSeek 或自定义中转)
  const isGenericProxy = baseURL.includes('deepseek') || !baseURL.includes('openai.com');

  const startTime = Date.now();
  try {
    // 只有在官方 OpenAI 接口且非推理模型时，才优先尝试原生结构化输出
    // 因为推理模型(R1)在 generateObject 下的表现通常不如 generateText + 清洗
    if (!isGenericProxy && !isReasoningModel) {
      const result = await withRetry(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { object } = await (executor as any).generateObject({
          model: resolvedModelName as unknown as LanguageModel,
          schema,
          messages: [{ role: 'user', content: prompt }],
          abortSignal: AbortSignal.timeout(timeout),
        });
        return object;
      });

      // 记录 API 调用
      logApiCall({
        model: resolvedModelName,
        endpoint: 'generateStructuredData',
        inputTokens: Math.ceil(prompt.length / 4), // 估算
        outputTokens: Math.ceil(JSON.stringify(result).length / 4), // 估算
        durationMs: Date.now() - startTime,
        success: true,
      });

      return result as T;
    }

    // 否则直接进入“文本生成 + 清洗提取”模式，避免 400 报错
    throw new Error('Using fallback mode for compatibility');
  } catch (error: unknown) {
    if (error instanceof Error && error.message !== 'Using fallback mode for compatibility') {
      console.warn('[AiCore] 尝试原生生成失败，切换至兼容模式:', error.message);
    }

    let rawText = '';
    const startTimeFallback = Date.now();
    try {
      const fallbackPrompt = `${prompt}\n\nIMPORTANT: Return ONLY a valid JSON object matching the requested schema. Ensure the response is a valid JSON string.`;

      const { text } = await withRetry(async () => {
        return await executor.generateText({
          model: resolvedModelName as unknown as LanguageModel,
          messages: [{ role: 'user', content: fallbackPrompt }],
          abortSignal: AbortSignal.timeout(timeout),
        });
      }, retries);
      rawText = text;

      // 记录 API 调用
      logApiCall({
        model: resolvedModelName,
        endpoint: 'generateStructuredData',
        inputTokens: Math.ceil(prompt.length / 4), // 估算
        outputTokens: Math.ceil(text.length / 4),
        durationMs: Date.now() - startTimeFallback,
        success: true,
      });

      // 使用借鉴自 Cherry Studio 的清洗提取逻辑
      let parsed = extractJson(text) as Record<string, unknown>;

      // 自动修复：如果 AI 把结果嵌套在某个键下面 (如 { "CorrectionQuiz": { ... } })
      if (!parsed.analysis && !parsed.challenges) {
        const keys = Object.keys(parsed);
        if (keys.length === 1 && typeof parsed[keys[0]] === 'object') {
          console.log(`[AiCore] 检测到可能的嵌套结构，自动解包根节点: ${keys[0]}`);
          parsed = parsed[keys[0]] as Record<string, unknown>;
        }
      }

      // Zod 校验确保数据完整性
      try {
        return schema.parse(parsed) as T;
      } catch (zodError: unknown) {
        console.error('[AiCore] Zod 校验失败，解析后的对象为:', JSON.stringify(parsed, null, 2));
        throw zodError;
      }
    } catch (fallbackError: unknown) {
      const msg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      console.error('[AiCore] 文本清洗解析也失败:', msg);
      throw new AiRawResponseError(`AI 生成失败: ${msg}`, rawText);
    }
  }
}

/**
 * 文本生成 (带重试与超时)
 */
export async function generateTextWrapper(
  prompt: string,
  tier: 'economy' | 'premium' = 'premium',
  overrideKey?: string,
  overrideUrl?: string,
  options?: { retries?: number; timeout?: number }
) {
  const { apiKey, baseURL, modelName } = getAiConfig(tier, overrideKey, overrideUrl);
  const executor = await getExecutor(apiKey, baseURL);
  const resolvedModelName = modelName || 'gpt-4o';

  const isReasoningModel = resolvedModelName.toLowerCase().includes('r1') || resolvedModelName.toLowerCase().includes('thinking');
  let timeout = isReasoningModel ? 90000 : 60000; // Increased to 60s for standard, 90s for R1
  if (options?.timeout) timeout = options.timeout;
  const retries = options?.retries !== undefined ? options.retries : 3;

  const startTime = Date.now();
  try {
    const { text } = await withRetry(async () => {
      return await executor.generateText({
        model: resolvedModelName as unknown as LanguageModel,
        messages: [{ role: 'user', content: prompt }],
        abortSignal: AbortSignal.timeout(timeout),
      });
    }, retries);

    // 记录 API 调用
    logApiCall({
      model: resolvedModelName,
      endpoint: 'generateText',
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: Math.ceil(text.length / 4),
      durationMs: Date.now() - startTime,
      success: true,
    });

    return { text };
  } catch (error: unknown) {
    // 记录失败的调用
    logApiCall({
      model: resolvedModelName,
      endpoint: 'generateText',
      durationMs: Date.now() - startTime,
      success: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    console.error('[AiCore] Connection Error:', error instanceof Error ? error.message : error);
    throw error;
  }
}

/**
 * 流式聊天包装器 (复用执行器逻辑)
 * 支持工具调用和多步执行
 */
export async function streamChatWrapper(
  messages: { role: string; content: string }[],
  onFinish?: (text: string) => void,
  tools?: Record<string, unknown>,
  system?: string // 允许覆盖默认 system prompt
) {
  const { apiKey, baseURL, modelName } = getAiConfig('premium');
  const executor = await getExecutor(apiKey, baseURL);
  const resolvedModelName = modelName || 'gpt-4o';

  // 记录流式调用开始
  const startTime = Date.now();
  const inputLength = messages.reduce((acc, m) => acc + (m.content?.length || 0), 0);

  // 异步记录，不阻塞流式响应
  setTimeout(() => {
    logApiCall({
      model: resolvedModelName,
      endpoint: 'streamChat',
      inputTokens: Math.ceil(inputLength / 4),
      success: true,
    });
  }, 0);

  return await executor.streamText({
    model: resolvedModelName as unknown as LanguageModel,
    messages,
    system,
    tools,
    maxSteps: tools ? 5 : 1,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onFinish: onFinish ? (result: { text: string }) => onFinish(result.text) : undefined,
  } as Parameters<typeof executor.streamText>[0]);
}