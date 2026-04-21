// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 1. Mock dependencies - 使用 vi.hoisted 内联创建，避免 require() 路径问题
const { mockBetterDb } = vi.hoisted(() => {
    const calls: { sql: string; args: unknown[] }[] = [];
    let wasCommitted = false;
    let wasRolledBack = false;

    const mockRun = vi.fn().mockImplementation((..._args: unknown[]) => ({ lastInsertRowid: 100, changes: 1 }));
    const mockGet = vi.fn();
    const mockAll = vi.fn();

    const prepare = vi.fn().mockImplementation((sql: string) => ({
        run: vi.fn().mockImplementation((...args: unknown[]) => {
            calls.push({ sql, args });
            return mockRun(...args);
        }),
        get: vi.fn().mockImplementation((...args: unknown[]) => {
            calls.push({ sql, args });
            return mockGet(...args);
        }),
        all: vi.fn().mockImplementation((...args: unknown[]) => {
            calls.push({ sql, args });
            return mockAll(...args);
        }),
    }));

    // better-sqlite3 的 transaction() 返回一个函数，调用该函数时才执行事务
    const transaction = vi.fn().mockImplementation((cb: (...args: unknown[]) => unknown) => {
        return vi.fn().mockImplementation((...args: unknown[]) => {
            try {
                const result = cb(...args);
                wasCommitted = true;
                return result;
            } catch (error) {
                wasRolledBack = true;
                throw error;
            }
        });
    });

    return {
        mockBetterDb: {
            prepare,
            transaction,
            exec: vi.fn(),
            _mockRun: mockRun,
            _mockGet: mockGet,
            _mockAll: mockAll,
            _state: { get calls() { return calls; }, get wasCommitted() { return wasCommitted; }, get wasRolledBack() { return wasRolledBack; } },
            reset: () => {
                calls.length = 0;
                wasCommitted = false;
                wasRolledBack = false;
                mockRun.mockReset();
                mockRun.mockImplementation(() => ({ lastInsertRowid: 100, changes: 1 }));
                mockGet.mockReset();
                mockAll.mockReset();
                prepare.mockClear();
                transaction.mockClear();
            },
        }
    };
});

const { mockSafeGet, mockSafeAll } = vi.hoisted(() => {
    return {
        mockSafeGet: vi.fn(),
        mockSafeAll: vi.fn(),
    };
});

vi.mock('@/lib/db', () => ({
    default: mockBetterDb
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
        mockBetterDb.reset();
        vi.clearAllMocks();
    });

    describe('getPracticeSessionAction', () => {
        it('should resume an existing session if available and not finished', async () => {
            const existingSession = {
                id: 'session-123',
                user_id: 1,
                total_questions: 10,
                questions_json: [{ id: 1, content: 'Q1' }],
                created_at: '2024-01-01',
                correct_count: 0,
                review_count: 0,
            };

            mockSafeGet
                .mockReturnValueOnce(existingSession)
                .mockReturnValueOnce({ count: 5 });

            const { getPracticeSessionAction } = await import('../practice');
            const result = await getPracticeSessionAction(false);

            expect(result.sessionId).toBe('session-123');
            expect(result.resumed).toBe(true);
            expect(result.completedCount).toBe(5);
        });

        it('should create a new session if no existing session found and verify JSON content', async () => {
            const questions = [
                { id: 1, content: 'Q1', options: ['A'], tags: ['T1'], answer: 'A', explanation: 'E1', dimension: 'knowledge' }
            ];

            mockSafeGet.mockReturnValue(null);
            mockSafeAll.mockReturnValue(questions);

            const { getPracticeSessionAction } = await import('../practice');
            const result = await getPracticeSessionAction(false);

            expect(result.resumed).toBeUndefined();
            // 验证 Session ID 格式：基于 Math.random().toString(36).substring(2,15) 生成
            // 长度可能为 7-13 个字符（取决于随机值的 base-36 表示长度）
            expect(result.sessionId).toMatch(/^[a-z0-9]{7,13}$/);
            
            // 验证 DB insert 是否包含正确的题目 JSON
            const calls = mockBetterDb._state.calls;
            const insertCall = calls.find((c: any) => c.sql.includes('INSERT INTO practice_sessions'));
            expect(insertCall).toBeDefined();
            
            const questionsJson = insertCall?.args[3]; // sessionId, userId, total, questions_json
            const parsed = JSON.parse(questionsJson as string);
            expect(parsed).toHaveLength(1);
            expect(parsed[0].id).toBe(1);
        });
    });
});
