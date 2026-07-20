"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  AlertTriangle,
  Play,
  Flame,
  Calendar,
  Layers,
  CheckCircle2,
  Archive,
  RotateCcw,
  Shuffle,
  SortDesc,
  Sparkles,
  FolderOpen,
  FolderPlus,
  FileUp,
  PlusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWrongBookController } from "./hooks/use-wrong-book-controller";
import { WrongQuestionCard } from "./components/WrongQuestionCard";
import { TagTreeView } from "./components/TagTreeView";
import { WrongBookSkeleton } from "./components/WrongBookSkeleton";
import { QuestionCountPicker } from "./components/QuestionCountPicker";
import { RecommendedQuestionsDialog } from "./components/RecommendedQuestionsDialog";
import { FolderTreeView } from "./components/FolderTreeView";
import { FolderQuestionList } from "./components/FolderQuestionList";
import { AddToFolderDialog } from "./components/AddToFolderDialog";
import { AddQuestionDialog } from "./components/AddQuestionDialog";
import { Pagination } from "@/components/ui/pagination";
import { PageJumpInput } from "@/components/ui/page-jump-input";

export default function WrongBookPage() {
  // 复练排序模式：priority = 按错误频次+遗忘权重，random = 纯随机
  const [practiceMode, setPracticeMode] = useState<"priority" | "random">(
    "priority",
  );
  // 手动录入弹窗状态
  const [showAddQuestionDialog, setShowAddQuestionDialog] = useState(false);

  const {
    // 数据
    questions,
    groupedQuestions,
    masteredQuestions,
    stats,
    // 分页
    page,
    pageSize,
    total,
    hasMore,
    isLoadingMore,
    loadMore,
    goToPage,
    // UI 状态
    isLoading,
    viewMode,
    setViewMode,
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
    // 数据刷新
    loadData,
  } = useWrongBookController();

  // 加载状态
  if (isLoading) {
    return <WrongBookSkeleton />;
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-4xl px-4 py-8 pb-32">
        {/* 头部 */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <BookOpen className="text-red-500 h-8 w-8" />
              错题本
            </h1>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddQuestionDialog(true)}
              >
                <PlusCircle className="h-4 w-4 mr-1" />
                手动录入
              </Button>
              <Link href="/questions/import">
                <Button variant="outline" size="sm">
                  <FileUp className="h-4 w-4 mr-1" />
                  PDF 导入
                </Button>
              </Link>
            </div>
          </div>
          <p className="text-muted-foreground mt-1">
            智能汇集易错知识点，攻克薄弱环节
          </p>
        </div>

        {/* 统计卡片 */}
        {stats.total > 0 && (
          <div className="mb-8">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-card rounded-xl p-4 border shadow-sm">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <AlertTriangle className="w-4 h-4" />
                  累计错题
                </div>
                <div className="text-2xl font-bold text-foreground">
                  {stats.total}
                </div>
              </div>
              <div className="bg-card rounded-xl p-4 border shadow-sm">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Calendar className="w-4 h-4" />
                  本周新增
                </div>
                <div className="text-2xl font-bold text-amber-600">
                  {stats.recent}
                </div>
              </div>
              <div className="bg-card rounded-xl p-4 border shadow-sm">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Flame className="w-4 h-4" />
                  高频错题
                </div>
                <div className="text-2xl font-bold text-red-600">
                  {stats.frequent}
                </div>
              </div>
            </div>

            {/* 复练模式选择 + 智能随机练习入口 */}
            <div className="space-y-2">
              {/* 排序模式切换 */}
              <div className="flex items-center gap-2 bg-muted/50 rounded-xl p-1">
                <button
                  onClick={() => setPracticeMode("priority")}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    practiceMode === "priority"
                      ? "bg-card shadow text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <SortDesc className="w-3.5 h-3.5" />
                  优先复习
                </button>
                <button
                  onClick={() => setPracticeMode("random")}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    practiceMode === "random"
                      ? "bg-card shadow text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  随机顺序
                </button>
              </div>

              {/* 智能随机练习入口 - 带题量选择 */}
              <QuestionCountPicker
                totalCount={stats.total}
                onConfirm={(count) =>
                  startRandomPractice(count, undefined, practiceMode)
                }
                disabled={isRandomLoading}
              >
                <Button
                  className="w-full h-14 text-lg bg-red-600 hover:bg-red-700 shadow-lg shadow-red-500/20"
                  disabled={isRandomLoading}
                >
                  <Play
                    className={`w-5 h-5 mr-2 ${isRandomLoading ? "animate-pulse" : "fill-current"}`}
                  />
                  {isRandomLoading
                    ? "智能抽题中..."
                    : practiceMode === "priority"
                      ? "智能优先复习"
                      : "随机顺序复习"}
                </Button>
              </QuestionCountPicker>
              <p className="text-center text-[10px] text-muted-foreground opacity-70">
                {practiceMode === "priority"
                  ? '综合"错误频次"与"遗忘时长"为你挑选最急需复习的题目'
                  : "随机抽取指定数量的错题进行练习"}
              </p>
            </div>
          </div>
        )}

        {/* 无错题状态 */}
        {stats.total === 0 ? (
          <div className="bg-card rounded-2xl p-12 text-center border border-dashed border-border">
            <div className="mx-auto w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="text-green-500 h-8 w-8" />
            </div>
            <h3 className="text-lg font-medium text-foreground">
              太棒了！暂无错题
            </h3>
            <p className="text-muted-foreground mt-2 mb-6">
              继续保持正确率，或者开始新的练习挑战自己。
            </p>
            <Link href="/practice">
              <Button variant="outline">开始练习</Button>
            </Link>
          </div>
        ) : (
          <>
            {/* 视图切换 */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode("list")}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all flex items-center gap-1 ${
                    viewMode === "list"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  全部 ({questions.length})
                </button>
                <button
                  onClick={() => setViewMode("byTag")}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                    viewMode === "byTag"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  }`}
                >
                  按知识点
                </button>
                <button
                  onClick={() => setViewMode("folder")}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all flex items-center gap-1 ${
                    viewMode === "folder"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  }`}
                >
                  <FolderOpen className="w-3 h-3" />
                  文件夹
                </button>
                <button
                  onClick={() => setViewMode("mastered")}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all flex items-center gap-1 ${
                    viewMode === "mastered"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  }`}
                >
                  <Archive className="w-3 h-3" />
                  已掌握 ({masteredQuestions.length})
                </button>
              </div>

              {(viewMode === "list" || viewMode === "folder") && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={selectAll}>
                    {selectedIds.size === questions.length
                      ? "取消全选"
                      : "全选"}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    已选 {selectedIds.size} 题
                  </span>
                </div>
              )}
            </div>

            {/* 列表视图 */}
            {viewMode === "list" && (
              <div className="space-y-3">
                {questions.map((q, index) => (
                  <div
                    key={q.questionId}
                    className="animate-fade-in-up"
                    style={{ animationDelay: `${(index % pageSize) * 30}ms` }}
                  >
                    <WrongQuestionCard
                      question={q}
                      isSelected={selectedIds.has(q.questionId)}
                      isExpanded={expandedQuestionId === q.questionId}
                      detail={
                        expandedQuestionId === q.questionId
                          ? questionDetail
                          : null
                      }
                      isLoadingDetail={isLoadingDetail}
                      onToggleSelect={() => toggleSelect(q.questionId)}
                      onToggleDetail={() => toggleQuestionDetail(q.questionId)}
                      onPractice={() => startPractice([q.questionId])}
                      onMarkAsMastered={() =>
                        handleMarkAsMastered(q.questionId)
                      }
                      onRecommendSimilar={() =>
                        handleRecommendSimilar(q.questionId)
                      }
                      isRecommendLoading={isRecommendLoading}
                    />
                  </div>
                ))}

                {/* 分页 */}
                {total > pageSize && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 pb-8">
                    <span className="text-sm text-muted-foreground order-2 sm:order-1">
                      第 {page + 1} / {Math.ceil(total / pageSize)} 页 (共{" "}
                      {total} 题)
                    </span>
                    <div className="flex items-center gap-2 order-1 sm:order-2">
                      <PageJumpInput
                        totalPages={Math.ceil(total / pageSize)}
                        currentPage={page}
                        onJump={goToPage}
                        disabled={isLoadingMore}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={loadMore}
                        disabled={!hasMore || isLoadingMore}
                      >
                        {isLoadingMore
                          ? "加载中..."
                          : hasMore
                            ? "加载更多"
                            : "没有更多了"}
                      </Button>
                      {page > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            window.scrollTo({ top: 0, behavior: "smooth" })
                          }
                        >
                          返回顶部
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 按知识点视图 */}
            {viewMode === "byTag" && (
              <TagTreeView
                groupedQuestions={groupedQuestions}
                onStartPractice={startPractice}
              />
            )}

            {/* 文件夹视图 */}
            {viewMode === "folder" && (
              <div className="grid grid-cols-[280px_1fr] gap-4">
                <FolderTreeView
                  tagGroups={groupedQuestions}
                  folders={folders}
                  selectedFolderId={selectedFolderId}
                  onSelectFolder={handleSelectFolder}
                  onCreateFolder={() => {
                    handleCreateFolder("新建文件夹", "#6b7280");
                  }}
                  onRenameFolder={handleRenameFolder}
                  onDeleteFolder={handleDeleteFolder}
                  onStartPractice={startPractice}
                />
                <div>
                  {selectedFolderId ? (
                    <FolderQuestionList
                      folderName={
                        selectedFolderId.startsWith("tag:")
                          ? selectedFolderId.slice(4).split("/").pop() || ""
                          : folders.find(
                              (f) => `folder:${f.id}` === selectedFolderId,
                            )?.name || ""
                      }
                      isCustomFolder={selectedFolderId.startsWith("folder:")}
                      questions={folderQuestions}
                      selectedIds={selectedIds}
                      expandedQuestionId={expandedQuestionId}
                      questionDetail={questionDetail}
                      isLoadingDetail={isLoadingDetail}
                      isRecommendLoading={isRecommendLoading}
                      onToggleSelect={toggleSelect}
                      onToggleDetail={toggleQuestionDetail}
                      onPractice={startPractice}
                      onMarkAsMastered={handleMarkAsMastered}
                      onRecommendSimilar={handleRecommendSimilar}
                    />
                  ) : (
                    <div className="bg-card rounded-2xl p-12 text-center border border-dashed border-border">
                      <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                        <FolderOpen className="text-muted-foreground h-8 w-8" />
                      </div>
                      <h3 className="text-lg font-medium text-foreground">
                        选择一个文件夹
                      </h3>
                      <p className="text-muted-foreground mt-2">
                        从左侧选择知识点或自定义文件夹查看题目
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 已掌握视图 */}
            {viewMode === "mastered" && (
              <div className="space-y-3">
                {masteredQuestions.length === 0 ? (
                  <div className="bg-card rounded-2xl p-12 text-center border border-dashed">
                    <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                      <Archive className="text-muted-foreground h-8 w-8" />
                    </div>
                    <h3 className="text-lg font-medium">暂无已掌握的错题</h3>
                    <p className="text-muted-foreground mt-2">
                      在错题详情中点击&quot;标记为已掌握&quot;可将攻克的题目归档
                    </p>
                  </div>
                ) : (
                  masteredQuestions.map((q) => (
                    <div
                      key={q.questionId}
                      className="bg-card rounded-xl p-4 border shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm text-foreground leading-relaxed line-clamp-2 mb-2">
                            {q.questionContent}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {q.tags.slice(0, 3).map((tag) => (
                              <Badge
                                key={tag}
                                variant="outline"
                                className="text-xs"
                              >
                                {tag}
                              </Badge>
                            ))}
                            <span className="text-xs text-green-600 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              掌握于{" "}
                              {q.lastWrongAt
                                ? new Date(q.lastWrongAt).toLocaleDateString()
                                : "未知"}
                            </span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleUnmarkMastered(q.questionId)}
                          title="恢复到错题本"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* 底部操作栏 */}
      {questions.length > 0 &&
        (viewMode === "list" || viewMode === "folder") &&
        selectedIds.size > 0 && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-sm border-t">
            <div className="container mx-auto max-w-4xl flex gap-3">
              <div className="flex-1">
                <QuestionCountPicker
                  totalCount={selectedIds.size}
                  onConfirm={(count) => startPractice(undefined, count)}
                  disabled={isCreating}
                >
                  <Button
                    size="lg"
                    className="w-full h-14 text-lg"
                    disabled={isCreating}
                  >
                    {isCreating
                      ? "正在创建..."
                      : `开始练习选中的 ${selectedIds.size} 道错题`}
                    <Play className="w-5 h-5 ml-2" />
                  </Button>
                </QuestionCountPicker>
              </div>
              <Button
                size="lg"
                variant="outline"
                className="h-14 px-6 text-base"
                onClick={openAddToFolderDialog}
              >
                <FolderPlus className="w-5 h-5 mr-2" />
                添加到文件夹
              </Button>
            </div>
          </div>
        )}

      {/* 推荐相似题弹窗 */}
      <RecommendedQuestionsDialog
        isOpen={showRecommendDialog}
        onClose={closeRecommendDialog}
        questions={recommendedQuestions}
        isLoading={isRecommendLoading}
        isInitializing={isInitializing}
        initializeProgress={initializeProgress}
        onStartPractice={handleStartRecommended}
      />

      {/* 添加到文件夹弹窗 */}
      <AddToFolderDialog
        isOpen={showAddToFolderDialog}
        onClose={closeAddToFolderDialog}
        folders={folders}
        selectedCount={selectedIds.size}
        isSubmitting={isFolderSubmitting}
        onAddToFolder={handleAddToFolder}
        onCreateFolder={handleCreateFolder}
      />

      {/* 手动录入题目弹窗 */}
      <AddQuestionDialog
        open={showAddQuestionDialog}
        onOpenChange={setShowAddQuestionDialog}
        onSuccess={() => {
          // 刷新数据
          loadData();
        }}
      />
    </div>
  );
}
