// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../wrong-book';

// Mock dependencies
const { mockDb } = vi.hoisted(() => {
    return {
        mockDb: {
            prepare: vi.fn().mockReturnValue({
                all: vi.fn(),
                run: vi.fn(),
                get: vi.fn(),
            })
        }
    };
});

vi.mock('@/lib/db', () => ({ default: mockDb }));

// Mock Auth Middleware
vi.mock('@/lib/api/middlewares/auth', () => ({
    authMiddleware: async (c: unknown, next: unknown) => {
        c.set('user', { id: 1, role: 'user' });
        await next();
    },
    getCurrentUser: () => ({ id: 1, role: 'user' })
}));

describe('WrongBook Hono Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /random', () => {
        it('should return random wrong questions with weighted logic', async () => {
            const mockRows = [
                { 
                    questionId: 101, 
                    questionContent: 'Test Question', 
                    tags: '["tag1"]', 
                    wrongCount: 5, 
                    lastWrongAt: '2024-01-01',
                    correctAnswer: 'A',
                    userLastAnswer: 'B'
                }
            ];
            
            const mockPrepare = mockDb.prepare as unknown;
            mockPrepare.mockReturnValue({
                all: vi.fn().mockReturnValue(mockRows)
            });

            const res = await app.request('/random?count=5&mode=priority');
            expect(res.status).toBe(200);
            
            const data = await res.json();
            expect(data).toHaveLength(1);
            expect(data[0].questionId).toBe('101');
            expect(data[0].wrongCount).toBe(5);
        });

        it('should support tag filtering', async () => {
            const mockPrepare = mockDb.prepare as unknown;
            mockPrepare.mockReturnValue({
                all: vi.fn().mockReturnValue([])
            });

            const res = await app.request('/random?tag=math');
            expect(res.status).toBe(200);
            
            // 验证 SQL 中是否包含 tag 相关的 EXISTS 子句
            expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('EXISTS (SELECT 1 FROM json_each(q.tags)'));
        });
    });

    describe('GET /stats', () => {
        it('should return correct statistics structure', async () => {
            const mockPrepare = mockDb.prepare as unknown;
            mockPrepare.mockReturnValue({
                get: vi.fn().mockReturnValue({ count: 10 })
            });

            const res = await app.request('/stats');
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toEqual({
                total: 10,
                recent: 10,
                frequent: 10
            });
        });
    });
});
