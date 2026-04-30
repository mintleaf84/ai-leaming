// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock auth - MUST be before imports
const { mockRequireRole } = vi.hoisted(() => ({
    mockRequireRole: vi.fn()
}));

vi.mock('@/lib/auth/auth', () => ({
    requireRole: mockRequireRole,
    requireUser: mockRequireRole
}));

// Mock services
vi.mock('@/lib/services/ai-config', () => ({
    aiConfigService: {
        getConfigs: vi.fn(),
        saveConfig: vi.fn(),
        deleteConfig: vi.fn(),
        setActiveConfig: vi.fn(),
        getRoutes: vi.fn(),
        saveRoute: vi.fn()
    }
}));

vi.mock('@/lib/admin/audit', () => ({
    logAdminAction: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@/lib/ai/client', () => ({
    clearAiConfigCache: vi.fn(),
    getAiConfig: vi.fn().mockReturnValue({ apiKey: 'test', baseURL: 'https://test.com', modelName: 'test-model' }),
    getModel: vi.fn().mockReturnValue({})
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn()
}));

vi.mock('ai', () => ({
    generateText: vi.fn()
}));

vi.mock('@/lib/logger', () => ({
    default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}));

vi.mock('@/lib/utils/error', () => ({
    getErrorMessage: vi.fn((err) => err?.message || 'Unknown error')
}));

// Import AFTER mocks are set up
import {
    getAiConfigsAction,
    saveAiConfigAction,
    deleteAiConfigAction,
    setActiveAiConfigAction,
    getAiModelRoutesAction,
    saveAiModelRouteAction,
    testAiConnectionAction
} from '../config';
import { aiConfigService } from '@/lib/services/ai-config';
import { logAdminAction } from '@/lib/admin/audit';
import { generateText } from 'ai';

describe('Config Actions (AI Configuration)', () => {
    const adminUser = { id: 1, role: 'admin', username: 'admin' };

    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireRole.mockResolvedValue(adminUser);
    });

    // Helper to unwrap result if needed
    const unwrap = (result: any) => {
        if (result && result.data !== undefined) return result.data;
        if (result && result.success !== undefined) return result;
        return result;
    };

    // ========== getAiConfigsAction 测试 ==========
    describe('getAiConfigsAction', () => {
        it('应该返回所有 AI 配置', async () => {
            vi.mocked(aiConfigService.getConfigs).mockResolvedValue([
                { id: 1, name: 'Config1', api_url: 'https://api1.com', api_key: 'key1', model_economy: 'gpt-4o-mini', model_premium: 'gpt-4o', is_active: true }
            ] as any);

            const result = await getAiConfigsAction();
            const data = unwrap(result);

            expect(data).toHaveLength(1);
            expect(data[0].name).toBe('Config1');
            expect(aiConfigService.getConfigs).toHaveBeenCalled();
        });

        it('应该返回空数组当没有配置', async () => {
            vi.mocked(aiConfigService.getConfigs).mockResolvedValue([]);

            const result = await getAiConfigsAction();
            const data = unwrap(result);

            expect(data).toHaveLength(0);
        });
    });

    // ========== saveAiConfigAction 测试 ==========
    describe('saveAiConfigAction', () => {
        it('应该保存新配置并返回成功', async () => {
            vi.mocked(aiConfigService.saveConfig).mockResolvedValue(1);

            const result = await saveAiConfigAction({
                name: 'New Config',
                api_url: 'https://api.com',
                api_key: 'secret-key',
                model_economy: 'gpt-4o-mini',
                model_premium: 'gpt-4o'
            });
            const data = unwrap(result);

            expect(data.success).toBe(true);
            expect(aiConfigService.saveConfig).toHaveBeenCalled();
            expect(logAdminAction).toHaveBeenCalled();
        });

        it('应该更新现有配置', async () => {
            vi.mocked(aiConfigService.saveConfig).mockResolvedValue(1);

            const result = await saveAiConfigAction({
                id: 1,
                name: 'Updated Config'
            });
            const data = unwrap(result);

            expect(data.success).toBe(true);
        });
    });

    // ========== deleteAiConfigAction 测试 ==========
    describe('deleteAiConfigAction', () => {
        it('应该删除配置并返回成功', async () => {
            vi.mocked(aiConfigService.deleteConfig).mockResolvedValue(true);

            const result = await deleteAiConfigAction(2);
            const data = unwrap(result);

            expect(data.success).toBe(true);
            expect(aiConfigService.deleteConfig).toHaveBeenCalledWith(2);
            expect(logAdminAction).toHaveBeenCalled();
        });

        it('应该处理删除失败的情况', async () => {
            vi.mocked(aiConfigService.deleteConfig).mockRejectedValue(new Error('Cannot delete active config'));

            const result = await deleteAiConfigAction(1);
            const data = unwrap(result);

            // When delete throws, action returns error in result
            expect(data).toBeDefined();
        });
    });

    // ========== setActiveAiConfigAction 测试 ==========
    describe('setActiveAiConfigAction', () => {
        it('应该设置激活配置并返回成功', async () => {
            vi.mocked(aiConfigService.setActiveConfig).mockResolvedValue(true);

            const result = await setActiveAiConfigAction(2);
            const data = unwrap(result);

            expect(data.success).toBe(true);
            expect(aiConfigService.setActiveConfig).toHaveBeenCalledWith(2);
            expect(logAdminAction).toHaveBeenCalled();
        });
    });

    // ========== getAiModelRoutesAction 测试 ==========
    describe('getAiModelRoutesAction', () => {
        it('应该返回模型路由配置', async () => {
            vi.mocked(aiConfigService.getRoutes).mockResolvedValue([
                { feature: 'chat', config_id: 1, model_name: 'gpt-4o' }
            ] as any);

            const result = await getAiModelRoutesAction();
            const data = unwrap(result);

            expect(data).toHaveLength(1);
            expect(data[0].feature).toBe('chat');
        });
    });

    // ========== saveAiModelRouteAction 测试 ==========
    describe('saveAiModelRouteAction', () => {
        it('应该保存模型路由并返回成功', async () => {
            vi.mocked(aiConfigService.saveRoute).mockResolvedValue(true);

            const result = await saveAiModelRouteAction({
                feature: 'chat',
                config_id: 1,
                model_name: 'gpt-4o'
            });
            const data = unwrap(result);

            expect(data.success).toBe(true);
            expect(aiConfigService.saveRoute).toHaveBeenCalled();
            expect(logAdminAction).toHaveBeenCalled();
        });
    });

    // ========== testAiConnectionAction 测试 ==========
    describe('testAiConnectionAction', () => {
        it('应该成功测试 AI 连接', async () => {
            vi.mocked(generateText).mockResolvedValue({ text: 'Pong' } as any);

            const result = await testAiConnectionAction({
                apiKey: 'test-key',
                apiUrl: 'https://api.openai.com',
                modelName: 'gpt-4o'
            });
            const data = unwrap(result);

            expect(data.success).toBe(true);
            expect(data.message).toBe('Pong');
        });

        it('应该处理连接失败的情况', async () => {
            vi.mocked(generateText).mockRejectedValue(new Error('Connection timeout'));

            const result = await testAiConnectionAction({
                apiKey: 'invalid-key',
                apiUrl: 'https://invalid.api.com',
                modelName: 'gpt-4o'
            });
            const data = unwrap(result);

            expect(data.success).toBe(false);
            expect(data.error).toContain('Connection timeout');
        });

        it('应该处理长响应文本截断', async () => {
            const longResponse = 'A'.repeat(150);
            vi.mocked(generateText).mockResolvedValue({ text: longResponse } as any);

            const result = await testAiConnectionAction({
                apiKey: 'test-key',
                apiUrl: 'https://api.openai.com',
                modelName: 'gpt-4o'
            });
            const data = unwrap(result);

            expect(data.success).toBe(true);
            expect(data.message).toContain('...');
        });
    });
});