// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { practiceService } from '../practice';

const { mockDb, mockMasteryService } = vi.hoisted(() => {
    return {
        mockDb: {
            prepare: vi.fn(),
            transaction: vi.fn((fn) => fn), // Mock transaction as immediate execution
        },
        mockMasteryService: {
            updateMastery: vi.fn()
        }
    };
});

vi.mock('@/lib/db', () => ({
    default: mockDb
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
    });

    describe('resumeSession', () => {
        it('should resume valid session', async () => {
            const mockSession = {
                id: 's1',
                questions_json: JSON.stringify([{ id: 1 }]),
                total_questions: 10
            };
            const mockLogCount = { count: 5 };

            mockDb.prepare
                .mockReturnValueOnce({ get: () => mockSession }) // Last session
                .mockReturnValueOnce({ get: () => mockLogCount }); // Log count

            const result = await practiceService.resumeSession(1);

            expect(result).not.toBeNull();
            expect(result?.sessionId).toBe('s1');
            expect(result?.completedCount).toBe(5);
            expect(result?.resumed).toBe(true);
        });

        it('should return null if no recent session', async () => {
            mockDb.prepare.mockReturnValueOnce({ get: () => null });

            const result = await practiceService.resumeSession(1);

            expect(result).toBeNull();
        });
    });

    describe('createRandomSession', () => {
        it('should create new session with random questions', async () => {
            const mockQuestions = [{ id: 1, content: 'Q1' }];
            const mockRun = vi.fn();

            mockDb.prepare
                .mockReturnValueOnce({ all: () => mockQuestions }) // Select questions
                .mockReturnValueOnce({ run: mockRun }); // Insert session

            const result = await practiceService.createRandomSession(1, 5);

            expect(result.sessionId).toBeDefined();
            expect(result.questions).toEqual(mockQuestions);
            expect(mockRun).toHaveBeenCalledWith(
                expect.any(String), // session id
                1, // user id
                1, // question count
                expect.any(String), // json
                'random'
            );
        });
    });

        it('should log answer and update stats with correct parameters', async () => {
            const mockRunLog = vi.fn();
            const mockRunSession = vi.fn();
            const mockQ = { tags: '["tag1"]', dimension: 'knowledge' };

            mockDb.prepare
                .mockReturnValueOnce({ run: mockRunLog })        // Log
                .mockReturnValueOnce({ run: mockRunSession })    // Session Update
                .mockReturnValueOnce({ get: () => mockQ });      // Get Question Meta

            await practiceService.submitAnswer(1, 's1', 101, 'A', true, 1000);

            // 验证日志写入
            expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO practice_logs'));
            expect(mockRunLog).toHaveBeenCalledWith('s1', 1, 101, 'A', 1, 1000);

            // 验证会话更新
            expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE practice_sessions'));
            expect(mockRunSession).toHaveBeenCalledWith(1, 's1', 1);

            // 验证掌握度更新
            expect(mockMasteryService.updateMastery).toHaveBeenCalledWith(1, 'tag1', 'knowledge', true);
        });
});
