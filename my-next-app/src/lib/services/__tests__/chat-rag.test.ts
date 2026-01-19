// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { searchKnowledgeBase } from '../chat-rag';

// Mock dependencies
const { mockRagService, mockSearchSimilarContent } = vi.hoisted(() => {
    return {
        mockRagService: {
            search: vi.fn(),
            rerank: vi.fn()
        },
        mockSearchSimilarContent: vi.fn()
    }
});

vi.mock('@/lib/ai/rag', () => ({
    ragService: mockRagService,
    searchSimilarContent: mockSearchSimilarContent
}));

vi.mock('@/lib/ai/prompts', () => ({
    getPromptFromDbSync: vi.fn().mockReturnValue('System Prompt')
}));

vi.mock('ai', () => ({
    tool: vi.fn()
}));

describe('Chat RAG Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should combine results from multiple sources and format them', async () => {
        // Setup Mocks
        mockSearchSimilarContent.mockResolvedValue([
            { content: 'Question Content', tags: ['Tag1'], explanation: 'Exp' }
        ]);

        mockRagService.search
            .mockResolvedValueOnce([{ content: 'Card Content', metadata: { title: 'Card Title' } }]) // card
            .mockResolvedValueOnce([{ content: 'Textbook Content', metadata: { title: 'Chapter 1' } }]); // textbook

        mockRagService.rerank.mockImplementation(async (query, docs) => docs); // Return input as is

        const result = await searchKnowledgeBase('test query', 3);

        expect(result).toContain('【相关知识卡片】');
        expect(result).toContain('Card Title');
        expect(result).toContain('Card Content');

        expect(result).toContain('【相关教材内容】');
        expect(result).toContain('Chapter 1');
        expect(result).toContain('Textbook Content');

        expect(result).toContain('【相关真题库】');
        expect(result).toContain('Question Content');
        expect(result).toContain('Exp');
    });

    it('should return null if all sources empty', async () => {
        mockSearchSimilarContent.mockResolvedValue([]);
        mockRagService.search.mockResolvedValue([]);

        const result = await searchKnowledgeBase('empty', 3);

        expect(result).toBeNull();
    });

    it('should respect limit after reranking', async () => {
        // Mock many results
        mockSearchSimilarContent.mockResolvedValue([]);
        mockRagService.search.mockResolvedValue([
            { content: '1', metadata: { source_type: 'card' } },
            { content: '2', metadata: { source_type: 'card' } },
            { content: '3', metadata: { source_type: 'card' } },
            { content: '4', metadata: { source_type: 'card' } },
        ]);

        mockRagService.rerank.mockImplementation(async (query, docs) => docs);

        const result = await searchKnowledgeBase('test', 2); // Limit 2

        // Should only contain 2 items
        expect((result || '').match(/\[知识卡片 \d+\]/g)).toHaveLength(2);
    });
});
