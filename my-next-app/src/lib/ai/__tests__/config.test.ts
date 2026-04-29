import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB
const { mockGet, mockAll } = vi.hoisted(() => ({
    mockGet: vi.fn(),
    mockAll: vi.fn(),
}));

// Mock @/env — vi.hoisted 确保在 vi.mock 提升时变量已可用
const { mockEnv } = vi.hoisted(() => ({
    mockEnv: {
        JWT_SECRET: 'test-jwt-secret',
        DB_FILENAME: 'ai-learning.db',
        AI_API_KEY: 'env-key',
        AI_API_URL: 'env-url',
        BACKUP_ENCRYPTION_KEY: undefined,
        PADDLE_OCR_TOKEN: undefined,
        LOG_LEVEL: 'info',
        E2E_TEST: 'false',
        NEXT_PUBLIC_APP_URL: undefined,
    },
}));

vi.mock('@/env', () => ({ env: mockEnv }));

vi.mock('@/lib/db', () => {
    const drizzleMock: any = {
        select: vi.fn(() => {
            const chain: any = new Proxy(() => {}, {
                get: (_, prop) => {
                    if (prop === 'all') return vi.fn().mockImplementation(() => Promise.resolve(mockAll()));
                    if (prop === 'get') return vi.fn().mockImplementation(() => Promise.resolve(mockGet()));
                    if (prop === 'then') return (resolve: any) => resolve(mockAll() || []);
                    return chain;
                },
                apply: () => chain
            });
            return chain;
        }),
        query: {
            ai_configs: {
                findFirst: vi.fn().mockImplementation(() => Promise.resolve(mockGet()))
            }
        },
        exec: vi.fn()
    };
    return {
        default: drizzleMock,
        db: drizzleMock,
        drizzleDb: drizzleMock,
        drizzleSchema: {
            ai_model_routes: {
                model_name: 'model_name',
                feature: 'feature',
                config_id: 'config_id'
            },
            ai_configs: {
                id: 'id',
                api_key: 'api_key',
                api_url: 'api_url',
                is_active: 'is_active',
                model_economy: 'model_economy',
                model_premium: 'model_premium',
                model_embedding: 'model_embedding',
                model_rerank: 'model_rerank',
                model_knowledge: 'model_knowledge',
                embedding_dimensions: 'embedding_dimensions'
            }
        }
    };
});

import { getAiConfig, clearAiConfigCache } from '../config';

describe('AI Config Management', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearAiConfigCache();
        mockEnv.AI_API_KEY = 'env-key';
        mockEnv.AI_API_URL = 'env-url';
    });

    it('应该能正确处理环境变量兜底', async () => {
        mockGet.mockReturnValue(undefined); // 没有数据库配置
        const config = await getAiConfig();
        expect(config.apiKey).toBe('env-key');
        expect(config.baseURL).toBe('env-url');
    });

    it('优先使用功能路由配置', async () => {
        // 第一次调用查数据库 (select().all())
        mockAll.mockReturnValue([{
            api_key: 'route-key',
            api_url: 'route-url',
            model_name: 'route-model'
        }]);

        const config = await getAiConfig('test-feature');
        expect(config.apiKey).toBe('route-key');
        expect(config.modelName).toBe('route-model');
    });

    it('缓存应该生效，减少数据库查询', async () => {
        mockGet.mockReturnValue({
            api_key: 'cached-key',
            api_url: 'url',
            model_name: 'model'
        });

        // 第一次调用
        await getAiConfig('feature-x');
        // 第二次调用
        await getAiConfig('feature-x');
    });

    it('override 参数应该绕过缓存', async () => {
        await getAiConfig('f', 'key1', 'url1');
        await getAiConfig('f', 'key2', 'url2');
    });
});
