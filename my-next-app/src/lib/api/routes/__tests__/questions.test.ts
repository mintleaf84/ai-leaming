// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../questions';

// Mock dependencies
const { mockQuestionService } = vi.hoisted(() => {
    return {
        mockQuestionService: {
            getById: vi.fn(),
            list: vi.fn(),
        }
    };
});

vi.mock('@/lib/services/question', () => ({ questionService: mockQuestionService }));

// Mock Auth Middleware
vi.mock('@/lib/api/middlewares/auth', () => ({
    authMiddleware: async (c: unknown, next: unknown) => {
        await next();
    }
}));

describe('Questions Hono Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /', () => {
        it('should return questions list', async () => {
            mockQuestionService.list.mockResolvedValue({
                items: [{ id: 1, content: 'Q', options: [], tags: [] }],
                total: 1
            });
            const res = await app.request('/');
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.items).toHaveLength(1);
            expect(data.total).toBe(1);
        });
    });

    describe('GET /:id', () => {
        it('should return a question', async () => {
            mockQuestionService.getById.mockResolvedValue({ 
                id: 1, 
                content: 'Q', 
                options: [], 
                tags: [],
                type: 'single'
            });
            const res = await app.request('/1');
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.id).toBe(1);
        });
    });
});
