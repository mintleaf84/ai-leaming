import { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { AiModelRouteRow, AiConfigRow, AiConfigResult } from './types';
import { env } from '@/env';

// 简单的进程内缓存
interface CacheEntry<T> {
    data: T;
    expiry: number;
}
const configCache = new Map<string, CacheEntry<AiConfigResult>>();
const CACHE_TTL = 60 * 1000; // 1 分钟过期

/**
 * 动态获取配置 (支持多服务商路由)
 */
export async function getAiConfig(feature?: string, overrideKey?: string, overrideUrl?: string): Promise<AiConfigResult> {
    // 如果有 override，不使用缓存
    if (overrideKey && overrideUrl) {
        return await fetchConfigFromDb(feature, overrideKey, overrideUrl);
    }

    const cacheKey = feature || 'global_active';
    const cached = configCache.get(cacheKey);
    
    if (cached && cached.expiry > Date.now()) {
        return cached.data;
    }

    const result = await fetchConfigFromDb(feature);
    
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
async function fetchConfigFromDb(feature?: string, overrideKey?: string, overrideUrl?: string): Promise<AiConfigResult> {
    const envKey = env.AI_API_KEY;
    const envUrl = env.AI_API_URL;

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
            const route = await drizzleDb
                .select({
                    model_name: drizzleSchema.ai_model_routes.model_name,
                    api_key: drizzleSchema.ai_configs.api_key,
                    api_url: drizzleSchema.ai_configs.api_url,
                    model_economy: drizzleSchema.ai_configs.model_economy,
                    model_premium: drizzleSchema.ai_configs.model_premium,
                    model_embedding: drizzleSchema.ai_configs.model_embedding,
                    model_rerank: drizzleSchema.ai_configs.model_rerank,
                    model_knowledge: drizzleSchema.ai_configs.model_knowledge,
                    embedding_dimensions: drizzleSchema.ai_configs.embedding_dimensions
                })
                .from(drizzleSchema.ai_model_routes)
                .innerJoin(drizzleSchema.ai_configs, eq(drizzleSchema.ai_model_routes.config_id, drizzleSchema.ai_configs.id))
                .where(eq(drizzleSchema.ai_model_routes.feature, feature))
                .limit(1)
                .all();

            if (route.length > 0) {
                const r = route[0];
                return {
                    ...defaultResult,
                    apiKey: r.api_key || defaultResult.apiKey,
                    baseURL: r.api_url || defaultResult.baseURL,
                    modelName: r.model_name || defaultResult.modelName,
                    modelEconomy: r.model_economy || 'gpt-4o-mini',
                    modelPremium: r.model_premium || 'gpt-4o',
                    modelEmbedding: r.model_embedding || 'text-embedding-3-small',
                    modelRerank: r.model_rerank || '',
                    modelKnowledge: r.model_knowledge || '',
                    embeddingDimensions: r.embedding_dimensions || 1024
                };
            }
        }

        // 2. 兜底获取激活的全局配置
        const activeConfig = await drizzleDb.query.ai_configs.findFirst({
            where: eq(drizzleSchema.ai_configs.is_active, true)
        });

        if (activeConfig) {
            const result: AiConfigResult = {
                ...defaultResult,
                apiKey: activeConfig.api_key || defaultResult.apiKey,
                baseURL: activeConfig.api_url || defaultResult.baseURL,
                modelName: activeConfig.model_premium || 'gpt-4o',
                modelEconomy: activeConfig.model_economy || 'gpt-4o-mini',
                modelPremium: activeConfig.model_premium || 'gpt-4o',
                modelEmbedding: activeConfig.model_embedding || 'text-embedding-3-small',
                modelRerank: activeConfig.model_rerank || '',
                modelKnowledge: activeConfig.model_knowledge || '',
                embeddingDimensions: activeConfig.embedding_dimensions || 1024
            };

            if (feature === 'economy') result.modelName = activeConfig.model_economy || result.modelName;
            if (feature === 'premium') result.modelName = activeConfig.model_premium || result.modelName;
            if (feature === 'embedding') result.modelName = activeConfig.model_embedding || result.modelName;
            if (feature === 'rerank') result.modelName = activeConfig.model_rerank || result.modelName;
            if (feature === 'knowledge') result.modelName = activeConfig.model_knowledge || result.modelName;

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
