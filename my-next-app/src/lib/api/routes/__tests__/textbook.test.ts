// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../textbook';

// Mock dependencies
const { mockTextbookService } = vi.hoisted(() => {
    return {
        mockTextbookService: {
            deleteTextbook: vi.fn(),
        }
    };
});

vi.mock('@/lib/services/textbook', () => ({ textbookService: mockTextbookService }));

// Mock Auth Middleware
vi.mock('@/lib/api/middlewares/auth', () => ({
    authMiddleware: async (c: any, next: any) => {
        await next();
    }
}));

describe('Textbook Hono Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('DELETE /:id', () => {
        it('should delete textbook and return 200', async () => {
            mockTextbookService.deleteTextbook.mockResolvedValue(true);

            const res = await app.request('/123', {
                method: 'DELETE'
            });

            expect(res.status).toBe(200);
            expect(mockTextbookService.deleteTextbook).toHaveBeenCalledWith(123);
        });

        it('should return 400 for invalid ID', async () => {
            const res = await app.request('/abc', {
                method: 'DELETE'
            });

            expect(res.status).toBe(400);
        });
    });
});
