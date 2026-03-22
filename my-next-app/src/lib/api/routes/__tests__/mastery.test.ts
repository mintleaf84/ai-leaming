// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../mastery';

// Mock dependencies
const { mockMasteryService } = vi.hoisted(() => {
    return {
        mockMasteryService: {
            getMasteryTree: vi.fn().mockReturnValue([]),
            getHierarchyMastery: vi.fn().mockReturnValue({ avgScore: 0, count: 0 }),
        }
    };
});

vi.mock('@/lib/services/mastery', () => ({ masteryService: mockMasteryService }));

// Mock Auth Middleware
vi.mock('@/lib/api/middlewares/auth', () => ({
    authMiddleware: async (c: any, next: any) => {
        c.set('user', { id: 1 });
        await next();
    },
    getCurrentUser: () => ({ id: 1 })
}));

describe('Mastery Hono Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /tree', () => {
        it('should return mastery tree', async () => {
            const res = await app.request('/tree');
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toBeDefined();
        });
    });
});
