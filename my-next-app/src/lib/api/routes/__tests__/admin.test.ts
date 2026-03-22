// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminRoute as app } from '../admin';

// Mock dependencies
const { mockDb, mockRequireRole } = vi.hoisted(() => {
    return {
        mockDb: {
            prepare: vi.fn().mockReturnValue({
                all: vi.fn().mockReturnValue([]),
                run: vi.fn(),
                get: vi.fn()
            }),
        },
        mockRequireRole: vi.fn().mockResolvedValue({ id: 1, role: 'admin' })
    };
});

vi.mock('@/lib/db', () => ({ default: mockDb }));
vi.mock('@/lib/auth/auth', () => ({ requireRole: mockRequireRole }));
vi.mock('@/lib/api-stats-service', () => ({ getApiCallStats: vi.fn().mockReturnValue({}) }));

describe('Admin Hono Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /export/questions', () => {
        it('should return CSV on success', async () => {
            const res = await app.request('/export/questions');
            expect(res.status).toBe(200);
            expect(res.headers.get('Content-Type')).toContain('text/csv');
            expect(mockRequireRole).toHaveBeenCalledWith(['admin']);
        });

        it('should return 401 if unauthorized', async () => {
            mockRequireRole.mockRejectedValue(new Error('Unauthorized'));
            const res = await app.request('/export/questions');
            expect(res.status).toBe(401);
        });
    });
});
