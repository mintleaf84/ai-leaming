'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    getWrongQuestionsAction,
    getWrongQuestionsByTagAction,
    getWrongQuestionsStatsAction,
    getMasteredQuestionsAction,
    createWrongQuestionsPracticeAction,
    getWrongQuestionDetailAction,
    markAsMasteredAction,
    unmarkMasteredAction,
    getRandomWrongQuestionsAction,
} from '@/server/actions/wrong-questions';
import { 
    type WrongQuestionItem, 
    type WrongQuestionsByTag, 
    type WrongQuestionDetail 
} from '@/lib/services/wrong-question';

// 视图模式类型
export type ViewMode = 'list' | 'byTag' | 'mastered';

// 已掌握题目类型
export interface MasteredQuestion {
    questionId: number;
    questionContent: string;
    tags: string[];
    masteredAt: string | null;
    note: string | null;
}

// 统计数据类型
export interface WrongBookStats {
    total: number;
    recent: number;
    frequent: number;
}

/**
 * 错题本控制器 Hook
 * 管理所有状态和业务逻辑
 */
export function useWrongBookController() {
    const router = useRouter();

    // 数据状态
    const [questions, setQuestions] = useState<WrongQuestionItem[]>([]);
    const [groupedQuestions, setGroupedQuestions] = useState<WrongQuestionsByTag[]>([]);
    const [masteredQuestions, setMasteredQuestions] = useState<WrongQuestionItem[]>([]);
    const [stats, setStats] = useState<WrongBookStats>({ total: 0, recent: 0, frequent: 0 });

    // UI 状态
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [isCreating, setIsCreating] = useState(false);
    const [isRandomLoading, setIsRandomLoading] = useState(false);

    // 详情展开状态
    const [expandedQuestionId, setExpandedQuestionId] = useState<number | null>(null);
    const [questionDetail, setQuestionDetail] = useState<WrongQuestionDetail | null>(null);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);

    // 加载数据
    const loadData = useCallback(async () => {
        setIsLoading(true);
        const [questionsData, groupedData, statsData, masteredData] = await Promise.all([
            getWrongQuestionsAction(),
            getWrongQuestionsByTagAction(),
            getWrongQuestionsStatsAction(),
            getMasteredQuestionsAction()
        ]);
        setQuestions(questionsData);
        setGroupedQuestions(groupedData);
        setStats(statsData);
        setMasteredQuestions(masteredData);
        setIsLoading(false);
    }, []);

    // 初始化加载
    useEffect(() => {
        loadData();
    }, [loadData]);

    // 切换知识点展开/收起
    const toggleTag = useCallback((tag: string) => {
        setExpandedTags(prev => {
            const next = new Set(prev);
            if (next.has(tag)) {
                next.delete(tag);
            } else {
                next.add(tag);
            }
            return next;
        });
    }, []);

    // 切换题目选中状态
    const toggleSelect = useCallback((id: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    // 全选/取消全选
    const selectAll = useCallback(() => {
        if (selectedIds.size === questions.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(questions.map(q => q.questionId)));
        }
    }, [selectedIds.size, questions]);

    // 开始练习（支持 limit 控制题量）
    const startPractice = useCallback(async (ids?: number[], limit?: number) => {
        let practiceIds = ids || Array.from(selectedIds);
        if (practiceIds.length === 0) {
            toast.error('请先选择要练习的错题');
            return;
        }

        // 按 limit 截取题目数量
        if (limit && limit < practiceIds.length) {
            practiceIds = practiceIds.slice(0, limit);
        }

        setIsCreating(true);
        const result = await createWrongQuestionsPracticeAction(practiceIds);
        setIsCreating(false);

        if (result.success) {
            router.push(`/practice?sessionId=${result.sessionId}`);
        } else {
            toast.error(result.message || '创建练习失败');
        }
    }, [selectedIds, router]);

    // 开始随机练习（支持 priority/random 两种排序模式）
    const startRandomPractice = useCallback(async (
        count: number = 15,
        tag?: string,
        mode: 'priority' | 'random' = 'priority'
    ) => {
        setIsRandomLoading(true);
        try {
            // 1. 获取随机题目
            const randomQuestions = await getRandomWrongQuestionsAction({ count, tag, mode });
            
            if (randomQuestions.length === 0) {
                toast.error('未找到符合条件的错题，快去练习吧！');
                return;
            }

            // 2. 创建练习会话
            const ids = randomQuestions.map(q => q.questionId);
            const result = await createWrongQuestionsPracticeAction(ids);

            if (result.success) {
                router.push(`/practice?sessionId=${result.sessionId}`);
            } else {
                toast.error(result.message || '创建随机练习失败');
            }
        } catch (error) {
            console.error("Random practice error:", error);
            toast.error('操作失败，请重试');
        } finally {
            setIsRandomLoading(false);
        }
    }, [router]);

    // 展开/收起题目详情
    const toggleQuestionDetail = useCallback(async (questionId: number) => {
        if (expandedQuestionId === questionId) {
            setExpandedQuestionId(null);
            setQuestionDetail(null);
            return;
        }

        setExpandedQuestionId(questionId);
        setIsLoadingDetail(true);
        const detail = await getWrongQuestionDetailAction(questionId);
        setQuestionDetail(detail);
        setIsLoadingDetail(false);
    }, [expandedQuestionId]);

    // 标记为已掌握
    const handleMarkAsMastered = useCallback(async (questionId: number) => {
        const result = await markAsMasteredAction(questionId);
        if (result.success) {
            toast.success('已标记为掌握！该题目已移至归档。');
            setExpandedQuestionId(null);
            setQuestionDetail(null);
            await loadData();
        } else {
            toast.error(result.message || '标记失败');
        }
    }, [loadData]);

    // 取消已掌握标记
    const handleUnmarkMastered = useCallback(async (questionId: number) => {
        const result = await unmarkMasteredAction(questionId);
        if (result.success) {
            toast.success('已恢复到错题本');
            await loadData();
        } else {
            toast.error(result.message || '操作失败');
        }
    }, [loadData]);

    return {
        // 数据
        questions,
        groupedQuestions,
        masteredQuestions,
        stats,

        // UI 状态
        isLoading,
        viewMode,
        setViewMode,
        expandedTags,
        selectedIds,
        isCreating,
        isRandomLoading,

        // 详情状态
        expandedQuestionId,
        questionDetail,
        isLoadingDetail,

        // 方法
        loadData,
        toggleTag,
        toggleSelect,
        selectAll,
        startPractice,
        startRandomPractice,
        toggleQuestionDetail,
        handleMarkAsMastered,
        handleUnmarkMastered
    };
}
