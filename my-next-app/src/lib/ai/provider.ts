/**
 * AI 模型供应商初始化工厂
 */

import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

/**
 * 获取 LanguageModel 实例
 * 针对新版 SDK (ai@6.x) 优化了自定义 baseURL 的识别逻辑
 */
export function getModel(apiKey: string, baseURL: string, modelName: string): LanguageModel {
    // 创建 OpenAI 兼容供应商实例
    const openai = createOpenAI({
        apiKey,
        baseURL,
        compatibility: 'compatible', // 强制开启兼容模式，解决非官方接口的路径识别问题
    });

    try {
        // 显式指定使用 Chat 协议 (解决 /v1/responses 404 问题的关键)
        // 在新版 SDK 中，针对自定义 BaseURL，使用 .chat() 能确保走 /chat/completions 路径
        if (typeof (openai as any).chat === 'function') {
            return (openai as any).chat(modelName);
        }

        // 兜底：如果 chat 属性不存在，尝试作为函数直接调用
        if (typeof openai === 'function') {
            return (openai as any)(modelName);
        }
    } catch (err) {
        console.warn('[AiProvider] 初始化模型失败，尝试路径不匹配:', err);
    }

    throw new Error(`无法初始化 AI 模型: ${modelName}。请检查 SDK 版本或配置。`);
}
