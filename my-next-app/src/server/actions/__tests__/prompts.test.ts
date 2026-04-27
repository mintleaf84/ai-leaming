// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { drizzleDb } from '@/lib/db';
import { resetDrizzleMock } from '@/lib/db/__mocks__';
import { getPromptTemplatesAction, savePromptTemplateAction, resetPromptTemplateAction } from '../prompts';

vi.mock('@/lib/db');
vi.mock('@/lib/db/drizzle-schema');

const { mockRequireRole, mockLogAdminAction } = vi.hoisted(() => ({
    mockRequireRole: vi.fn().mockResolvedValue({ id: 1, username: 'admin' }),
    mockLogAdminAction: vi.fn()
}));

vi.mock('@/lib/auth/auth', () => ({ requireRole: mockRequireRole }));
vi.mock('@/lib/admin/audit', () => ({ logAdminAction: mockLogAdminAction }));

vi.mock('@/lib/ai/prompts', () => ({
    buildPrompt: vi.fn(),
    DEFAULT_CORRECTION_PROMPT: 'default_correction',
    DEFAULT_REGRESSION_PROMPT: 'default_regression',
    DEFAULT_KNOWLEDGE_EXTRACT_PROMPT: 'default_knowledge',
    DEFAULT_CHAT_SYSTEM_PROMPT: 'default_chat',
    PROMPT_VARIABLE_EXAMPLES: {}
}));

vi.mock('@/lib/ai/client', () => ({
    generateStructuredData: vi.fn(),
    generateTextWrapper: vi.fn()
}));

describe('Prompts Actions (使用全局 Manual Mock)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetDrizzleMock();
    });

    describe('getPromptTemplatesAction', () => {
        it('应该合并数据库模板与系统默认模板', async () => {
            (drizzleDb as any).then.mockImplementationOnce((resolve: any) => resolve([
                { key: 'correction_quiz', template: 'custom', variables: '[]', description: 'D', updated_at: '2024-01-01' }
            ]));

            const result = await getPromptTemplatesAction();

            expect(result.length).toBeGreaterThanOrEqual(4);
            const correctionQuiz = result.find(r => r.key === 'correction_quiz');
            expect(correctionQuiz?.template).toBe('custom');
        });
    });

    describe('savePromptTemplateAction', () => {
        it('应该执行 upsert 操作并记录日志', async () => {
            const result = await savePromptTemplateAction('test_key', 'template', 'desc', ['var1']);
            expect(result.success).toBe(true);
            expect(drizzleDb.insert).toHaveBeenCalled();
        });
    });

    describe('resetPromptTemplateAction', () => {
        it('应该从数据库删除模板记录', async () => {
            const result = await resetPromptTemplateAction('test_key');
            expect(result.success).toBe(true);
            expect(drizzleDb.delete).toHaveBeenCalled();
        });
    });
});
