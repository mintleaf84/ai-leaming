"use client";

import React, { useEffect, useState, use, useRef, useCallback } from 'react';
import { getSessionDetailAction, deleteSessionAction, exportSessionMarkdownAction } from '@/server/actions/history';
import { type SessionDetail } from '@/lib/services/history';
import { generateDeepAnalysisAction, getAnalysisReportAction } from '@/server/actions/report';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Trash2, Target, Sparkles, Loader2, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { SessionSummary, AnswerSheet, QuestionCard, QuestionLogData } from '@/components/history';
import dynamic from 'next/dynamic';

const MarkdownViewer = dynamic(() => import('@/components/chat/MarkdownViewer'), {
    ssr: false,
    loading: () => <div className="h-40 animate-pulse bg-muted rounded-xl" />
});
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  // 状态管理
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [showAnswerCard, setShowAnswerCard] = useState(false);
  const [showWrongOnly, setShowWrongOnly] = useState(false); // 新增：只看错题状态

  // AI 深度分析状态
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisReport, setAnalysisReport] = useState<string | null>(null);

  // 导出状态
  const [isExporting, setIsExporting] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  // 题目元素的 refs
  const questionRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 数据加载
  useEffect(() => {
    const abortController = new AbortController();

    getSessionDetailAction(id).then(result => {
      if (!abortController.signal.aborted) {
        setDetail(result?.data || null);
        setIsLoading(false);
      }
    });

    // 加载已保存的分析报告
    getAnalysisReportAction(id).then(result => {
      if (!abortController.signal.aborted && result?.data?.success && result.data.report) {
        setAnalysisReport(result.data.report);
      }
    });

    return () => {
      abortController.abort();
    };
  }, [id]);

  // 删除处理
  const handleDelete = useCallback(async () => {
    if (!confirm('确定要删除这条练习记录吗？此操作不可撤销（掌握度不受影响）。')) {
      return;
    }
    setIsDeleting(true);
    const result = await deleteSessionAction(id);
    if (result?.data?.success) {
      toast.success('记录已成功删除');
      router.push('/history');
    } else {
      toast.error(result?.data?.message || '删除失败');
      setIsDeleting(false);
    }
  }, [id, router]);

  // 展开/收起切换
  const toggleExpand = useCallback((idx: number) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }, []);

  // 滚动到指定题目（使用 scrollIntoView 以兼容 main 容器滚动）
  const scrollToQuestion = useCallback((idx: number) => {
    setShowAnswerCard(false);
    // 如果开启了只看错题，且该题是正确的，则先关闭只看错题模式
    if (showWrongOnly && detail?.logs?.[idx]?.isCorrect) {
      setShowWrongOnly(false);
      toast.info('已自动切换显示所有题目');
    }

    // 稍微延迟以等待答题卡关闭动画及可能的列表渲染
    setTimeout(() => {
      const element = questionRefs.current[idx];
      if (element) {
        // scrollIntoView 能够自动找到滚动的父容器，block: 'center' 避免被顶部/底部遮挡
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setExpandedItems(prev => new Set(prev).add(idx));
      }
    }, 150);
  }, [showWrongOnly, detail]);

  // AI 深度分析
  const handleAnalyze = useCallback(async () => {
    if (analysisReport) {
      // 已有报告，切换显示/隐藏
      setShowAnalysis(!showAnalysis);
      return;
    }

    setIsAnalyzing(true);
    setShowAnalysis(true);
    const result = await generateDeepAnalysisAction({ sessionId: id });
    setIsAnalyzing(false);

    if (result?.data?.success && result.data.report) {
      setAnalysisReport(result.data.report);
    } else {
      toast.error(result?.data?.error || 'AI 分析失败');
      setShowAnalysis(false);
    }
  }, [id, analysisReport, showAnalysis]);

  // 导出 Markdown
  const handleExport = useCallback(async () => {
    setIsExporting(true);
    const result = await exportSessionMarkdownAction(id);
    setIsExporting(false);

    if (result?.data?.success && result.data.markdown && result.data.filename) {
      // 创建 Blob 并下载
      const blob = new Blob([result.data.markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.data.filename;

      // 兼容 SSR 环境，使用 requestAnimationFrame 确保在客户端执行
      if (typeof window !== 'undefined' && document.body) {
        requestAnimationFrame(() => {
          try {
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          } catch {
            // Fallback: 直接点击
            a.click();
          }
        });
      } else {
        a.click();
      }

      URL.revokeObjectURL(url);
      toast.success('导出成功');
    } else {
      toast.error(result?.data?.error || '导出失败');
    }
  }, [id]);

  // 加载状态
  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">正在加载会话详情...</div>;
  }

  if (!detail) {
    return <div className="p-8 text-center text-destructive">找不到该练习记录</div>;
  }

  // 计算过滤后的题目列表（保留原始索引）
  const displayedQuestions = (detail.logs || []).map((log, index) => ({ log, index }))
    .filter(item => !showWrongOnly || !item.log.isCorrect);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto pb-20 min-h-[calc(100vh-64px)] bg-background">
      {/* 头部导航 */}
      <div className="flex items-center justify-between mb-6">
        <Link href="/history" className="flex items-center gap-2 text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors group">
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          返回历史列表
        </Link>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-blue-600 hover:bg-blue-500/10"
            onClick={handleExport}
            disabled={isExporting}
          >
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? '导出中...' : '导出 Markdown'}
          </Button>
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {isDeleting ? '正在删除...' : '删除此记录'}
          </Button>
        </div>
      </div>

      {/* 练习总结 */}
      <SessionSummary
        createdAt={detail.session.createdAt}
        totalQuestions={detail.session.totalQuestions}
        accuracy={detail.session.accuracy}
        reviewCount={detail.session.reviewCount}
      />

      {/* AI 深度分析区域 */}
      <div className="mb-6">
        <Button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white gap-2"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              AI 正在分析...
            </>
          ) : analysisReport ? (
            <>
              <Sparkles className="h-4 w-4" />
              {showAnalysis ? '收起分析报告' : '查看分析报告'}
              {showAnalysis ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              AI 深度分析
            </>
          )}
        </Button>

        {/* 分析报告展示 */}
        {showAnalysis && (
          <div className="mt-4 bg-gradient-to-br from-purple-500/5 to-blue-500/5 border border-purple-500/20 rounded-xl p-6">
            {isAnalyzing ? (
              <div className="text-center py-8 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-purple-500" />
                <p>AI 正在分析您的答题情况...</p>
                <p className="text-sm mt-1">预计需要 5-10 秒</p>
              </div>
            ) : analysisReport ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <MarkdownViewer content={analysisReport} />
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* 答题详情列表 */}
      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Target className="h-5 w-5 text-blue-500" />
            答题详情
          </h2>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="show-wrong"
              checked={showWrongOnly}
              onCheckedChange={(checked) => setShowWrongOnly(!!checked)}
            />
            <Label
              htmlFor="show-wrong"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
            >
              只看错题
            </Label>
          </div>
        </div>

        {displayedQuestions.length > 0 ? (
          displayedQuestions.map(({ log, index }) => (
            <QuestionCard
              key={index} // 使用原始 index 作为 key 是安全的，因为数据是静态的
              log={log as QuestionLogData}
              index={index}
              isExpanded={expandedItems.has(index)}
              onToggle={() => toggleExpand(index)}
              refCallback={(el) => { questionRefs.current[index] = el; }}
            />
          ))
        ) : (
          <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
            {showWrongOnly ? '太棒了！本次练习没有错题 🎉' : '暂无答题记录'}
          </div>
        )}
      </div>

      {/* 悬浮答题卡 */}
      <AnswerSheet
        logs={detail.logs}
        isOpen={showAnswerCard}
        onToggle={() => setShowAnswerCard(!showAnswerCard)}
        onSelect={scrollToQuestion}
      />
    </div>
  );
}
