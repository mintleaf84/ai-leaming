// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { schedulingService } from '../scheduling';

// Mock DB
const { mockDb } = vi.hoisted(() => {
    return {
        mockDb: {
            prepare: vi.fn(),
        }
    };
});

vi.mock('@/lib/db', () => ({ default: mockDb }));

describe('Scheduling Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default mock implementation to avoid errors with .map() in generateSession
        mockDb.prepare.mockReturnValue({
            all: vi.fn().mockReturnValue([])
        });
    });

    describe('generateSession', () => {
        it('should distribute questions based on 40/40/20 rule', () => {
            const limit = 10;
            // stubbornCount = 4, blindCount = 4, regularCount = 2
            
            const mockPrepare = mockDb.prepare as any;
            
            // 1st call for stubborn
            mockPrepare.mockReturnValueOnce({
                all: vi.fn().mockReturnValue([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }])
            });
            // 2nd call for blind
            mockPrepare.mockReturnValueOnce({
                all: vi.fn().mockReturnValue([{ id: 5 }, { id: 6 }, { id: 7 }, { id: 8 }])
            });
            // 3rd call for regular
            mockPrepare.mockReturnValueOnce({
                all: vi.fn().mockReturnValue([{ id: 9 }, { id: 10 }])
            });

            const session = schedulingService.generateSession(limit);

            expect(session).toHaveLength(10);
            expect(mockPrepare).toHaveBeenCalledTimes(3);
            
            // Verify categories (indirectly via mock return order)
            expect(session.some(q => q.id === 1)).toBe(true);
            expect(session.some(q => q.id === 10)).toBe(true);
        });

        it('should handle zero or low limits gracefully', () => {
            const mockPrepare = mockDb.prepare as any;
            // stubborn (0), blind (0), regular (1)
            mockPrepare.mockReturnValueOnce({ all: vi.fn().mockReturnValue([]) });
            mockPrepare.mockReturnValueOnce({ all: vi.fn().mockReturnValue([]) });
            mockPrepare.mockReturnValueOnce({ all: vi.fn().mockReturnValue([{ id: 100 }]) });

            const session = schedulingService.generateSession(1);
            expect(session).toHaveLength(1);
            expect(session[0].id).toBe(100);
        });
    });
});
