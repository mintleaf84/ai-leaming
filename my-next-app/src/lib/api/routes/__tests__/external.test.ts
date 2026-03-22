// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../external';

// Mock dependencies
const { mockDb } = vi.hoisted(() => {
    return {
        mockDb: {
            prepare: vi.fn(),
        }
    };
});

vi.mock('@/lib/db', () => ({ default: mockDb }));

describe('External Hono Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /questions', () => {
        it('should return questions list with valid API Key', async () => {
            // Mock auth check
            mockDb.prepare.mockReturnValueOnce({
                get: vi.fn().mockReturnValue({ id: 1, is_active: 1 })
            });
            // Mock count
            mockDb.prepare.mockReturnValueOnce({
                get: vi.fn().mockReturnValue({ count: 1 })
            });
            // Mock list
            mockDb.prepare.mockReturnValueOnce({
                all: vi.fn().mockReturnValue([{ id: 1, content: 'Q', options: '[]', tags: '[]', answer: 'A' }])
            });

            const res = await app.request('/questions', {
                headers: { 'Authorization': 'Bearer valid-key' }
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.data).toHaveLength(1);
            expect(data.pagination.total).toBe(1);
        });

        it('should return 401 without API Key', async () => {
            const res = await app.request('/questions');
            expect(res.status).toBe(401);
        });
    });
});
