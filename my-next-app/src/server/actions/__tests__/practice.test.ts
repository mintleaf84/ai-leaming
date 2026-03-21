// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 1. Mock dependencies
const { mockDb, mockSafeGet, mockSafeAll } = vi.hoisted(() => {
    return {
        mockDb: {
            prepare: vi.fn(),
        },
        mockSafeGet: vi.fn(),
        mockSafeAll: vi.fn(),
    };
});

vi.mock('@/lib/db', () => ({
    default: mockDb
}));

vi.mock('@/lib/db/safe-query', () => ({
    safeGet: mockSafeGet,
    safeAll: mockSafeAll,
}));

vi.mock('@/lib/auth/auth', () => ({
    requireUser: vi.fn().mockResolvedValue({ id: 1 }),
}));

// Mock scheduling service
vi.mock('@/lib/services/scheduling', () => ({
    schedulingService: {
        getDailyScheduledQuestions: vi.fn().mockReturnValue([]),
    }
}));

describe('Practice Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // 默认 isDemoModeEnabled 返回 false
        mockDb.prepare.mockImplementation((sql: string) => {
            if (sql.includes('system_settings')) {
                return { get: () => undefined };
            }
            if (sql.includes('ALTER TABLE')) {
                return { run: vi.fn() };
            }
            return { get: vi.fn(), run: vi.fn(), all: vi.fn() };
        });
    });

    describe('getPracticeSessionAction', () => {
        it('should resume an existing session if available and not finished', async () => {
            // Mock safeGet: 第一次调用返回已有的会话，第二次返回日志计数
            const existingSession = {
                id: 'session-123',
                user_id: 1,
                total_questions: 10,
                questions_json: [{ id: 1, content: 'Q1' }], // safeGet 经过 Zod 解析后是对象
                created_at: '2024-01-01',
                correct_count: 0,
                review_count: 0,
            };

            mockSafeGet
                .mockReturnValueOnce(existingSession) // 查找上次会话
                .mockReturnValueOnce({ count: 5 });   // 日志计数 (5 < 10，继续)

            const { getPracticeSessionAction } = await import('../practice');
            const result = await getPracticeSessionAction(false);

            expect(result.sessionId).toBe('session-123');
            expect(result.resumed).toBe(true);
            expect(result.completedCount).toBe(5);
            expect(result.questions).toHaveLength(1);
        });

        it('should create a new session if no existing session found', async () => {
            // 完整的题目数据，符合 QuestionRowSchema
            const questions = [
                {
                    id: 1,
                    content: 'Q1 content length check',
                    options: ['Option A', 'Option B'],
                    tags: ['Tag1'],
                    answer: 'Option A',
                    explanation: 'Explanation length check',
                    dimension: 'knowledge'
                },
                {
                    id: 2,
                    content: 'Q2 content length check',
                    options: ['Option C', 'Option D'],
                    tags: ['Tag2'],
                    answer: 'Option C',
                    explanation: 'Explanation length check',
                    dimension: 'understanding'
                }
            ];

            // safeGet 返回 null（无上次会话）
            mockSafeGet.mockReturnValue(null);

            // safeAll 返回题目数据（已通过 Zod 解析）
            mockSafeAll.mockReturnValue(questions);

            const mockRun = vi.fn();
            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes('system_settings')) {
                    return { get: () => undefined };
                }
                if (sql.includes('ALTER TABLE')) {
                    return { run: vi.fn() };
                }
                if (sql.includes('INSERT INTO practice_sessions')) {
                    return { run: mockRun };
                }
                return { get: vi.fn(), run: vi.fn(), all: vi.fn() };
            });

            const { getPracticeSessionAction } = await import('../practice');
            const result = await getPracticeSessionAction(false);

            expect(result.resumed).toBeUndefined();
            // Math.random().toString(36).substring(2, 15) 生成的长度不固定
            expect(result.sessionId.length).toBeGreaterThanOrEqual(10);
            expect(result.sessionId.length).toBeLessThanOrEqual(13);
            expect(result.questions).toHaveLength(2);
            expect(result.questions[0].options).toEqual(['Option A', 'Option B']);

            // 验证 DB insert
            expect(mockRun).toHaveBeenCalledWith(
                expect.any(String), // sessionId
                1, // userId
                2, // total
                expect.any(String) // questions_json
            );
        });
    });
});
