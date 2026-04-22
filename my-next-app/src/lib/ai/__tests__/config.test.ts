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
        exec: vi.fn()
    };
    return {
        default: mock,
        db: mock,
        drizzleDb: mock,
        drizzleSchema: {}
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

    it('应该能正确处理环境变量兜底', () => {
        mockGet.mockReturnValue(undefined); // 没有数据库配置
        const config = getAiConfig();
        expect(config.apiKey).toBe('env-key');
        expect(config.baseURL).toBe('env-url');
    });

    it('应该优先使用功能路由配置', () => {
        // 第一次调用查数据库
        mockGet.mockReturnValueOnce({
            api_key: 'route-key',
            api_url: 'route-url',
            model_name: 'route-model'
        });

        const config = getAiConfig('test-feature');
        expect(config.apiKey).toBe('route-key');
        expect(config.modelName).toBe('route-model');
        expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('ai_model_routes'));
    });

    it('缓存应该生效，减少数据库查询', () => {
        mockGet.mockReturnValue({
            api_key: 'cached-key',
            api_url: 'url',
            model_name: 'model'
        });

        // 第一次调用
        getAiConfig('feature-x');
        // 第二次调用
        getAiConfig('feature-x');

        // 虽然调用了两次，但数据库 prepare 应该只针对该 feature 调用了一次（实际上 fetchConfigFromDb 被缓存拦截了）
        expect(mockPrepare).toHaveBeenCalledTimes(1);
    });

    it('override 参数应该绕过缓存', () => {
        getAiConfig('f', 'key1', 'url1');
        getAiConfig('f', 'key2', 'url2');
        
        // 这种情况下不走 cache 逻辑中的 fetchConfigFromDb(feature) 路径，而是直接返回
        expect(mockPrepare).not.toHaveBeenCalled();
    });
});
