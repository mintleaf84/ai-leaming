/**
 * AI 客户端核心功能封装
 */

import { generateText, streamText, generateObject, stepCountIs } from 'ai';
import type { ModelMessage, ToolSet } from 'ai';
import { z } from 'zod';
import { logApiCall } from '@/lib/admin/api-stats-service';

// 内部模块导入
import { AiRawResponseError } from './types';
import { getAiConfig } from './config';
import { getModel } from './provider';
import { extractJson, autoUnpackNestedJson } from './parser';
import { withRetry } from './retry';

// 导出类型供外部使用
export { AiRawResponseError };
export { getAiConfig, clearAiConfigCache } from './config';
export { getModel } from './provider';

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

    // E2E 测试模式
    if (process.env.E2E_TEST === 'true') {
        console.log('[AiClient] E2E 模式：返回模拟结构化数据');
        return {
            analysis: "E2E 模拟分析报告",
            challenges: [],
            score: 85,
            is_correct: true,
            explanation: "E2E 模拟解析",
            summary: "E2E 模拟总结",
            key_points: ["测试点1"],
            recommendations: ["建议1"]
        } as unknown as T;
    }

    const isGenericProxy = config.baseURL.includes('deepseek') || !config.baseURL.includes('openai.com');
    const startTime = Date.now();

    try {
        // 1. 尝试原生结构化输出 (OpenAI 官方接口且非推理模型)
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
        throw new Error('Using fallback mode');
    } catch (error: unknown) {
        // 2. 兼容模式：文本生成 + 手动提取
        let rawText = '';
        const startTimeFallback = Date.now();
        try {
            const fallbackPrompt = `${prompt}\n\nIMPORTANT: Return ONLY a valid JSON object matching the requested schema.`;

            const { text } = await withRetry(async () => {
                return await generateText({
                    model,
                    messages: [{ role: 'user', content: fallbackPrompt }],
                    abortSignal: AbortSignal.timeout(timeout),
                });
            }, retries);
            rawText = text;

            logApiCall({
                model: config.modelName,
                endpoint: 'generateStructuredData',
                inputTokens: Math.ceil(prompt.length / 4),
                outputTokens: Math.ceil(text.length / 4),
                durationMs: Date.now() - startTimeFallback,
                success: true,
            });

            let parsed = extractJson(text) as Record<string, unknown>;
            
            // 自动处理嵌套
            // 获取 schema 中的 key 作为参考 (如果可能)
            parsed = autoUnpackNestedJson(parsed, ['analysis', 'challenges', 'quiz', 'logicType']);

            try {
                return schema.parse(parsed) as T;
            } catch (zodError: unknown) {
                console.error('[AiClient] Zod 校验失败:', JSON.stringify(parsed, null, 2));
                throw zodError;
            }
        } catch (fallbackError: unknown) {
            throw new AiRawResponseError(`AI 生成失败: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`, rawText);
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

    if (process.env.E2E_TEST === 'true') {
        return { text: "E2E 模拟回复文本" };
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
        throw error;
    }
}

/**
 * 流式对话封装
 */
export async function streamChatWrapper(
    messages: ModelMessage[],
    onFinish?: (text: string) => void,
    tools?: ToolSet,
    system?: string
) {
    const config = getAiConfig('premium');
    const model = getModel(config.apiKey, config.baseURL, config.modelName);

    if (process.env.E2E_TEST === 'true') {
        if (onFinish) setTimeout(() => onFinish("E2E 模拟流式回复"), 100);
        return {
            textStream: (async function* () { yield "E2E 模拟回复。"; })(),
            fullStream: (async function* () { yield { type: 'text-delta', textDelta: "E2E 模拟回复。" }; })(),
            onFinish: Promise.resolve()
        } as any;
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