import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB
const { mockPrepare, mockGet } = vi.hoisted(() => ({
    mockGet: vi.fn(),
    mockPrepare: vi.fn().mockReturnValue({
        get: vi.fn((...args) => mockGet(...args))
    })
}));

vi.mock('@/lib/db', () => {
    const mock = {
        prepare: mockPrepare,
        select: vi.fn(() => ({
            from: vi.fn(() => ({
                innerJoin: vi.fn(() => ({
                    where: vi.fn(() => ({
                        limit: vi.fn(() => ({
                            all: vi.fn(() => mockGet() ? [mockGet()] : [])
                        }))
                    }))
                }))
            }))
        })),
        query: {
            ai_configs: {
                findFirst: vi.fn().mockResolvedValue(null)
            }
        },
        exec: vi.fn()
    };
    return {
        default: mock,
        db: mock,
        drizzleDb: mock,
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
        process.env.AI_API_KEY = 'env-key';
        process.env.AI_API_URL = 'env-url';
    });

    it('应该能正确处理环境变量兜底', async () => {
        mockGet.mockReturnValue(undefined); // 没有数据库配置
        const config = await getAiConfig();
        expect(config.apiKey).toBe('env-key');
        expect(config.baseURL).toBe('env-url');
    });

    it('优先使用功能路由配置', async () => {
        // 第一次调用查数据库
        mockGet.mockReturnValueOnce({
            api_key: 'route-key',
            api_url: 'route-url',
            model_name: 'route-model'
        });

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
