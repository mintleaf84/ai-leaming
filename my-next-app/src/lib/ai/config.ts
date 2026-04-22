/**
 * AI 配置与路由管理 (带缓存)
 */

import { db } from '@/lib/db';
import { AiModelRouteRow, AiConfigRow, AiConfigResult } from './types';

// 简单的进程内缓存
interface CacheEntry<T> {
    data: T;
    expiry: number;
}
const configCache = new Map<string, CacheEntry<AiConfigResult>>();
const CACHE_TTL = 60 * 1000; // 1 分钟过期

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
 * 动态获取配置 (支持多服务商路由)
 */
export function getAiConfig(feature?: string, overrideKey?: string, overrideUrl?: string): AiConfigResult {
    ensureSettingsTable();

    // 如果有 override，不使用缓存
    if (overrideKey && overrideUrl) {
        return fetchConfigFromDb(feature, overrideKey, overrideUrl);
    }

    const cacheKey = feature || 'global_active';
    const cached = configCache.get(cacheKey);
    
    if (cached && cached.expiry > Date.now()) {
        return cached.data;
    }

    const result = fetchConfigFromDb(feature);
    
    // 写入缓存
    configCache.set(cacheKey, {
        data: result,
        expiry: Date.now() + CACHE_TTL
    });

    return result;
}

/**
 * 从数据库实际读取配置
 */
function fetchConfigFromDb(feature?: string, overrideKey?: string, overrideUrl?: string): AiConfigResult {
    const envKey = process.env.AI_API_KEY || '';
    const envUrl = process.env.AI_API_URL || 'https://api.openai.com/v1';

    const defaultResult: AiConfigResult = {
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

    if (overrideKey && overrideUrl) {
        return defaultResult;
    }

    try {
        // 1. 尝试从路由表获取
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

        // 2. 兜底获取激活的全局配置
        const activeConfig = db.prepare("SELECT * FROM ai_configs WHERE is_active = 1").get() as AiConfigRow | undefined;

        if (activeConfig) {
            const result: AiConfigResult = {
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

            if (feature === 'economy') result.modelName = activeConfig.model_economy ?? result.modelName;
            if (feature === 'premium') result.modelName = activeConfig.model_premium ?? result.modelName;
            if (feature === 'embedding') result.modelName = activeConfig.model_embedding ?? result.modelName;
            if (feature === 'rerank') result.modelName = activeConfig.model_rerank ?? result.modelName;
            if (feature === 'knowledge') result.modelName = activeConfig.model_knowledge ?? result.modelName;

            return result;
        }
    } catch (e) {
        console.error('[AiConfig] 获取配置失败:', e);
    }

    return defaultResult;
}

/**
 * 手动清除配置缓存 (通常由 Admin 触发)
 */
export function clearAiConfigCache() {
    configCache.clear();
}
