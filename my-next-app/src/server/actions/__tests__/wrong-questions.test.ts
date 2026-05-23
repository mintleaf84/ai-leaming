// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { drizzleDb } from '@/lib/db';
import { resetDrizzleMock } from '@/lib/db/__mocks__';
import { 
    getWrongQuestionsAction, 
    getWrongQuestionsByTagAction, 
    getWrongQuestionsStatsAction,
    createManualWrongQuestionAction,
    createWrongQuestionsPracticeAction,
    getWrongQuestionDetailAction,
    markAsMasteredAction,
    unmarkMasteredAction,
    getRandomWrongQuestionsAction
} from '../wrong-questions';
import { wrongQuestionService } from '@/lib/services/wrong-question';
import { practiceService } from '@/lib/services/practice';
import { requireUser } from '@/lib/auth/auth';

// Mock dependencies
vi.mock('@/lib/db');
vi.mock('@/lib/db/drizzle-schema');
vi.mock('@/lib/services/practice');
vi.mock('@/lib/services/wrong-question');
vi.mock('@/lib/auth/auth', () => ({
    requireUser: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    default: { error: vi.fn(), info: vi.fn() }
}));

describe('Wrong Questions Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetDrizzleMock();
        vi.mocked(requireUser).mockResolvedValue({ id: 1, username: 'testuser' } as any);
    });

    describe('getWrongQuestionsAction', () => {
        it('应该从 service 获取错题列表', async () => {
            const mockResult = {
                questions: [{ questionId: 1, questionContent: 'Q1', tags: [] }],
                total: 1
            };
            vi.mocked(wrongQuestionService.getList).mockResolvedValue(mockResult as any);

            const result = await getWrongQuestionsAction({ limit: 50, offset: 0 });
            expect(result.data?.questions).toEqual(mockResult.questions);
            expect(result.data?.total).toBe(1);
            expect(wrongQuestionService.getList).toHaveBeenCalledWith(1, { limit: 50, offset: 0 });
        });
    });

    describe('getWrongQuestionsByTagAction', () => {
        it('应该按标签分组返回错题', async () => {
            const mockResult = {
                questions: [
                    { questionId: 1, tags: ['A'] },
                    { questionId: 2, tags: ['A', 'B'] }
                ],
                total: 2
            };
            vi.mocked(wrongQuestionService.getList).mockResolvedValue(mockResult as any);

            const result = await getWrongQuestionsByTagAction();
            expect(result.data?.find).toHaveLength(2);
            expect(result.data?.find?.find((r: any) => r.tag === 'A')?.count).toBe(2);
            expect(result.data?.find?.find((r: any) => r.tag === 'B')?.count).toBe(1);
        });
    });

    describe('getWrongQuestionsStatsAction', () => {
        it('应该返回统计信息', async () => {
            const mockStats = { total: 10, recent: 2, frequent: 1 };
            vi.mocked(wrongQuestionService.getStats).mockResolvedValue(mockStats);

            const result = await getWrongQuestionsStatsAction();
            expect(result.data?.success).toBe(true);
            expect(result.data?.total).toBe(10);
            expect(result.data?.recent).toBe(2);
            expect(result.data?.frequent).toBe(1);
        });
    });

    describe('markAsMasteredAction', () => {
        it('应该调用 service 标记已掌握', async () => {
            vi.mocked(wrongQuestionService.markAsMastered).mockResolvedValue(true);
            const result = await markAsMasteredAction(123);
            expect(result.data?.success).toBe(true);
            expect(wrongQuestionService.markAsMastered).toHaveBeenCalledWith(1, 123);
        });
    });

    describe('unmarkMasteredAction', () => {
        it('应该调用 service 取消标记', async () => {
            vi.mocked(wrongQuestionService.unmarkMastered).mockResolvedValue(true);
            const result = await unmarkMasteredAction(123);
            expect(result.data?.success).toBe(true);
            expect(wrongQuestionService.unmarkMastered).toHaveBeenCalledWith(1, 123);
        });
    });

    describe('getWrongQuestionDetailAction', () => {
        it('应该返回题目详情', async () => {
            const mockDetail = { questionId: 1, questionContent: 'Q1' };
            vi.mocked(wrongQuestionService.getDetail).mockResolvedValue(mockDetail as any);

            const result = await getWrongQuestionDetailAction(1);
            expect(result.data?.question).toEqual(mockDetail);
        });
    });

    describe('createWrongQuestionsPracticeAction', () => {
        it('应该创建练习会话', async () => {
            vi.mocked(practiceService.createReviewSession).mockResolvedValue('session_123');
            const result = await createWrongQuestionsPracticeAction([1, 2]);
            expect(result.data?.success).toBe(true);
            expect(result.data?.sessionId).toBe('session_123');
        });

        describe('createManualWrongQuestionAction', () => {
            it('应该为当前用户创建题目并写入错题日志', async () => {
                const returningMock = vi.fn().mockResolvedValue([{ id: 123 }]);
                vi.mocked(drizzleDb.insert).mockReturnValue({
                    values: vi.fn().mockReturnValue({
                        returning: returningMock
                    })
                } as any);

                const result = await createManualWrongQuestionAction({
                    content: '测试题目内容12345',
                    options: ['选项A', '选项B'],
                    answer: 'A',
                    explanation: '这是一个测试解析',
                    tags: ['测试标签'],
                    dimension: 'knowledge',
                    type: 'single'
                });

                expect(result.data?.success).toBe(true);
                expect(result.data?.questionId).toBe(123);
                expect(drizzleDb.insert).toHaveBeenCalledTimes(2);
            });
        });

        it('空题目列表应返回失败', async () => {
            const result = await createWrongQuestionsPracticeAction([]);
            expect(result.data?.success).toBe(false);
        });
    });

    describe('getRandomWrongQuestionsAction', () => {
        it('应该返回推荐错题', async () => {
            const mockRecommended = [{ questionId: 1 }];
            vi.mocked(wrongQuestionService.getRandomRecommended).mockResolvedValue(mockRecommended as any);
            const result = await getRandomWrongQuestionsAction({ count: 15, mode: 'priority' });
            expect(result.data?.questions).toEqual(mockRecommended);
        });
    });
});
