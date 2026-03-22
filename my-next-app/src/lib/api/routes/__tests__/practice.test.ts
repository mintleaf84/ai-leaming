// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../practice';

// Mock dependencies
const { mockPracticeService } = vi.hoisted(() => {
    return {
        mockPracticeService: {
            createRandomSession: vi.fn(),
            submitAnswerWithValidation: vi.fn(),
        }
    };
});

vi.mock('@/lib/services/practice', () => ({ practiceService: mockPracticeService }));

// Mock Auth Middleware
vi.mock('@/lib/api/middlewares/auth', () => ({
    authMiddleware: async (c: any, next: any) => {
        c.set('user', { id: 1 });
        await next();
    },
    getCurrentUser: () => ({ id: 1 })
}));

describe('Practice Hono Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('POST /session', () => {
        it('should create session', async () => {
            mockPracticeService.createRandomSession.mockResolvedValue({
                sessionId: '123',
                questions: [{ id: 1, content: 'Q', options: [], type: 'single' }]
            });
            const res = await app.request('/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'random', limit: 10 })
            });
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.sessionId).toBe('123');
            expect(data.questions).toHaveLength(1);
        });
    });
});
