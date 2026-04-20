// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../chat';

// Mock dependencies
const { mockChatService, mockQuota } = vi.hoisted(() => {
    return {
        mockChatService: {
            saveMessage: vi.fn(),
        },
        mockQuota: {
            checkQuotaForApi: vi.fn().mockReturnValue(null)
        }
    };
});

vi.mock('@/lib/services/chat', () => ({ saveMessage: mockChatService.saveMessage }));
vi.mock('@/lib/billing/usage-middleware', () => ({ checkQuotaForApi: mockQuota.checkQuotaForApi }));
vi.mock('@/lib/ai/client', () => ({
    streamChatWrapper: vi.fn().mockResolvedValue({
        toTextStreamResponse: () => new Response('ai response')
    })
}));

// Mock Auth Middleware
vi.mock('@/lib/api/middlewares/auth', () => ({
    authMiddleware: async (c: unknown, next: unknown) => {
        c.set('user', { id: 1, role: 'user' });
        await next();
    },
    getCurrentUser: () => ({ id: 1, role: 'user' })
}));

describe('Chat Hono Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('POST /', () => {
        it('should return streaming response on success', async () => {
            const res = await app.request('/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: 'hello' }],
                    enableRag: false
                })
            });

            expect(res.status).toBe(200);
            const text = await res.text();
            expect(text).toBe('ai response');
        });

        it('should return 429 when quota exceeded', async () => {
            mockQuota.checkQuotaForApi.mockReturnValue({ error: 'Quota exceeded' });

            const res = await app.request('/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: [] })
            });

            expect(res.status).toBe(429);
        });
    });
});
