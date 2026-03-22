// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../wrong-book';

// Mock dependencies
const { mockDb } = vi.hoisted(() => {
    return {
        mockDb: {
            prepare: vi.fn(),
        }
    };
});

vi.mock('@/lib/db', () => ({ default: mockDb }));

// Mock Auth Middleware
vi.mock('@/lib/api/middlewares/auth', () => ({
    authMiddleware: async (c: any, next: any) => {
        c.set('user', { id: 1, role: 'user' });
        await next();
    },
    getCurrentUser: () => ({ id: 1, role: 'user' })
}));

describe('WrongBook Hono Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /', () => {
        it('should return wrong questions', async () => {
            const mockRows = [{
                questionId: 1,
                questionContent: 'Q',
                tags: '["tag1"]',
                wrongCount: 1,
                lastWrongAt: '2023-01-01',
                correctAnswer: 'A',
                userLastAnswer: 'B'
            }];
            mockDb.prepare.mockReturnValue({
                all: vi.fn().mockReturnValue(mockRows)
            });

            const res = await app.request('/');
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toHaveLength(1);
            expect(data[0].questionId).toBe('1');
        });
    });

    describe('GET /stats', () => {
        it('should return stats', async () => {
            mockDb.prepare.mockReturnValue({
                get: vi.fn().mockReturnValue({ count: 5 })
            });

            const res = await app.request('/stats');
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.total).toBe(5);
        });
    });
});
