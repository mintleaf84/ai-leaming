// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { practiceService } from '../practice';

const { mockDb, mockDrizzleDb, mockDrizzleSchema, mockMasteryService } = vi.hoisted(() => {
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
            users: { id: 'users.id' }
        },
        mockMasteryService: {
            updateMastery: vi.fn()
        }
    };
});

vi.mock('@/lib/db', () => ({ 
    default: mockDb, 
    db: mockDb, 
    drizzleDb: mockDrizzleDb, 
    drizzleSchema: mockDrizzleSchema 
}));

// Mock dynamic import for mastery
vi.mock('@/lib/services/mastery', () => ({
    masteryService: mockMasteryService
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
    });

    describe('getOrCreateSession', () => {
        it('should resume valid session', async () => {
            (mockDrizzleDb.query.practice_sessions.findFirst as any).mockResolvedValue({ id: 's1' });
            const result = await practiceService.getOrCreateSession(1);
            expect(result).toBeDefined();
        });

        it('should return null if no recent session and create new', async () => {
            (mockDrizzleDb.query.practice_sessions.findFirst as any).mockResolvedValue(null);
            const result = await practiceService.getOrCreateSession(1, true);
            expect(result).toBeDefined();
        });
    });

    describe('createRandomSession', () => {
        it('should create new session with random questions', async () => {
            const mockQuestions = [{ id: 1, content: 'Q1' }] as any;
            (mockDrizzleDb.query.questions.findMany as any).mockResolvedValue(mockQuestions);

            const result = await practiceService.createRandomSession(1, 5);

            expect(result.sessionId).toBeDefined();
            expect(result.questions).toEqual(mockQuestions);
            expect(mockDrizzleDb.insert).toHaveBeenCalledWith(mockDrizzleSchema.practice_sessions);
        });
    });

    describe('submitAnswer', () => {
        it('should log answer and update stats with correct parameters', async () => {
            const mockQ = { tags: '["tag1"]', dimension: 'knowledge' };
            (mockDrizzleDb.get as any).mockReturnValue(mockQ);

            await practiceService.submitAnswer(1, 's1', 101, 'A', true, 1000);

            // 验证日志写入
            expect(mockDrizzleDb.insert).toHaveBeenCalledWith(mockDrizzleSchema.practice_logs);
            
            // 验证会话更新
            expect(mockDrizzleDb.update).toHaveBeenCalledWith(mockDrizzleSchema.practice_sessions);

            // 验证掌握度更新
            expect(mockMasteryService.updateMastery).toHaveBeenCalledWith(1, 'tag1', 'knowledge', true);
        });
    });
});
