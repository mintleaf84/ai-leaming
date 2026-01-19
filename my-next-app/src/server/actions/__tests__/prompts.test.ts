// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getPromptTemplatesAction, savePromptTemplateAction, resetPromptTemplateAction } from '../prompts';

// Mock dependencies
const { mockDb, mockRequireRole, mockLogAdminAction } = vi.hoisted(() => {
    return {
        mockDb: { prepare: vi.fn() },
        mockRequireRole: vi.fn().mockResolvedValue({ id: 1, username: 'admin' }),
        mockLogAdminAction: vi.fn()
    };
});

vi.mock('@/lib/db', () => ({ default: mockDb }));
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

describe('Prompts Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getPromptTemplatesAction', () => {
        it('should merge DB templates with system defaults', async () => {
            mockDb.prepare.mockReturnValue({
                all: vi.fn().mockReturnValue([
                    { key: 'correction_quiz', template: 'custom', variables: '[]', description: 'D', updated_at: '2024-01-01' }
                ])
            });

            const result = await getPromptTemplatesAction();

            // Should have custom template + other defaults
            expect(result.length).toBeGreaterThanOrEqual(4);
            const correctionQuiz = result.find(r => r.key === 'correction_quiz');
            expect(correctionQuiz?.template).toBe('custom');
            expect(correctionQuiz?.systemDefault).toBe('default_correction');
        });
    });

    describe('savePromptTemplateAction', () => {
        it('should upsert template and log action', async () => {
            const mockRun = vi.fn();
            mockDb.prepare.mockReturnValue({ run: mockRun });

            const result = await savePromptTemplateAction('test_key', 'template', 'desc', ['var1']);

            expect(result.success).toBe(true);
            expect(mockRun).toHaveBeenCalled();
            expect(mockLogAdminAction).toHaveBeenCalledWith(1, 'admin', 'UPDATE_PROMPT', 'prompt', 'test_key', expect.any(Object));
        });
    });

    describe('resetPromptTemplateAction', () => {
        it('should delete template from DB', async () => {
            const mockRun = vi.fn();
            mockDb.prepare.mockReturnValue({ run: mockRun });

            const result = await resetPromptTemplateAction('test_key');

            expect(result.success).toBe(true);
            expect(mockRun).toHaveBeenCalledWith('test_key');
        });
    });
});
