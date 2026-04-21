// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getSessionReportAction, generateDeepAnalysisAction } from '../report';

// Mock dependencies
const { mockDb } = vi.hoisted(() => {
    return {
        mockDb: {
            prepare: vi.fn(),
        }
    };
});

vi.mock('@/lib/db', () => ({
    default: mockDb
}));

vi.mock('@/lib/auth/auth', () => ({
    requireUser: vi.fn().mockResolvedValue({ id: 1 }),
}));

vi.mock('@/lib/ai/client', () => ({
    generateTextWrapper: vi.fn().mockResolvedValue({ text: 'AI Analysis Report' })
}));

describe('Report Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // Helper to setup DB mocks
    const setupDbMocks = (overrides: any = {}) => {
        const mockGet = vi.fn();
        const mockAll = vi.fn();
        const mockRun = vi.fn();

        mockDb.prepare.mockImplementation((sql: string) => {
            if (sql.includes('count(*) as total') || sql.toLowerCase().includes('practice_logs')) {
                // Session Stats
                // Use default overrides if provided, or default values
                const stats = overrides.sessionStats || { total: 10, correct: 6, avg_duration: 5000 };
                return {
                    get: mockGet.mockReturnValue(stats)
                };
            }
            if (sql.includes('SELECT DISTINCT je.value as tag')) {
                // Error Tags
                return {
                    all: mockAll.mockReturnValue([{ tag: 'Tag1' }, { tag: 'Tag2' }])
                };
            }
            if (sql.includes('GROUP BY q.dimension')) {
                // Dimension Stats
                return {
                    all: mockAll.mockReturnValue([
                        { dimension: 'knowledge', total: 5, correct: 4 },
                        { dimension: 'understanding', total: 5, correct: 2 }
                    ])
                };
            }
            if (sql.includes('GROUP BY je.value')) {
                // Tag Stats for Deep Analysis
                return {
                    all: mockAll.mockReturnValue([
                        { tag: 'Tag1', total: 5, correct: 2 },
                        { tag: 'Tag2', total: 3, correct: 3 }, // 100% correct
                        { tag: 'Tag3', total: 2, correct: 1 }
                    ])
                };
            }
            if (sql.includes('UPDATE practice_sessions')) {
                return { run: mockRun };
            }
            return { get: mockGet, all: mockAll, run: mockRun };
        });

        return { mockGet, mockAll, mockRun };
    };

    describe('getSessionReportAction', () => {
        it.skip('should calculate basic stats and dimensions correctly', async () => {
            setupDbMocks();

            const result = await getSessionReportAction('session-1');

            expect(result).not.toBeNull();
            if (!result) return;

            expect(result.totalQuestions).toBe(10);
            expect(result.correctCount).toBe(6);
            expect(result.accuracy).toBe(60); // 6/10 * 100
            expect(result.avgDuration).toBe(5000);
            expect(result.errorTags).toEqual(['Tag1', 'Tag2']);

            // Verify Dimensions
            const knowledge = result.dimensionStats.find(d => d.axis === '识记');
            const understanding = result.dimensionStats.find(d => d.axis === '理解');
            const application = result.dimensionStats.find(d => d.axis === '应用');

            expect(knowledge?.value).toBe(80); // 4/5 * 100
            expect(understanding?.value).toBe(40); // 2/5 * 100
            expect(application?.value).toBe(0); // Default to 0 if missing
        });

        it('should return null if no stats found', async () => {
            // Override to return null/empty stats
            const mockGet = vi.fn().mockReturnValue(undefined);
            mockDb.prepare.mockReturnValue({ get: mockGet });

            const result = await getSessionReportAction('session-1');
            expect(result).toBeNull();
        });
    });

    describe('generateDeepAnalysisAction', () => {
        it('should identify repeated error patterns and generate report', async () => {
            setupDbMocks({
                sessionStats: { total: 10, correct: 6 }
            });

            // Mock getAnalysisReportAction (existing check) to return false/empty
            mockDb.prepare.mockImplementation((sql) => {
                if (sql.includes('SELECT analysis_report')) return { get: vi.fn().mockReturnValue(null) };
                // ... inherit other mocks via logic or copy-paste setup if needed, 
                // but easier to rely on the main setupDbMocks logic if we structure it to handle all calls.
                // Ideally, we should reuse the mock body. 
                // Let's rely on `setupDbMocks` above being robust, but here we need to ensure `getAnalysisReportAction` doesn't block.
                return {
                    get: vi.fn().mockImplementation(() => {
                        if (sql.includes('FROM practice_logs') && sql.includes('COUNT(*)')) return { total: 10, correct: 6, avg_duration: 5000 };
                        return null; // For analysis_report check
                    }),
                    all: vi.fn().mockImplementation(() => {
                        if (sql.includes('GROUP BY je.value')) {
                            // Tag1: 5 total, 2 correct -> 3 errors (Repeated)
                            // Tag2: 3 total, 3 correct -> 0 errors
                            // Tag3: 2 total, 1 correct -> 1 error
                            return [
                                { tag: 'Tag1', total: 5, correct: 2 },
                                { tag: 'Tag2', total: 3, correct: 3 },
                                { tag: 'Tag3', total: 2, correct: 1 }
                            ];
                        }
                        if (sql.includes('GROUP BY q.dimension')) {
                            return [];
                        }
                        return [];
                    }),
                    run: vi.fn()
                };
            });

            const result = await generateDeepAnalysisAction('session-1', true);

            expect(result.success).toBe(true);
            expect(result.report).toBe('AI Analysis Report');
        });
    });
});
