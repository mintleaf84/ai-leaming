/**
 * AI 模型供应商初始化工厂
 */

import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

/**
 * 获取 LanguageModel 实例
 * 通过绑定特定的 provider 配置来避免 "No providers registered" 错误
 */
export function getModel(apiKey: string, baseURL: string, modelName: string): LanguageModel {
    const provider: unknown = createOpenAI({
        apiKey,
        baseURL,
    });

    // 兼容不同版本/导出形式：
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
        console.warn('[AiProvider] getModel provider 调用失败，尝试兼容路径失败:', err);
    }

    throw new Error('Unsupported OpenAI provider shape returned by createOpenAI');
}
