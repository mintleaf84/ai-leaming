// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../history';

// Mock dependencies
const { mockHistoryService } = vi.hoisted(() => {
    return {
        mockHistoryService: {
            getHistory: vi.fn(),
            getSessionDetail: vi.fn(),
        }
    };
});

vi.mock('@/lib/services/history', () => ({ historyService: mockHistoryService }));

// Mock Auth Middleware
vi.mock('@/lib/api/middlewares/auth', () => ({
    authMiddleware: async (c: any, next: any) => {
        c.set('user', { id: 1 });
        await next();
    },
    getCurrentUser: () => ({ id: 1 })
}));

describe('History Hono Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /', () => {
        it('should return user history', async () => {
            mockHistoryService.getHistory.mockResolvedValue({
                items: [{ 
                    id: '1', 
                    totalQuestions: 10, 
                    correctCount: 8, 
                    reviewCount: 0, 
                    createdAt: '2023-01-01', 
                    accuracy: 0.8 
                }],
                total: 1,
                page: 1,
                pageSize: 10,
                totalPages: 1
            });
            const res = await app.request('/');
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.items).toHaveLength(1);
        });
    });
});
