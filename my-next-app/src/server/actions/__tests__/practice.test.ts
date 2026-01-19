// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 1. Mock dependencies
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

// Mock scheduling service
vi.mock('@/lib/services/scheduling', () => ({
    schedulingService: {
        getDailyScheduledQuestions: vi.fn().mockReturnValue([]),
    }
}));

describe('Practice Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getPracticeSessionAction', () => {
        it('should resume an existing session if available and not finished', async () => {
            // Mock DB responses
            const existingSession = {
                id: 'session-123',
                user_id: 1,
                total_questions: 10,
                // Valid JSON but content doesn't need to match full QuestionSchema for PracticeSessionRowSchema
                questions_json: JSON.stringify([{ id: 1, content: 'Q1' }]),
                created_at: '2024-01-01',
                correct_count: 0,
                review_count: 0
            };

            // Chain of mock calls:
            // 1. SELECT * FROM practice_sessions ...
            // 2. SELECT count(*) FROM practice_logs ...
            const mockGet = vi.fn()
                .mockReturnValueOnce(existingSession) // Find last session
                .mockReturnValueOnce({ count: 5 }); // Log count (5 < 10, so resume)

            const mockRun = vi.fn();

            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes('ALTER TABLE')) {
                    return { run: mockRun, get: mockGet };
                }
                return { get: mockGet, run: mockRun, all: vi.fn() };
            });

            const { getPracticeSessionAction } = await import('../practice');
            const result = await getPracticeSessionAction(false);

            expect(result.sessionId).toBe('session-123');
            expect(result.resumed).toBe(true);
            expect(result.completedCount).toBe(5);
            expect(result.questions).toHaveLength(1);
        });

        it('should create a new session if no existing session found', async () => {
            // Mock DB responses

            // Full valid questions for QuestionRowSchema validation
            const questions = [
                {
                    id: 1,
                    content: 'Q1 content length check',
                    options: '["Option A","Option B"]',
                    tags: '["Tag1"]',
                    answer: 'Option A',
                    explanation: 'Explanation length check',
                    dimension: 'knowledge'
                },
                {
                    id: 2,
                    content: 'Q2 content length check',
                    options: '["Option C","Option D"]',
                    tags: '["Tag2"]',
                    answer: 'Option C',
                    explanation: 'Explanation length check',
                    dimension: 'understanding'
                }
            ];

            const mockGet = vi.fn()
                // .mockReturnValueOnce(undefined) // ALTER TABLE (optional to mock strict return, usually .run())
                .mockReturnValue(null); // No last session

            const mockAll = vi.fn().mockReturnValue(questions);
            const mockRun = vi.fn();

            mockDb.prepare.mockImplementation((sql: string) => {
                if (sql.includes('SELECT * FROM questions')) {
                    return { all: mockAll };
                }
                if (sql.includes('INSERT INTO practice_sessions')) {
                    return { run: mockRun };
                }
                return { get: mockGet, run: mockRun, all: mockAll };
            });

            const { getPracticeSessionAction } = await import('../practice');
            const result = await getPracticeSessionAction(false);

            expect(result.resumed).toBeUndefined();
            expect(result.sessionId).toHaveLength(11); // Math.random logic length
            expect(result.questions).toHaveLength(2);
            expect(result.questions[0].options).toEqual(["Option A", "Option B"]); // Verify JSON parse

            // Verify DB insert
            expect(mockRun).toHaveBeenCalledWith(
                expect.any(String), // sessionId
                1, // userId
                2, // total
                expect.any(String) // questions_json
            );
        });
    });
});
