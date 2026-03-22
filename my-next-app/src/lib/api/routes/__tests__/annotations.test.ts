// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../annotations';

// Mock dependencies
const { mockDb } = vi.hoisted(() => {
    return {
        mockDb: {
            prepare: vi.fn().mockReturnValue({
                all: vi.fn(),
                run: vi.fn(),
            })
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

describe('Annotations Hono Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /', () => {
        it('should return list of annotations', async () => {
            const mockRows = [{ id: 1, startOffset: 10, endOffset: 20 }];
            const mockPrepare = mockDb.prepare as any;
            mockPrepare.mockReturnValue({
                all: vi.fn().mockReturnValue(mockRows)
            });

            const res = await app.request('/?questionId=1');
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.annotations).toHaveLength(1);
        });
    });

    describe('POST /', () => {
        it('should create an annotation', async () => {
            const mockPrepare = mockDb.prepare as any;
            mockPrepare.mockReturnValue({
                run: vi.fn().mockReturnValue({ lastInsertRowid: 42 })
            });

            const res = await app.request('/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    questionId: 1,
                    startOffset: 10,
                    endOffset: 20,
                    tag: 'highlight'
                })
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.id).toBe(42);
        });
    });
});
