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
    WrongQuestionItem,
    WrongQuestionsByTag,
    WrongQuestionDetail
} from '@/server/actions/wrong-questions';

// 视图模式类型
export type ViewMode = 'list' | 'byTag' | 'mastered';

// 已掌握题目类型
export interface MasteredQuestion {
    questionId: string;
    questionContent: string;
    tags: string[];
    masteredAt: string;
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
    const [masteredQuestions, setMasteredQuestions] = useState<MasteredQuestion[]>([]);
    const [stats, setStats] = useState<WrongBookStats>({ total: 0, recent: 0, frequent: 0 });

    // UI 状态
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isCreating, setIsCreating] = useState(false);

    // 详情展开状态
    const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
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
    const toggleSelect = useCallback((id: string) => {
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

    // 开始练习
    const startPractice = useCallback(async (ids?: string[]) => {
        const practiceIds = ids || Array.from(selectedIds);
        if (practiceIds.length === 0) {
            toast.error('请先选择要练习的错题');
            return;
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

    // 展开/收起题目详情
    const toggleQuestionDetail = useCallback(async (questionId: string) => {
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
    const handleMarkAsMastered = useCallback(async (questionId: string) => {
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
    const handleUnmarkMastered = useCallback(async (questionId: string) => {
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
        toggleQuestionDetail,
        handleMarkAsMastered,
        handleUnmarkMastered
    };
}
