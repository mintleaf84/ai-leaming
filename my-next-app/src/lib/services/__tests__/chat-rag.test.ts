// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { searchKnowledgeBase, parseCommand, handleQuizCommand, buildEnhancedSystemPrompt } from '../chat-rag';
import { getPromptFromDb } from '@/lib/ai/prompts';

// Mock dependencies
const { mockRagService, mockSearchSimilarContent, mockGenerateTextWrapper } = vi.hoisted(() => {
    return {
        mockRagService: {
            search: vi.fn(),
            rerank: vi.fn()
        },
        mockSearchSimilarContent: vi.fn(),
        mockGenerateTextWrapper: vi.fn()
    }
});

vi.mock('@/lib/ai/rag', () => ({
    ragService: mockRagService,
    searchSimilarContent: mockSearchSimilarContent
}));

vi.mock('@/lib/ai/client', () => ({
    generateTextWrapper: mockGenerateTextWrapper
}));

vi.mock('@/lib/ai/prompts', () => ({
    getPromptFromDb: vi.fn(),
    SOCRATIC_TUTOR_PROMPT: 'Default Socratic'
}));

describe('Chat RAG Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getPromptFromDb).mockImplementation(async (key) => {
            if (key === 'chat_system') return 'DB Prompt';
            return null;
        });
    });

    describe('parseCommand', () => {
        it('should correctly parse quiz and explain commands', () => {
            expect(parseCommand('/quiz 教育心理学')).toEqual({ type: 'quiz', keyword: '教育心理学' });
            expect(parseCommand('/explain 强化理论')).toEqual({ type: 'explain', keyword: '强化理论' });
            expect(parseCommand('hello')).toEqual({ type: 'none', keyword: '' });
        });
    });

    describe('searchKnowledgeBase', () => {
        it('should combine results and format context', async () => {
            mockSearchSimilarContent.mockResolvedValue([{ content: 'Q Content', explanation: 'Q Exp', tags: ['T1'] }]);
            mockRagService.search.mockResolvedValue([{ content: 'C Content', metadata: { title: 'C Title', tags: ['C1'] } }]);
            mockRagService.rerank.mockImplementation(async (q, docs) => docs);

            const result = await searchKnowledgeBase('test', 2);
            expect(result).toContain('【相关知识卡片】');
            expect(result).toContain('C Title');
            expect(result).toContain('【相关真题库】');
            expect(result).toContain('Q Content');
        });

        it('should return null if no results found', async () => {
            mockSearchSimilarContent.mockResolvedValue([]);
            mockRagService.search.mockResolvedValue([]);
            const result = await searchKnowledgeBase('empty');
            expect(result).toBeNull();
        });
    });

    describe('handleQuizCommand', () => {
        it('should return formatted question list', async () => {
            mockSearchSimilarContent.mockResolvedValue([
                { id: 1, content: 'Test Question', dimension: 'knowledge', tags: ['Tag'] }
            ]);

            const result = await handleQuizCommand('test');
            expect(result).toContain('为您找到 1 道');
            expect(result).toContain('Test Question');
            expect(result).toContain('知识点: Tag');
        });
    });

    describe('buildEnhancedSystemPrompt', () => {
        it('should prioritize DB prompt and append context', async () => {
            const prompt = await buildEnhancedSystemPrompt('Sample Context');
            expect(prompt).toContain('DB Prompt');
            expect(prompt).toContain('Sample Context');
        });

        it('should use default prompt if DB prompt missing', async () => {
            vi.mocked(getPromptFromDb).mockResolvedValue(null);
            const prompt = await buildEnhancedSystemPrompt();
            expect(prompt).toContain('资深的教师招聘考试辅导专家');
        });
    });
});
