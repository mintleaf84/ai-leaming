// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { practiceService } from '../practice';

const { mockDb, mockDrizzleDb, mockDrizzleSchema, mockMasteryService, mockSrsService, mockDemoService, mockPracticeSchedulingService } = vi.hoisted(() => {
    const makeChain = () => {
        const chain: any = {
            then: vi.fn((resolve) => resolve([])),
            get: vi.fn(() => ({})),
        };
        const methods = ['insert', 'values', 'update', 'set', 'delete', 'select', 'from', 'where', 'limit', 'offset', 'orderBy', 'all', 'innerJoin', 'leftJoin', 'onConflictDoUpdate'];
        methods.forEach((m) => {
            chain[m] = vi.fn(() => chain);
        });
        return chain;
    };

    const chain = makeChain();
    const mockDrizzleDb = {
        ...chain,
        query: {
            questions: { findMany: vi.fn(), findFirst: vi.fn() },
            practice_sessions: { findFirst: vi.fn() }
        },
        transaction: vi.fn(async (cb) => cb(chain)),
    };

    return {
        mockDb: {
            prepare: vi.fn(),
            transaction: vi.fn((fn) => fn),
        },
        mockDrizzleDb,
        mockDrizzleSchema: {
            questions: { id: 'questions.id', type: 'questions.type' },
            practice_logs: { id: 'practice_logs.id' },
            practice_sessions: { id: 'practice_sessions.id' },
            users: { id: 'users.id' },
            session_reviews: { id: 'session_reviews.id' },
            question_srs: { id: 'question_srs.id', user_id: 'question_srs.user_id', question_id: 'question_srs.question_id' }
        },
        mockMasteryService: {
            updateMastery: vi.fn()
        },
        mockSrsService: {
            updateQuestionSrs: vi.fn()
        },
        mockDemoService: {
            isDemoModeEnabled: vi.fn(),
            getDemoSession: vi.fn()
        },
        mockPracticeSchedulingService: {
            generateSessionByConfig: vi.fn(),
            getAllTags: vi.fn()
        }
    };
});

vi.mock('@/lib/db', () => ({ 
    default: mockDb, 
    db: mockDb, 
    drizzleDb: mockDrizzleDb, 
    drizzleSchema: mockDrizzleSchema 
}));

vi.mock('@/lib/db/drizzle-schema', () => mockDrizzleSchema);

vi.mock('@/lib/practice/practice-scheduling', () => ({
    practiceSchedulingService: mockPracticeSchedulingService,
    getAllTags: mockPracticeSchedulingService.getAllTags
}));

// Mock dynamic import for mastery
vi.mock('@/lib/services/mastery', () => ({
    masteryService: mockMasteryService
}));

vi.mock('@/lib/services/srs', () => ({
    srsService: mockSrsService
}));

vi.mock('@/lib/practice/demo', () => ({
    DemoService: mockDemoService
}));

vi.mock('@/lib/db/safe-query', () => ({
    safeGet: vi.fn((_, __, ___) => _?.get ? _.get() : _),
    safeAll: vi.fn((_, __, ___) => _?.all ? _.all() : _)
}));

describe('Practice Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        
        // Setup default chain behavior
        const chain = mockDrizzleDb as any;
        ['select', 'from', 'where', 'limit', 'offset', 'orderBy', 'insert', 'values', 'update', 'set'].forEach(m => {
            chain[m].mockReturnValue(chain);
        });
        chain.get.mockReturnValue({});
        chain.then.mockImplementation((resolve: any) => resolve([]));
        
        // Default mock implementations
        (mockDemoService.isDemoModeEnabled as any).mockResolvedValue(false);
        (mockSrsService.updateQuestionSrs as any).mockResolvedValue(undefined);
    });

    describe('getOrCreateSession', () => {
        it('should return demo session when demo mode is enabled', async () => {
            (mockDemoService.isDemoModeEnabled as any).mockResolvedValue(true);
            (mockDemoService.getDemoSession as any).mockResolvedValue({
                questions: [{ id: 1, content: 'Demo Q', type: 'single', dimension: 'knowledge' }],
                sessionId: 'demo-123'
            });

            const result = await practiceService.getOrCreateSession(1);

            expect(result.sessionId).toBe('demo-123');
        });

        it('should create new session when forceNew is true', async () => {
            const result = await practiceService.getOrCreateSession(1, true);
            expect(result).toBeDefined();
        });
    });

    describe('createRandomSession', () => {
        it('should create new session with random questions', async () => {
            const mockQuestions = [{ id: 1, content: 'Q1', type: 'single', dimension: 'knowledge' }] as any;
            (mockDrizzleDb.select as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.from as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.orderBy as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.limit as any).mockResolvedValue(mockQuestions);

            const result = await practiceService.createRandomSession(1, 5);

            expect(result.sessionId).toBeDefined();
            expect(result.questions).toHaveLength(1);
            expect(result.questions[0].id).toBe(1);
        });

        it('should return empty session when no questions available', async () => {
            (mockDrizzleDb.select as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.from as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.orderBy as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.limit as any).mockResolvedValue([]);

            const result = await practiceService.createRandomSession(1, 10);

            expect(result.sessionId).toBe('');
            expect(result.questions).toHaveLength(0);
        });
    });

    describe('attachSrsData', () => {
        it('should return empty array for empty question list', async () => {
            const result = await practiceService.attachSrsData(1, []);
            expect(result).toEqual([]);
        });
    });

    describe('submitAnswer', () => {
        it('should log answer and update stats with correct parameters', async () => {
            const mockQ = { tags: '["tag1"]', dimension: 'knowledge' };
            (mockDrizzleDb.select as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.from as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.where as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.limit as any).mockResolvedValue([mockQ]);

            await practiceService.submitAnswer(1, 's1', 101, 'A', true, 1000);

            expect(mockDrizzleDb.insert).toHaveBeenCalledWith(mockDrizzleSchema.practice_logs);
            expect(mockDrizzleDb.update).toHaveBeenCalledWith(mockDrizzleSchema.practice_sessions);
            expect(mockMasteryService.updateMastery).toHaveBeenCalledWith(1, 'tag1', 'knowledge', true);
        });

        it('should update SRS state on correct answer', async () => {
            const mockQ = { tags: '["tag1"]', dimension: 'knowledge' };
            (mockDrizzleDb.select as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.from as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.where as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.limit as any).mockResolvedValue([mockQ]);

            (mockSrsService.updateQuestionSrs as any).mockResolvedValue({
                stability: 2.0,
                difficulty: 1.5,
                due: new Date('2026-05-20'),
                state: 'review',
                scheduled_days: 3
            });

            const result = await practiceService.submitAnswer(1, 's1', 101, 'A', true, 1000);

            expect(result.success).toBe(true);
            expect(result.srs).toBeDefined();
            expect(result.srs?.stability).toBe(2.0);
        });

        it('should handle answer without session ID', async () => {
            const mockQ = { tags: '[]', dimension: 'knowledge' };
            (mockDrizzleDb.select as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.from as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.where as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.limit as any).mockResolvedValue([mockQ]);

            await practiceService.submitAnswer(1, null, 101, 'B', false, 2000);

            expect(mockDrizzleDb.insert).toHaveBeenCalled();
        });

        it('should handle question without tags', async () => {
            const mockQ = { tags: null, dimension: 'knowledge' };
            (mockDrizzleDb.select as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.from as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.where as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.limit as any).mockResolvedValue([mockQ]);

            await practiceService.submitAnswer(1, 's1', 101, 'A', true, 1000);

            expect(mockMasteryService.updateMastery).not.toHaveBeenCalled();
        });
    });

    describe('submitAnswerWithValidation', () => {
        it('should validate and submit correct answer', async () => {
            const mockQuestion = {
                answer: 'A',
                options: '["选项 A", "选项 B", "选项 C"]',
                type: 'single'
            };

            (mockDrizzleDb.select as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.from as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.where as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.limit as any).mockResolvedValue([mockQuestion]);

            const result = await practiceService.submitAnswerWithValidation(1, 's1', 101, 'A', 1000);

            expect(result.isCorrect).toBe(true);
            expect(result.correctAnswer).toBe('A');
        });

        it('should validate判断题 with A/B labels', async () => {
            const mockQuestion = {
                answer: '正确',
                options: '["正确", "错误"]',
                type: 'truefalse'
            };

            (mockDrizzleDb.select as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.from as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.where as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.limit as any).mockResolvedValue([mockQuestion]);

            const result = await practiceService.submitAnswerWithValidation(1, 's1', 101, 'A', 1000);

            expect(result.isCorrect).toBe(true);
        });

        it('should throw error when question not found', async () => {
            (mockDrizzleDb.select as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.from as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.where as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.limit as any).mockResolvedValue([]);

            await expect(
                practiceService.submitAnswerWithValidation(1, 's1', 999, 'A', 1000)
            ).rejects.toThrow('Question 999 not found');
        });
    });

    describe('getSessionById', () => {
        it('should return null when session not found', async () => {
            (mockDrizzleDb.select as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.from as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.where as any).mockReturnValue(mockDrizzleDb);
            (mockDrizzleDb.limit as any).mockResolvedValue([]);

            const result = await practiceService.getSessionById(1, 'nonexistent');

            expect(result).toBeNull();
        });
    });

    describe('saveSessionReview', () => {
        it('should save review data and update review count', async () => {
            const reviewData = { feedback: 'helpful', rating: 5 };

            await practiceService.saveSessionReview(1, 's1', 101, reviewData);

            expect(mockDrizzleDb.insert).toHaveBeenCalled();
            expect(mockDrizzleDb.update).toHaveBeenCalledWith(mockDrizzleSchema.practice_sessions);
        });
    });

    describe('createSessionFromConfig', () => {
        it('should create session with custom config', async () => {
            const mockConfig = {
                mode: 'random' as const,
                limit: 10,
                types: ['single'],
                dimensions: ['knowledge']
            };

            const mockQuestions = [
                { id: 1, content: 'Q1', type: 'single', dimension: 'knowledge' }
            ] as any;

            mockPracticeSchedulingService.generateSessionByConfig.mockResolvedValue(mockQuestions);

            const result = await practiceService.createSessionFromConfig(1, mockConfig);

            expect(result.sessionId).toBeDefined();
            expect(result.questions.length).toBeGreaterThan(0);
            expect(result.config).toEqual(mockConfig);
        });

        it('should handle mode mapping: wrong -> mistakes', async () => {
            const mockConfig = {
                mode: 'wrong' as any,
                limit: 10
            };

            const mockQuestions = [
                { id: 1, content: 'Q1', type: 'single', dimension: 'knowledge' }
            ] as any;

            mockPracticeSchedulingService.generateSessionByConfig.mockResolvedValue(mockQuestions);

            const result = await practiceService.createSessionFromConfig(1, mockConfig);

            expect(result.sessionId).toBeDefined();
        });

        it('should return empty session when no questions match config', async () => {
            const mockConfig = {
                mode: 'focus' as const,
                limit: 10,
                tags: ['nonexistent-tag']
            };

            mockPracticeSchedulingService.generateSessionByConfig.mockResolvedValue([]);

            const result = await practiceService.createSessionFromConfig(1, mockConfig);

            expect(result.sessionId).toBe('');
            expect(result.questions).toHaveLength(0);
        });
    });

    describe('createReviewSession', () => {
        it('should create review session with given question IDs', async () => {
            const questionIds = [1, 2, 3, 4, 5];

            const sessionId = await practiceService.createReviewSession(1, questionIds);

            expect(sessionId).toMatch(/^review-/);
            expect(mockDrizzleDb.insert).toHaveBeenCalledWith(mockDrizzleSchema.practice_sessions);
        });

        it('should create review session with empty question list', async () => {
            const sessionId = await practiceService.createReviewSession(1, []);

            expect(sessionId).toBeDefined();
            expect(sessionId).toMatch(/^review-/);
        });
    });

    describe('getAvailableTags', () => {
        it('should return list of available tags', async () => {
            const mockTags = ['tag1', 'tag2', 'tag3'];
            mockPracticeSchedulingService.getAllTags.mockResolvedValue(mockTags);

            const result = await practiceService.getAvailableTags();

            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(3);
        });
    });
});
