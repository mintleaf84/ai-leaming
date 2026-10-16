"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  getSimilarQuestionsAction,
} from "@/server/actions/wrong-questions";
import {
  getFoldersAction,
  createFolderAction,
  renameFolderAction,
  deleteFolderAction,
  addToFolderAction,
  getFolderQuestionsAction,
} from "@/server/actions/question-folders";
import {
  type WrongQuestionItem,
  type WrongQuestionsByTag,
  type WrongQuestionDetail,
} from "@/lib/services/wrong-question";
import { type RagResult } from "@/lib/ai/rag";
import type { QuestionFolder } from "@/lib/services/question-folder";

// 视图模式类型
export type ViewMode = "list" | "byTag" | "folder" | "mastered";

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
  const [groupedQuestions, setGroupedQuestions] = useState<
    WrongQuestionsByTag[]
  >([]);
  const [masteredQuestions, setMasteredQuestions] = useState<
    WrongQuestionItem[]
  >([]);
  const [stats, setStats] = useState<WrongBookStats>({
    total: 0,
    recent: 0,
    frequent: 0,
  });

  // 分页状态
  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // UI 状态
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isCreating, setIsCreating] = useState(false);
  const [isRandomLoading, setIsRandomLoading] = useState(false);

  // 详情展开状态
  const [expandedQuestionId, setExpandedQuestionId] = useState<number | null>(
    null,
  );
  const [questionDetail, setQuestionDetail] =
    useState<WrongQuestionDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // 推荐相似题状态
  const [recommendedQuestions, setRecommendedQuestions] = useState<RagResult[]>(
    [],
  );
  const [isRecommendLoading, setIsRecommendLoading] = useState(false);
  const [showRecommendDialog, setShowRecommendDialog] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initializeProgress, setInitializeProgress] = useState("");

  // 文件夹状态
  const [folders, setFolders] = useState<QuestionFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderQuestions, setFolderQuestions] = useState<WrongQuestionItem[]>(
    [],
  );
  const [showAddToFolderDialog, setShowAddToFolderDialog] = useState(false);
  const [isFolderSubmitting, setIsFolderSubmitting] = useState(false);

  // 加载数据 (第一页)
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setPage(0);
    const [qRes, gRes, sRes, mRes, fRes] = await Promise.all([
      getWrongQuestionsAction({ limit: pageSize, offset: 0 }),
      getWrongQuestionsByTagAction(),
      getWrongQuestionsStatsAction(),
      getMasteredQuestionsAction(),
      getFoldersAction(),
    ]);
    setQuestions(qRes.data?.questions || []);
    setTotal(qRes.data?.total || 0);
    setGroupedQuestions(gRes.data?.find || []);
    setStats(sRes.data || { total: 0, recent: 0, frequent: 0 });
    setMasteredQuestions(mRes.data?.questions || []);
    setFolders(fRes.data?.folders || []);
    setIsLoading(false);
  }, [pageSize]);

  // 加载更多
  const loadMore = useCallback(async () => {
    if (questions.length >= total || isLoadingMore) return;
    setIsLoadingMore(true);
    const nextPage = page + 1;
    const qRes = await getWrongQuestionsAction({
      limit: pageSize,
      offset: nextPage * pageSize,
    });
    setQuestions((prev) => [...prev, ...(qRes.data?.questions || [])]);
    setPage(nextPage);
    setIsLoadingMore(false);
  }, [page, pageSize, questions.length, total, isLoadingMore]);

  // 跳转到指定页码
  const goToPage = useCallback(
    async (targetPage: number) => {
      const totalPages = Math.ceil(total / pageSize);
      if (targetPage < 0 || targetPage >= totalPages || targetPage === page)
        return;

      setIsLoadingMore(true);
      const qRes = await getWrongQuestionsAction({
        limit: pageSize,
        offset: targetPage * pageSize,
      });
      setQuestions(qRes.data?.questions || []);
      setPage(targetPage);
      setIsLoadingMore(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [page, pageSize, total],
  );

  // 初始化加载
  useEffect(() => {
    loadData();
  }, [loadData]);

  // 切换知识点展开/收起
  const toggleTag = useCallback((tag: string) => {
    setExpandedTags((prev) => {
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
    setSelectedIds((prev) => {
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
      setSelectedIds(new Set(questions.map((q) => q.questionId)));
    }
  }, [selectedIds.size, questions]);

  // 开始练习（支持 limit 控制题量）
  const startPractice = useCallback(
    async (ids?: number[], limit?: number) => {
      let practiceIds = ids || Array.from(selectedIds);
      if (practiceIds.length === 0) {
        toast.error("请先选择要练习的错题");
        return;
      }

      // 按 limit 截取题目数量
      if (limit && limit < practiceIds.length) {
        practiceIds = practiceIds.slice(0, limit);
      }

      setIsCreating(true);
      const result = await createWrongQuestionsPracticeAction(practiceIds);
      setIsCreating(false);

      if (result.data?.success) {
        router.push(`/practice?sessionId=${result.data?.sessionId}`);
      } else {
        toast.error(result.data?.message || "创建练习失败");
      }
    },
    [selectedIds, router],
  );

  // 开始随机练习（支持 priority/random 两种排序模式）
  const startRandomPractice = useCallback(
    async (
      count: number = 15,
      tag?: string,
      mode: "priority" | "random" = "priority",
    ) => {
      setIsRandomLoading(true);
      try {
        // 1. 获取随机题目
        const res = await getRandomWrongQuestionsAction({ count, tag, mode });
        const randomQuestions = res.data?.questions || [];

        if (randomQuestions.length === 0) {
          toast.error("未找到符合条件的错题，快去练习吧！");
          return;
        }

        // 2. 创建练习会话
        const ids = randomQuestions.map((q) => q.questionId);
        const result = await createWrongQuestionsPracticeAction(ids);

        if (result.data?.success) {
          router.push(`/practice?sessionId=${result.data?.sessionId}`);
        } else {
          toast.error(result.data?.message || "创建随机练习失败");
        }
      } catch (error) {
        console.error("Random practice error:", error);
        toast.error("操作失败，请重试");
      } finally {
        setIsRandomLoading(false);
      }
    },
    [router],
  );

  // 展开/收起题目详情
  const toggleQuestionDetail = useCallback(
    async (questionId: number) => {
      const currentId = expandedQuestionId;

      if (currentId === questionId) {
        // 收起详情
        setExpandedQuestionId(null);
        setQuestionDetail(null);
        return;
      }

      // 展开新题目详情
      setExpandedQuestionId(questionId);
      setIsLoadingDetail(true);

      getWrongQuestionDetailAction(questionId).then((result) => {
        setQuestionDetail(result.data?.question || null);
        setIsLoadingDetail(false);
      });
    },
    [expandedQuestionId],
  );

  // 标记为已掌握
  const handleMarkAsMastered = useCallback(
    async (questionId: number) => {
      const result = await markAsMasteredAction(questionId);
      if (result.data?.success) {
        toast.success("已标记为掌握！该题目已移至归档。");
        setExpandedQuestionId(null);
        setQuestionDetail(null);
        await loadData();
      } else {
        toast.error(result.data?.message || "标记失败");
      }
    },
    [loadData],
  );

  // 取消已掌握标记
  const handleUnmarkMastered = useCallback(
    async (questionId: number) => {
      const result = await unmarkMasteredAction(questionId);
      if (result.data?.success) {
        toast.success("已恢复到错题本");
        await loadData();
      } else {
        toast.error(result.data?.message || "操作失败");
      }
    },
    [loadData],
  );

  // 推荐相似题
  const handleRecommendSimilar = useCallback(async (questionId: number) => {
    setIsRecommendLoading(true);
    setShowRecommendDialog(true);

    const result = await getSimilarQuestionsAction({ questionId, limit: 5 });
    setIsRecommendLoading(false);

    if (
      result.data?.success &&
      result.data.questions &&
      result.data.questions.length > 0
    ) {
      setRecommendedQuestions(result.data.questions);
    } else {
      setRecommendedQuestions([]);
    }
  }, []);

  // 关闭推荐弹窗
  const closeRecommendDialog = useCallback(() => {
    setShowRecommendDialog(false);
    setRecommendedQuestions([]);
  }, []);

  // 从弹窗开始练习推荐题目
  const handleStartRecommended = useCallback(
    async (questionIds: number[]) => {
      setShowRecommendDialog(false);
      await startPractice(questionIds);
    },
    [startPractice],
  );

  // ========== 文件夹操作 ==========

  // 选择文件夹（tag 或自定义）
  const handleSelectFolder = useCallback(
    async (id: string | null) => {
      setSelectedFolderId(id);

      if (!id) {
        setFolderQuestions([]);
        return;
      }

      // tag 文件夹
      if (id.startsWith("tag:")) {
        const tagPath = id.slice(4);
        const group = groupedQuestions.find((g) => g.tag === tagPath);
        setFolderQuestions(group?.questions || []);
        return;
      }

      // 自定义文件夹
      if (id.startsWith("folder:")) {
        const folderId = parseInt(id.slice(7), 10);
        const result = await getFolderQuestionsAction({ folderId });
        setFolderQuestions(result.data?.questions || []);
      }
    },
    [groupedQuestions],
  );

  // 选中文件夹后，若加载了 groupedQuestions 变化，刷新当前 tag 文件夹内容
  useEffect(() => {
    if (selectedFolderId?.startsWith("tag:")) {
      const tagPath = selectedFolderId.slice(4);
      const group = groupedQuestions.find((g) => g.tag === tagPath);
      setFolderQuestions(group?.questions || []);
    }
  }, [selectedFolderId, groupedQuestions]);

  // 创建自定义文件夹
  const handleCreateFolder = useCallback(
    async (name: string, color: string) => {
      const result = await createFolderAction({ name, color });
      if (result.data?.success) {
        toast.success("文件夹创建成功");
        await loadData();
      } else {
        toast.error("创建失败");
      }
    },
    [loadData],
  );

  // 重命名文件夹
  const handleRenameFolder = useCallback(
    async (folderId: number, name: string) => {
      const result = await renameFolderAction({ folderId, name });
      if (result.data?.success) {
        await loadData();
      } else {
        toast.error("重命名失败");
      }
    },
    [loadData],
  );

  // 删除文件夹
  const handleDeleteFolder = useCallback(
    async (folderId: number) => {
      const result = await deleteFolderAction({ folderId });
      if (result.data?.success) {
        toast.success("文件夹已删除");
        if (selectedFolderId === `folder:${folderId}`) {
          setSelectedFolderId(null);
          setFolderQuestions([]);
        }
        await loadData();
      } else {
        toast.error("删除失败");
      }
    },
    [loadData, selectedFolderId],
  );

  // 打开"添加到文件夹"弹窗
  const openAddToFolderDialog = useCallback(() => {
    if (selectedIds.size === 0) {
      toast.error("请先选择要添加的题目");
      return;
    }
    setShowAddToFolderDialog(true);
  }, [selectedIds.size]);

  // 关闭弹窗
  const closeAddToFolderDialog = useCallback(() => {
    setShowAddToFolderDialog(false);
  }, []);

  // 批量添加到文件夹
  const handleAddToFolder = useCallback(
    async (folderId: number) => {
      setIsFolderSubmitting(true);
      const questionIds = Array.from(selectedIds);
      const result = await addToFolderAction({ folderId, questionIds });
      setIsFolderSubmitting(false);

      if (result.data?.success) {
        toast.success(`已将 ${result.data.added} 道题添加到文件夹`);
        setShowAddToFolderDialog(false);
        setSelectedIds(new Set());
        // 刷新文件夹列表（更新计数）
        const fRes = await getFoldersAction();
        setFolders(fRes.data?.folders || []);
        // 如果正在查看该文件夹，刷新内容
        if (selectedFolderId === `folder:${folderId}`) {
          const qRes = await getFolderQuestionsAction({ folderId });
          setFolderQuestions(qRes.data?.questions || []);
        }
      } else {
        toast.error("添加失败");
      }
    },
    [selectedIds, selectedFolderId],
  );

  return {
    // 数据
    questions,
    groupedQuestions,
    masteredQuestions,
    stats,

    // 分页
    page,
    pageSize,
    total,
    hasMore: questions.length < total,
    isLoadingMore,
    loadMore,

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

    // 推荐相似题
    recommendedQuestions,
    isRecommendLoading,
    showRecommendDialog,
    isInitializing,
    initializeProgress,

    // 文件夹
    folders,
    selectedFolderId,
    folderQuestions,
    showAddToFolderDialog,
    isFolderSubmitting,

    // 方法
    loadData,
    goToPage,
    toggleTag,
    toggleSelect,
    selectAll,
    startPractice,
    startRandomPractice,
    toggleQuestionDetail,
    handleMarkAsMastered,
    handleUnmarkMastered,
    handleRecommendSimilar,
    closeRecommendDialog,
    handleStartRecommended,

    // 文件夹方法
    handleSelectFolder,
    handleCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
    openAddToFolderDialog,
    closeAddToFolderDialog,
    handleAddToFolder,
  };
}
