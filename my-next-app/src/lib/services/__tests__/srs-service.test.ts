// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Rating, State } from 'ts-fsrs';

// ---- Drizzle Mock ----
const { mockDrizzleDb, mockDrizzleSchema } = vi.hoisted(() => {
    const makeChain = () => {
        const chain: Record<string, any> = {};
        const methods = ['insert', 'values', 'update', 'set', 'delete', 'select', 'from',
            'where', 'orderBy', 'limit', 'all', 'get', 'groupBy', 'onConflictDoUpdate'];
        methods.forEach((m) => { chain[m] = vi.fn(() => chain); });
        return chain;
    };

    const chain = makeChain();

    const mockQuery = {
        question_srs: {
            findFirst: vi.fn(),
        },
        questions: {
            findFirst: vi.fn(),
        },
    };

    const mockDrizzleDb = {
        ...chain,
        query: mockQuery,
        insert: vi.fn(() => chain),
        update: vi.fn(() => chain),
        delete: vi.fn(() => chain),
        select: vi.fn(() => chain),
    };

    const mockDrizzleSchema = {
        question_srs: {
            user_id: 'user_id',
            question_id: 'question_id',
            stability: 'stability',
            difficulty: 'difficulty',
            elapsed_days: 'elapsed_days',
            scheduled_days: 'scheduled_days',
            reps: 'reps',
            lapses: 'lapses',
            state: 'state',
            last_review: 'last_review',
            due_date: 'due_date',
        },
        questions: {
            id: 'id',
            content: 'content',
            options: 'options',
            correct_ratio: 'correct_ratio'
        }
    };

    return { mockDrizzleDb, mockDrizzleSchema };
});

vi.mock('@/lib/db', () => ({
    db: mockDrizzleDb,
    drizzleDb: mockDrizzleDb,
    drizzleSchema: mockDrizzleSchema,
}));

import { srsService } from '../srs';

const chain = mockDrizzleDb as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('SRS Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const chainMethods = ['values', 'set', 'from', 'where', 'orderBy', 'limit', 'groupBy', 'onConflictDoUpdate'];
        chainMethods.forEach((m) => { chain[m].mockReturnValue(mockDrizzleDb); });
    });

    describe('calculateRating', () => {
        it('秒杀题目应被评为 Easy', () => {
            const content = '1+1=?';
            const options = '["2","3"]';
            // 字数少，阅读时间近乎 0，500ms 答完属于秒杀
            const rating = srsService.calculateRating(content, options, 500, 7);
            expect(rating).toBe(Rating.Easy);
        });

        it('长题目正常答完应被评为 Good', () => {
            const content = '这是一段很长的题干内容'.repeat(10); // 100字
            const options = '[]';
            // 100字 / 7 = 14.2s 阅读时间
            // 总耗时 20s，纯思考时间 5.8s -> Good
            const rating = srsService.calculateRating(content, options, 20000, 7);
            expect(rating).toBe(Rating.Good);
        });

        it('短题目思考很久应被评为 Hard', () => {
            const content = '1+1=?';
            const options = '[]';
            // 总耗时 15s，纯思考时间 14s+ -> Hard
            const rating = srsService.calculateRating(content, options, 15000, 7);
            expect(rating).toBe(Rating.Hard);
        });
    });

    describe('updateQuestionSrs', () => {
        it('答错时应映射为 Again 评级', async () => {
            mockDrizzleDb.query.questions.findFirst.mockResolvedValueOnce({
                id: 1, content: 'Q', options: '[]'
            });
            mockDrizzleDb.query.question_srs.findFirst.mockResolvedValueOnce(undefined);
            
            await srsService.updateQuestionSrs(1, 1, false, 5000);
            
            // 验证插入的数据中，reps 应该增加
            const insertCall = mockDrizzleDb.insert.mock.calls[0];
            expect(insertCall).toBeDefined();
            
            const valuesCall = chain['values'].mock.calls[0][0];
            expect(valuesCall.reps).toBe(1);
            // 在 ts-fsrs 中，New 状态下评分 Again，card.state 变为 Learning
            // lapses 只有在从 Review 状态变回 Relearning 时才会显著增加，或者取决于具体版本实现
            expect(valuesCall.state).toBe(State.Learning);
        });

        it('答对时应根据耗时计算新状态', async () => {
            mockDrizzleDb.query.questions.findFirst.mockResolvedValueOnce({
                id: 1, content: 'Q', options: '[]', correct_ratio: 0.8
            });
            mockDrizzleDb.query.question_srs.findFirst.mockResolvedValueOnce(undefined);
            
            // 1000ms 答对 -> Easy
            await srsService.updateQuestionSrs(1, 1, true, 1000);
            
            const valuesCall = chain['values'].mock.calls[0][0];
            expect(valuesCall.reps).toBe(1);
            // Easy 状态下初次复习间隔通常大于 0
            expect(valuesCall.scheduled_days).toBeGreaterThan(0);
        });

        it('应该根据 FSRS 逻辑计算难度（答错时难度较高，答对且简单时难度较低）', async () => {
            mockDrizzleDb.query.questions.findFirst.mockResolvedValueOnce({
                id: 1, content: 'Q', options: '[]', correct_ratio: 0.5
            });
            mockDrizzleDb.query.question_srs.findFirst.mockResolvedValueOnce(undefined);
            
            // 答错 (Again)
            await srsService.updateQuestionSrs(1, 1, false, 5000);
            const againDifficulty = chain['values'].mock.calls[0][0].difficulty;

            vi.clearAllMocks();
            mockDrizzleDb.query.questions.findFirst.mockResolvedValueOnce({
                id: 1, content: 'Q', options: '[]', correct_ratio: 0.5
            });
            mockDrizzleDb.query.question_srs.findFirst.mockResolvedValueOnce(undefined);

            // 答对且秒杀 (Easy)
            await srsService.updateQuestionSrs(1, 1, true, 500);
            const easyDifficulty = chain['values'].mock.calls[0][0].difficulty;

            // FSRS 逻辑：答错后的难度应大于秒杀后的难度
            expect(againDifficulty).toBeGreaterThan(easyDifficulty);
        });
    });

    describe('getDueCount', () => {
        it('应该统计到期题目数', async () => {
            chain['get'].mockResolvedValueOnce({ count: 5 });
            const count = await srsService.getDueCount(1);
            expect(count).toBe(5);
            expect(mockDrizzleDb.select).toHaveBeenCalled();
        });
    });
});
