// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { parseCommand } from '../chat-rag';

// Mock dependencies at module level
vi.mock('@/lib/ai/rag', () => ({
    ragService: {
        search: vi.fn().mockResolvedValue([]),
        rerank: vi.fn().mockImplementation(async (_q: string, docs: unknown[]) => docs)
    },
    searchSimilarContent: vi.fn().mockResolvedValue([])
}));

vi.mock('@/lib/ai/client', () => ({
    generateTextWrapper: vi.fn().mockResolvedValue({ text: 'AI Response' })
}));

vi.mock('@/lib/ai/prompts', () => ({
    getPromptFromDb: vi.fn().mockImplementation(async (key: string) => {
        if (key === 'chat_system') return 'Database System Prompt';
        if (key === 'chat_system_socratic') return 'Socratic Prompt';
        return null;
    }),
    SOCRATIC_TUTOR_PROMPT: 'Default Socratic'
}));

vi.mock('@/lib/ai/langchain-store', () => ({
    SqliteVecVectorStore: {
        fromExistingIndex: vi.fn().mockResolvedValue({
            similaritySearch: vi.fn().mockResolvedValue([
                { pageContent: 'Card Content', metadata: { title: 'C Title', tags: ['C1'] } }
            ])
        })
    },
    RagEmbeddings: vi.fn()
}));

describe('Chat RAG Service', () => {
    describe('parseCommand', () => {
        it('should parse /quiz command correctly', () => {
            const result = parseCommand('/quiz 教育心理学');
            expect(result).toEqual({ type: 'quiz', keyword: '教育心理学' });
        });

        it('should parse /explain command correctly', () => {
            const result = parseCommand('/explain 强化理论');
            expect(result).toEqual({ type: 'explain', keyword: '强化理论' });
        });

        it('should return none for regular text', () => {
            const result = parseCommand('hello');
            expect(result).toEqual({ type: 'none', keyword: '' });
        });

        it('should handle case insensitivity', () => {
            expect(parseCommand('/QUIZ 测试')).toEqual({ type: 'quiz', keyword: '测试' });
            expect(parseCommand('/EXPLAIN 概念')).toEqual({ type: 'explain', keyword: '概念' });
        });

        it('should trim whitespace from keyword', () => {
            expect(parseCommand('/quiz  心理学  ')).toEqual({ type: 'quiz', keyword: '心理学' });
        });

        it('should return none for empty quiz command', () => {
            const result = parseCommand('/quiz');
            expect(result).toEqual({ type: 'none', keyword: '' });
        });

        it('should return none for empty explain command', () => {
            const result = parseCommand('/explain');
            expect(result).toEqual({ type: 'none', keyword: '' });
        });

        it('should return none for unrecognized commands', () => {
            expect(parseCommand('/help')).toEqual({ type: 'none', keyword: '' });
            expect(parseCommand('/start')).toEqual({ type: 'none', keyword: '' });
            expect(parseCommand('/random')).toEqual({ type: 'none', keyword: '' });
        });

        it('should handle commands with special characters', () => {
            expect(parseCommand('/quiz 认知-心理学')).toEqual({ type: 'quiz', keyword: '认知-心理学' });
            expect(parseCommand('/explain 布鲁姆分类学(修订)')).toEqual({ type: 'explain', keyword: '布鲁姆分类学(修订)' });
        });

        it('should prioritize quiz over explain for mixed patterns', () => {
            // The regex should match quiz first
            const result = parseCommand('/quiz /explain test');
            expect(result.type).toBe('quiz');
        });

        it('should return none for whitespace-only input', () => {
            const result = parseCommand('   ');
            expect(result).toEqual({ type: 'none', keyword: '' });
        });

        it('should handle Chinese characters correctly', () => {
            const result = parseCommand('/quiz 教育学基础知识');
            expect(result.type).toBe('quiz');
            expect(result.keyword).toBe('教育学基础知识');
        });
    });
});