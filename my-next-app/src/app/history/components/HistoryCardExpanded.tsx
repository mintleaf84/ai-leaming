"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getSessionDetailAction } from "@/server/actions/history";
import { type SessionDetail } from "@/lib/services/history";
import {
  generateDeepAnalysisAction,
  getAnalysisReportAction,
} from "@/server/actions/report";
import { QuestionCard, AnswerSheet } from "@/components/history";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { toast } from "sonner";
import { ExpandedHeader } from "./ExpandedHeader";
import { QuestionsListHeader } from "./QuestionsListHeader";
import { CardSwipeView } from "./CardSwipeView";

interface HistoryCardExpandedProps {
  sessionId: string;
  initialData: Partial<SessionDetail["session"]>;
  onClose: () => void;
}

export const HistoryCardExpanded: React.FC<HistoryCardExpandedProps> = ({
  sessionId,
  initialData,
  onClose,
}) => {
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [showWrongOnly, setShowWrongOnly] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisReport, setAnalysisReport] = useState<string | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [isAnswerSheetOpen, setIsAnswerSheetOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "card">("list");
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [scrollParent, setScrollParent] = useState<HTMLDivElement | null>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  // Radix 关闭时默认把焦点还给 DialogTrigger；本组件由外部状态驱动、没有
  // Trigger，不兜底焦点会落到 body（读屏回到页首）。
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // 滚动锁交给 Radix Dialog（打开时锁 body 并补滚动条宽度）。
  // 原来这里手写锁 body.overflow，但本页真正的滚动容器是 layout 里的
  // <main className="overflow-y-auto">，而 body 本身不滚 —— 那段其实锁不住，
  // 只会多一次 padding-right 抖动。别两套并存。

  // 1. Data Fetching via React Query
  const {
    data: detail,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["sessionDetail", sessionId],
    queryFn: async () => {
      const res = await getSessionDetailAction(sessionId);
      if (res?.serverError) throw new Error(res.serverError);
      if (!res?.data) throw new Error("无法加载练习详情");
      return res.data;
    },
    enabled: !!sessionId,
    retry: 1,
    throwOnError: false,
  });

  // 显示错误状态
  useEffect(() => {
    if (error) {
      toast.error(error.message || "加载失败，请稍后重试");
    }
  }, [error]);

  // 2. Load cached report on mount
  useEffect(() => {
    let isMounted = true;
    getAnalysisReportAction(sessionId).then((result) => {
      if (isMounted && result.data?.success && result.data?.report) {
        setAnalysisReport(result.data.report);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  const handleAnalyze = async () => {
    if (analysisReport) {
      setShowAnalysis(!showAnalysis);
      return;
    }
    setIsAnalyzing(true);
    setShowAnalysis(true);
    const result = await generateDeepAnalysisAction({ sessionId });
    setIsAnalyzing(false);
    if (result.data?.success && result.data?.report)
      setAnalysisReport(result.data.report);
    else toast.error("AI 分析失败");
  };

  const displayedQuestions = useMemo(() => {
    if (!detail?.logs) return [];
    return detail.logs
      .map((log, index) => ({ log, index }))
      .filter((item) => !showWrongOnly || !item.log.isCorrect);
  }, [detail, showWrongOnly]);

  // 关闭后把焦点还给打开前的元素（列表卡片的展开按钮）；它若已被卸载
  // （例如期间删掉了这条记录），退到主滚动区而不是 body。
  const handleCloseAutoFocus = (event: Event) => {
    event.preventDefault();
    const target = restoreFocusRef.current;
    if (target?.isConnected) {
      target.focus();
      return;
    }
    const main = document.querySelector<HTMLElement>("main");
    if (main) {
      main.setAttribute("tabindex", "-1");
      main.focus();
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        hideClose
        aria-modal="true"
        aria-describedby={undefined}
        overlayClassName="bg-background/60"
        onOpenAutoFocus={() => {
          // 必须在 Radix 把焦点移进浮层之前记下触发元素（此时 activeElement 还是它）
          restoreFocusRef.current =
            document.activeElement as HTMLElement | null;
        }}
        onCloseAutoFocus={handleCloseAutoFocus}
        className="flex h-full w-full max-w-none gap-0 rounded-none border-0 bg-transparent p-0 shadow-none data-[state=open]:animate-none data-[state=closed]:animate-none"
      >
        {/* 可见标题在 ExpandedHeader 的 h3 里；Title 只给读屏与 dialog 命名用 */}
        <DialogTitle className="sr-only">练习记录详情</DialogTitle>

        {/* Scrollable Container - 固定时长 tween，与 header 的 layoutId spring 协调 */}
        <motion.div
          ref={setScrollParent}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="h-full w-full overflow-y-auto pt-4 md:pt-12 pb-20 px-4 md:px-8 custom-scrollbar"
        >
          <div className="max-w-4xl mx-auto pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              style={{ borderRadius: "1.5rem" }}
              className="bg-card border border-border/50 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] overflow-hidden pointer-events-auto flex flex-col min-h-[60vh]"
            >
              {/* 1. Header Area (Extracted) */}
              <ExpandedHeader
                sessionId={sessionId}
                detail={detail ?? null}
                initialData={initialData}
                isLoading={isLoading}
                onClose={onClose}
              />

              {/* 2. Content Area */}
              {isLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center p-20 space-y-4">
                  <Loader2 className="w-10 h-10 animate-spin text-primary/30" />
                  <p className="text-sm font-bold text-muted-foreground animate-pulse">
                    正在调取练习存证...
                  </p>
                </div>
              ) : isError ? (
                // 详情请求失败时不能落到"没有题目"的空列表上：那会让用户
                // 以为这套练习是一道题都没做
                <div className="flex-1 flex items-center justify-center p-6">
                  <ErrorState
                    title="练习记录加载失败"
                    description={
                      error instanceof Error && error.message
                        ? `这段练习记录没加载出来。（${error.message}）`
                        : "这段练习记录没加载出来。"
                    }
                    onRetry={() => void refetch()}
                  />
                </div>
              ) : (
                scrollParent && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {viewMode === "list" ? (
                      <div className="flex-1 flex flex-col overflow-hidden animate-fade-in">
                        <Virtuoso
                          ref={virtuosoRef}
                          style={{ height: "auto", minHeight: "60vh" }}
                          useWindowScroll={false}
                          customScrollParent={scrollParent || undefined}
                          data={displayedQuestions}
                          increaseViewportBy={300}
                          components={{
                            Header: () => (
                              <QuestionsListHeader
                                isAnalyzing={isAnalyzing}
                                analysisReport={analysisReport}
                                showAnalysis={showAnalysis}
                                onAnalyze={handleAnalyze}
                                showWrongOnly={showWrongOnly}
                                onShowWrongOnlyChange={setShowWrongOnly}
                                viewMode={viewMode}
                                onViewModeChange={setViewMode}
                              />
                            ),
                            Footer: () => <div className="h-20" />,
                          }}
                          itemContent={(_, { log, index }) => (
                            <div className="px-5 md:px-12 pb-8">
                              <QuestionCard
                                log={log}
                                index={index}
                                isExpanded={expandedItems.has(index)}
                                onToggle={() => {
                                  setExpandedItems((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(index)) next.delete(index);
                                    else next.add(index);
                                    return next;
                                  });
                                }}
                              />
                            </div>
                          )}
                        />
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col overflow-hidden animate-fade-in">
                        <QuestionsListHeader
                          isAnalyzing={isAnalyzing}
                          analysisReport={analysisReport}
                          showAnalysis={showAnalysis}
                          onAnalyze={handleAnalyze}
                          showWrongOnly={showWrongOnly}
                          onShowWrongOnlyChange={setShowWrongOnly}
                          viewMode={viewMode}
                          onViewModeChange={setViewMode}
                        />
                        <div className="flex-1 py-4">
                          <CardSwipeView
                            questions={displayedQuestions}
                            initialIndex={currentCardIndex}
                            onIndexChange={(idx) => {
                              const dispIdx = displayedQuestions.findIndex(
                                (q) => q.index === idx,
                              );
                              if (dispIdx !== -1) setCurrentCardIndex(dispIdx);
                            }}
                          />
                        </div>
                        <div className="h-20" />
                      </div>
                    )}
                  </div>
                )
              )}
            </motion.div>
          </div>
        </motion.div>

        {/* 3. Floating Answer Sheet (Always on top when ready)
            必须留在 DialogContent 内：Radix 模态浮层会给外部兄弟节点打
            aria-hidden 并屏蔽 pointer-events，放外面答题卡就点不动了 */}
        {!isLoading && detail?.logs && (
          <AnswerSheet
            logs={detail.logs}
            isOpen={isAnswerSheetOpen}
            onToggle={() => setIsAnswerSheetOpen(!isAnswerSheetOpen)}
            onSelect={(idx) => {
              const displayIdx = displayedQuestions.findIndex(
                (q: { index: number }) => q.index === idx,
              );
              if (displayIdx !== -1) {
                if (viewMode === "list") {
                  virtuosoRef.current?.scrollToIndex({
                    index: displayIdx,
                    align: "start",
                    behavior: "smooth",
                  });
                  setExpandedItems((prev) => new Set(prev).add(idx));
                } else {
                  setCurrentCardIndex(displayIdx);
                }
              } else {
                toast.info("该题目在当前过滤条件下不可见");
              }
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
