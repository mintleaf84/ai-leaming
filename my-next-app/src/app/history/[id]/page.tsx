"use client";

import React, { useEffect, useState, use, useRef, useCallback } from 'react';
import { getSessionDetailAction, SessionDetail, deleteSessionAction } from '@/server/actions/history';
import { generateDeepAnalysisAction, getAnalysisReportAction } from '@/server/actions/report';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Trash2, Target, Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { SessionSummary, AnswerSheet, QuestionCard, QuestionLogData } from '@/components/history';
import ReactMarkdown from 'react-markdown';

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  // 状态管理
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [showAnswerCard, setShowAnswerCard] = useState(false);

  // AI 深度分析状态
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisReport, setAnalysisReport] = useState<string | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);

  // 题目元素的 refs
  const questionRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 数据加载
  useEffect(() => {
    getSessionDetailAction(id).then(data => {
      setDetail(data);
      setIsLoading(false);
    });

    // 加载已保存的分析报告
    getAnalysisReportAction(id).then(result => {
      if (result.success && result.report) {
        setAnalysisReport(result.report);
      }
    });
  }, [id]);

  // 删除处理
  const handleDelete = useCallback(async () => {
    if (!confirm('确定要删除这条练习记录吗？此操作不可撤销（掌握度不受影响）。')) {
      return;
    }
    setIsDeleting(true);
    const result = await deleteSessionAction(id);
    if (result.success) {
      toast.success('记录已成功删除');
      router.push('/history');
    } else {
      toast.error(result.message || '删除失败');
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

  // 滚动到指定题目（考虑导航栏高度）
  const scrollToQuestion = useCallback((idx: number) => {
    const element = questionRefs.current[idx];
    if (element) {
      const navbarHeight = 80; // 导航栏高度 + 额外间距
      const elementTop = element.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        top: elementTop - navbarHeight,
        behavior: 'smooth'
      });
      setExpandedItems(prev => new Set(prev).add(idx));
    }
    setShowAnswerCard(false);
  }, []);

  // AI 深度分析
  const handleAnalyze = useCallback(async () => {
    if (analysisReport) {
      // 已有报告，切换显示/隐藏
      setShowAnalysis(!showAnalysis);
      return;
    }

    setIsAnalyzing(true);
    setShowAnalysis(true);
    const result = await generateDeepAnalysisAction(id);
    setIsAnalyzing(false);

    if (result.success && result.report) {
      setAnalysisReport(result.report);
    } else {
      toast.error(result.error || 'AI 分析失败');
      setShowAnalysis(false);
    }
  }, [id, analysisReport, showAnalysis]);

  // 加载状态
  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">正在加载会话详情...</div>;
  }

  if (!detail) {
    return <div className="p-8 text-center text-destructive">找不到该练习记录</div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto pb-20 min-h-[calc(100vh-64px)] bg-background">
      {/* 头部导航 */}
      <div className="flex items-center justify-between mb-6">
        <Link href="/history" className="flex items-center gap-2 text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors group">
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          返回历史列表
        </Link>
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
                <ReactMarkdown>{analysisReport}</ReactMarkdown>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* 答题详情列表 */}
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2 px-2">
          <Target className="h-5 w-5 text-blue-500" />
          答题详情
        </h2>

        {detail.logs.map((log, idx) => (
          <QuestionCard
            key={idx}
            log={log as QuestionLogData}
            index={idx}
            isExpanded={expandedItems.has(idx)}
            onToggle={() => toggleExpand(idx)}
            refCallback={(el) => { questionRefs.current[idx] = el; }}
          />
        ))}
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
