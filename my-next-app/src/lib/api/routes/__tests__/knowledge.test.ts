// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../knowledge';

// Mock dependencies
const { mockKnowledgeService } = vi.hoisted(() => {
    return {
        mockKnowledgeService: {
            createKnowledgeCard: vi.fn(),
            getAllKnowledgeCards: vi.fn(),
            getCategories: vi.fn(),
            getKnowledgeStats: vi.fn(),
            exportToAnkiTSV: vi.fn(),
        }
    };
});

vi.mock('@/lib/services/knowledge', () => mockKnowledgeService);

// Mock Auth Middleware
vi.mock('@/lib/api/middlewares/auth', () => ({
    authMiddleware: async (c: any, next: any) => {
        c.set('user', { id: 1, role: 'user' });
        await next();
    },
    getCurrentUser: () => ({ id: 1, role: 'user' })
}));

describe('Knowledge Hono Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /cards', () => {
        it('should return cards list with stats', async () => {
            const mockCards = [{ id: 1, title: 'Test Card' }];
            const mockStats = { total: 1, byCategory: [] };
            const mockCats = ['Category A'];

            mockKnowledgeService.getAllKnowledgeCards.mockReturnValue(mockCards);
            mockKnowledgeService.getKnowledgeStats.mockReturnValue(mockStats);
            mockKnowledgeService.getCategories.mockReturnValue(mockCats);

            const res = await app.request('/cards');
            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.cards).toHaveLength(1);
            expect(data.categories).toContain('Category A');
            expect(data.stats.total).toBe(1);
        });

        it('should return Anki TSV when format=anki', async () => {
            mockKnowledgeService.getAllKnowledgeCards.mockReturnValue([]);
            mockKnowledgeService.exportToAnkiTSV.mockReturnValue('id\tfront\tback');

            const res = await app.request('/cards?format=anki');
            expect(res.status).toBe(200);
            expect(res.headers.get('Content-Type')).toContain('text/tab-separated-values');
            
            const text = await res.text();
            expect(text).toBe('id\tfront\tback');
        });
    });

    describe('POST /extract', () => {
        beforeEach(() => {
            vi.mock('@/lib/ai/client', () => ({
                generateTextWrapper: vi.fn().mockResolvedValue({ text: '{"title":"Extracted","category":"Test","tags":[],"front":"F","back":"B","key_points":[]}' })
            }));
            vi.mock('@/lib/ai/prompts', () => ({
                getPromptFromDbSync: vi.fn().mockReturnValue('template'),
                buildPrompt: vi.fn().mockReturnValue('prompt'),
                DEFAULT_KNOWLEDGE_EXTRACT_PROMPT: 'default'
            }));
        });

        it('should extract and save card', async () => {
            mockKnowledgeService.createKnowledgeCard.mockResolvedValue(99);

            const res = await app.request('/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: 'some text', save: true })
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.id).toBe(99);
            expect(data.card.title).toBe('Extracted');
        });

        it('should handle AI JSON parsing failure', async () => {
            // Overwrite mock for this test
            const { generateTextWrapper } = await import('@/lib/ai/client');
            vi.mocked(generateTextWrapper).mockResolvedValueOnce({ text: 'invalid json' });

            const res = await app.request('/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: 'fail' })
            });

            expect(res.status).toBe(422);
        });
    });

    describe('POST /cards', () => {
        it('should create a card and return 200', async () => {
            mockKnowledgeService.createKnowledgeCard.mockResolvedValue(42);

            const payload = {
                title: 'New Card',
                front: 'Q',
                back: 'A'
            };

            const res = await app.request('/cards', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.id).toBe(42);
            expect(mockKnowledgeService.createKnowledgeCard).toHaveBeenCalledWith(expect.objectContaining({
                title: 'New Card'
            }));
        });

        it('should handle service errors', async () => {
            mockKnowledgeService.createKnowledgeCard.mockRejectedValue(new Error('DB Error'));

            const res = await app.request('/cards', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'Fail' })
            });

            expect(res.status).toBe(500);
            const data = await res.json();
            expect(data.error).toBe('DB Error');
        });
    });
});
