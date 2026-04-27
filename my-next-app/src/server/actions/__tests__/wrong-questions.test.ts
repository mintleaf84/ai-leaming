// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { drizzleDb } from '@/lib/db';
import { resetDrizzleMock } from '@/lib/db/__mocks__';
import { 
    getWrongQuestionsAction, 
    getWrongQuestionsByTagAction, 
    getWrongQuestionsStatsAction,
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
            const mockList = [{ questionId: 1, questionContent: 'Q1', tags: [] }];
            vi.mocked(wrongQuestionService.getList).mockResolvedValue(mockList as any);

            const result = await getWrongQuestionsAction();
            expect(result).toEqual(mockList);
            expect(wrongQuestionService.getList).toHaveBeenCalledWith(1);
        });
    });

    describe('getWrongQuestionsByTagAction', () => {
        it('应该按标签分组返回错题', async () => {
            const mockList = [
                { questionId: 1, tags: ['A'] },
                { questionId: 2, tags: ['A', 'B'] }
            ];
            vi.mocked(wrongQuestionService.getList).mockResolvedValue(mockList as any);

            const result = await getWrongQuestionsByTagAction();
            expect(result).toHaveLength(2);
            expect(result.find(r => r.tag === 'A')?.count).toBe(2);
            expect(result.find(r => r.tag === 'B')?.count).toBe(1);
        });
    });

    describe('getWrongQuestionsStatsAction', () => {
        it('应该返回统计信息', async () => {
            const mockStats = { total: 10, recent: 2, frequent: 1 };
            vi.mocked(wrongQuestionService.getStats).mockResolvedValue(mockStats);

            const result = await getWrongQuestionsStatsAction();
            expect(result).toEqual(mockStats);
        });
    });

    describe('markAsMasteredAction', () => {
        it('应该调用 service 标记已掌握', async () => {
            vi.mocked(wrongQuestionService.markAsMastered).mockResolvedValue(true);
            const result = await markAsMasteredAction(123, 'note');
            expect(result.success).toBe(true);
            expect(wrongQuestionService.markAsMastered).toHaveBeenCalledWith(1, 123, 'note');
        });
    });

    describe('unmarkMasteredAction', () => {
        it('应该调用 service 取消标记', async () => {
            vi.mocked(wrongQuestionService.unmarkMastered).mockResolvedValue(true);
            const result = await unmarkMasteredAction(123);
            expect(result.success).toBe(true);
            expect(wrongQuestionService.unmarkMastered).toHaveBeenCalledWith(1, 123);
        });
    });

    describe('getWrongQuestionDetailAction', () => {
        it('应该返回题目详情', async () => {
            const mockDetail = { questionId: 1, questionContent: 'Q1' };
            vi.mocked(wrongQuestionService.getDetail).mockResolvedValue(mockDetail as any);

            const result = await getWrongQuestionDetailAction(1);
            expect(result).toEqual(mockDetail);
        });
    });

    describe('createWrongQuestionsPracticeAction', () => {
        it('应该创建练习会话', async () => {
            vi.mocked(practiceService.createReviewSession).mockResolvedValue('session_123');
            const result = await createWrongQuestionsPracticeAction([1, 2]);
            expect(result.success).toBe(true);
            expect(result.sessionId).toBe('session_123');
        });

        it('空题目列表应返回失败', async () => {
            const result = await createWrongQuestionsPracticeAction([]);
            expect(result.success).toBe(false);
        });
    });

    describe('getRandomWrongQuestionsAction', () => {
        it('应该返回推荐错题', async () => {
            const mockRecommended = [{ questionId: 1 }];
            vi.mocked(wrongQuestionService.getRandomRecommended).mockResolvedValue(mockRecommended as any);
            const result = await getRandomWrongQuestionsAction();
            expect(result).toEqual(mockRecommended);
        });
    });
});
