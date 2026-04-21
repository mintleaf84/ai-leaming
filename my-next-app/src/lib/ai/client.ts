import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText, generateObject, stepCountIs } from 'ai';
import type { LanguageModel, ModelMessage, ToolSet } from 'ai';
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
interface _FeatureFlagRow {
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
  } catch (_e) { }
}

/**
 * 获取 LanguageModel 实例 (核心修复点)
 * 通过绑定特定的 provider 配置来避免 "No providers registered" 错误
 */
export function getModel(apiKey: string, baseURL: string, modelName: string): LanguageModel {
  const provider: unknown = createOpenAI({
    apiKey,
    baseURL,
  });

  // 兼容不同版本/导出形式：
  // - provider 可能是一个函数（直接调用返回 model）
  // - provider 可能是一个对象，包含 chat()/model() 方法
  // - 有时会以 { default: fn } 的形式导出
  try {
    if (typeof provider === 'function') {
      return (provider as Function)(modelName) as LanguageModel;
    }

    const provObj = provider as Record<string, unknown> | undefined;
    if (provObj && typeof provObj.chat === 'function') {
      return (provObj.chat as Function)(modelName) as LanguageModel;
    }

    if (provObj && typeof provObj.model === 'function') {
      return (provObj.model as Function)(modelName) as LanguageModel;
    }

    if (provObj && provObj.default) {
      const d = provObj.default as unknown;
      if (typeof d === 'function') return (d as Function)(modelName) as LanguageModel;
      const dObj = d as Record<string, unknown> | undefined;
      if (dObj && typeof dObj.chat === 'function') return (dObj.chat as Function)(modelName) as LanguageModel;
    }
  } catch (err) {
    console.warn('[AiClient] getModel provider 调用失败，尝试兼容路径失败:', err);
  }

  throw new Error('Unsupported OpenAI provider shape returned by createOpenAI');
}

/**
 * 动态获取配置 (支持多服务商路由)
 */
export function getAiConfig(feature?: string, overrideKey?: string, overrideUrl?: string) {
  ensureSettingsTable();

  // 基础兜底值 (环境变量)
  const envKey = process.env.AI_API_KEY || '';
  const envUrl = process.env.AI_API_URL || 'https://api.openai.com/v1';

  const defaultResult = {
    apiKey: overrideKey || envKey,
    baseURL: overrideUrl || envUrl,
    modelName: 'gpt-4o-mini', 
    modelEconomy: 'gpt-4o-mini',
    modelPremium: 'gpt-4o',
    modelEmbedding: 'text-embedding-3-small',
    modelRerank: '',
    modelKnowledge: '',
    embeddingDimensions: 1024
  };

  // 1. 如果指定了覆盖参数，直接返回
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
          apiKey: route.api_key || defaultResult.apiKey,
          baseURL: route.api_url || defaultResult.baseURL,
          modelName: route.model_name || defaultResult.modelName,
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
        apiKey: activeConfig.api_key || defaultResult.apiKey,
        baseURL: activeConfig.api_url || defaultResult.baseURL,
        modelName: activeConfig.model_premium || 'gpt-4o',
        modelEconomy: activeConfig.model_economy,
        modelPremium: activeConfig.model_premium,
        modelEmbedding: activeConfig.model_embedding,
        modelRerank: activeConfig.model_rerank,
        modelKnowledge: activeConfig.model_knowledge,
        embeddingDimensions: activeConfig.embedding_dimensions || 1024
      };

      // 根据 feature 角色调整 modelName
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
  } catch (_e) {
    // 4. 极致兜底：尝试寻找第一个 { 和最后一个 }
    const firstBrace = targetText.indexOf('{');
    const lastBrace = targetText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      try {
        const braceText = targetText.substring(firstBrace, lastBrace + 1).replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
        return JSON.parse(braceText);
      } catch (_innerError) {
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
  const config = getAiConfig(tier);
  const model = getModel(config.apiKey, config.baseURL, config.modelName);
  
  const isReasoningModel = config.modelName.toLowerCase().includes('r1') || config.modelName.toLowerCase().includes('thinking');
  let timeout = isReasoningModel ? 90000 : 45000;
  if (options?.timeout) timeout = options.timeout;

  const retries = options?.retries !== undefined ? options.retries : 3;

  // E2E 测试模式：禁用真实 AI 调用，返回模拟数据
  if (process.env.E2E_TEST === 'true') {
    console.log('[AiCore] E2E 模式：返回模拟结构化数据');
    return {
      analysis: "E2E 模拟分析报告：这是一个自动生成的模拟回复，用于测试流程。",
      challenges: [],
      score: 85,
      is_correct: true,
      explanation: "E2E 模拟解析：为了确保测试流程畅通，我们跳过了真实的 AI 调用。",
      summary: "E2E 模拟总结",
      key_points: ["测试点1", "测试点2"],
      recommendations: ["建议1"]
    } as unknown as T;
  }

  // 检查是否为已知可能不支持原生 JSON Schema 的接口 (如 DeepSeek 或自定义中转)
  const isGenericProxy = config.baseURL.includes('deepseek') || !config.baseURL.includes('openai.com');

  const startTime = Date.now();
  try {
    // 只有在官方 OpenAI 接口且非推理模型时，才优先尝试原生结构化输出
    if (!isGenericProxy && !isReasoningModel) {
      const result = await withRetry(async () => {
        const { object } = await generateObject({
          model,
          schema,
          messages: [{ role: 'user', content: prompt }],
          abortSignal: AbortSignal.timeout(timeout),
        });
        return object;
      });

      // 记录 API 调用
      logApiCall({
        model: config.modelName,
        endpoint: 'generateStructuredData',
        inputTokens: Math.ceil(prompt.length / 4),
        outputTokens: Math.ceil(JSON.stringify(result).length / 4),
        durationMs: Date.now() - startTime,
        success: true,
      });

      return result as T;
    }

    // 否则直接进入“文本生成 + 清洗提取”模式
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
        return await generateText({
          model,
          messages: [{ role: 'user', content: fallbackPrompt }],
          abortSignal: AbortSignal.timeout(timeout),
        });
      }, retries);
      rawText = text;

      // 记录 API 调用
      logApiCall({
        model: config.modelName,
        endpoint: 'generateStructuredData',
        inputTokens: Math.ceil(prompt.length / 4),
        outputTokens: Math.ceil(text.length / 4),
        durationMs: Date.now() - startTimeFallback,
        success: true,
      });

      // 使用借鉴自 Cherry Studio 的清洗提取逻辑
      let parsed = extractJson(text) as Record<string, unknown>;

      // 自动修复嵌套结构
      if (!parsed.analysis && !parsed.challenges) {
        const keys = Object.keys(parsed);
        if (keys.length === 1 && typeof parsed[keys[0]] === 'object') {
          console.log(`[AiCore] 检测到可能的嵌套结构，自动解包根节点: ${keys[0]}`);
          parsed = parsed[keys[0]] as Record<string, unknown>;
        }
      }

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
  const config = getAiConfig(tier, overrideKey, overrideUrl);
  const model = getModel(config.apiKey, config.baseURL, config.modelName);

  const isReasoningModel = config.modelName.toLowerCase().includes('r1') || config.modelName.toLowerCase().includes('thinking');
  let timeout = isReasoningModel ? 90000 : 60000;
  if (options?.timeout) timeout = options.timeout;
  const retries = options?.retries !== undefined ? options.retries : 3;

  const startTime = Date.now();

  // E2E 测试模式
  if (process.env.E2E_TEST === 'true') {
    return { text: "E2E 模拟回复：这是一段用于测试的模拟文本。" };
  }

  try {
    const { text } = await withRetry(async () => {
      return await generateText({
        model,
        messages: [{ role: 'user', content: prompt }],
        abortSignal: AbortSignal.timeout(timeout),
      });
    }, retries);

    logApiCall({
      model: config.modelName,
      endpoint: 'generateText',
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: Math.ceil(text.length / 4),
      durationMs: Date.now() - startTime,
      success: true,
    });

    return { text };
  } catch (error: unknown) {
    logApiCall({
      model: config.modelName,
      endpoint: 'generateText',
      durationMs: Date.now() - startTime,
      success: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    console.error('[AiCore] Connection Error:', error instanceof Error ? error.message : error);
    throw error;
  }
}

export async function streamChatWrapper(
  messages: ModelMessage[],
  onFinish?: (text: string) => void,
  tools?: ToolSet,
  system?: string
) {
  const config = getAiConfig('premium');
  const model = getModel(config.apiKey, config.baseURL, config.modelName);

  // E2E 测试模式
  if (process.env.E2E_TEST === 'true') {
    if (onFinish) {
      setTimeout(() => onFinish("E2E 模拟流式回复：测试通过。"), 100);
    }
    return {
      textStream: (async function* () { yield "E2E 模拟回复。"; })(),
      fullStream: (async function* () { yield { type: 'text-delta', textDelta: "E2E 模拟回复。" }; })(),
      onFinish: Promise.resolve()
    } as unknown as ReturnType<typeof streamText>;
  }

  const inputLength = messages.reduce((acc, m) => acc + (m.content?.length || 0), 0);
  setTimeout(() => {
    logApiCall({
      model: config.modelName,
      endpoint: 'streamChat',
      inputTokens: Math.ceil(inputLength / 4),
      success: true,
    });
  }, 0);

  return await streamText({
    model,
    messages,
    system,
    tools,
    stopWhen: stepCountIs(tools ? 5 : 1),
    onFinish: onFinish ? (result) => onFinish(result.text) : undefined,
  });
}