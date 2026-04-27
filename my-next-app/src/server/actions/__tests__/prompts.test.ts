// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getPromptTemplatesAction, savePromptTemplateAction, resetPromptTemplateAction } from '../prompts';

// 1. 使用 hoisted 定义 Drizzle Mock 链
const { mockDrizzleDb } = vi.hoisted(() => {
    const makeChain = () => {
        const chain: any = {
            then: vi.fn((resolve) => resolve([])),
        };
        const methods = [
            'insert', 'values', 'update', 'set', 'delete', 'select', 'from', 
            'where', 'limit', 'onConflictDoUpdate', 'returning', 'orderBy'
        ];
        methods.forEach((m) => {
            chain[m] = vi.fn(() => chain);
        });
        return chain;
    };
    return { mockDrizzleDb: makeChain() };
});

// 2. 注册 Mock
vi.mock('@/lib/db', () => ({ 
    drizzleDb: mockDrizzleDb,
}));

vi.mock('@/lib/db/drizzle-schema', () => ({
    prompt_templates: { 
        key: 'prompt_templates.key', 
        template: 'prompt_templates.template',
        variables: 'prompt_templates.variables',
        description: 'prompt_templates.description',
        updated_at: 'prompt_templates.updated_at'
    },
}));

const { mockRequireRole, mockLogAdminAction } = vi.hoisted(() => {
    return {
        mockRequireRole: vi.fn().mockResolvedValue({ id: 1, username: 'admin' }),
        mockLogAdminAction: vi.fn()
    };
});

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

describe('Prompts Actions (Drizzle 重构版)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const chain = mockDrizzleDb as any;
        [
            'insert', 'values', 'update', 'set', 'delete', 'select', 'from', 
            'where', 'limit', 'onConflictDoUpdate', 'returning', 'orderBy'
        ].forEach(m => chain[m].mockReturnValue(chain));
        chain.then.mockImplementation((resolve: any) => resolve([]));
    });

    describe('getPromptTemplatesAction', () => {
        it('应该合并数据库模板与系统默认模板', async () => {
            const chain = mockDrizzleDb as any;
            chain.then.mockImplementationOnce((resolve: any) => resolve([
                { key: 'correction_quiz', template: 'custom', variables: '[]', description: 'D', updated_at: '2024-01-01' }
            ]));

            const result = await getPromptTemplatesAction();

            expect(result.length).toBeGreaterThanOrEqual(4);
            const correctionQuiz = result.find(r => r.key === 'correction_quiz');
            expect(correctionQuiz?.template).toBe('custom');
            expect(correctionQuiz?.systemDefault).toBe('default_correction');
        });
    });

    describe('savePromptTemplateAction', () => {
        it('应该执行 upsert 操作并记录日志', async () => {
            const result = await savePromptTemplateAction('test_key', 'template', 'desc', ['var1']);

            expect(result.success).toBe(true);
            expect(mockDrizzleDb.insert).toHaveBeenCalled();
            expect(mockLogAdminAction).toHaveBeenCalledWith(1, 'admin', 'UPDATE_PROMPT', 'prompt', 'test_key', expect.any(Object));
        });
    });

    describe('resetPromptTemplateAction', () => {
        it('应该从数据库删除模板记录', async () => {
            const result = await resetPromptTemplateAction('test_key');

            expect(result.success).toBe(true);
            expect(mockDrizzleDb.delete).toHaveBeenCalled();
        });
    });
});
