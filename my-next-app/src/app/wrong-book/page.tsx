"use client";

import React from 'react';
import Link from 'next/link';
import {
    BookOpen,
    AlertTriangle,
    Play,
    Flame,
    Calendar,
    Layers,
    CheckCircle2,
    Archive,
    RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWrongBookController } from './hooks/use-wrong-book-controller';
import { WrongQuestionCard } from './components/WrongQuestionCard';
import { TagTreeView } from './components/TagTreeView';

export default function WrongBookPage() {
    const {
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
        toggleTag,
        toggleSelect,
        selectAll,
        startPractice,
        toggleQuestionDetail,
        handleMarkAsMastered,
        handleUnmarkMastered
    } = useWrongBookController();

    // 加载状态
    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center text-muted-foreground">
                正在加载错题数据...
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <main className="container mx-auto max-w-4xl px-4 py-8 pb-32">
                {/* 头部 */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                        <BookOpen className="text-red-500 h-8 w-8" />
                        错题本
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        智能汇集易错知识点，攻克薄弱环节
                    </p>
                </div>

                {/* 统计卡片 */}
                {stats.total > 0 && (
                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="bg-card rounded-xl p-4 border shadow-sm">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                                <AlertTriangle className="w-4 h-4" />
                                累计错题
                            </div>
                            <div className="text-2xl font-bold text-foreground">{stats.total}</div>
                        </div>
                        <div className="bg-card rounded-xl p-4 border shadow-sm">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                                <Calendar className="w-4 h-4" />
                                本周新增
                            </div>
                            <div className="text-2xl font-bold text-amber-600">{stats.recent}</div>
                        </div>
                        <div className="bg-card rounded-xl p-4 border shadow-sm">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                                <Flame className="w-4 h-4" />
                                高频错题
                            </div>
                            <div className="text-2xl font-bold text-red-600">{stats.frequent}</div>
                        </div>
                    </div>
                )}

                {/* 无错题状态 */}
                {stats.total === 0 ? (
                    <div className="bg-card rounded-2xl p-12 text-center border border-dashed border-border">
                        <div className="mx-auto w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mb-4">
                            <CheckCircle2 className="text-green-500 h-8 w-8" />
                        </div>
                        <h3 className="text-lg font-medium text-foreground">太棒了！暂无错题</h3>
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
                                    onClick={() => setViewMode('list')}
                                    className={`px-3 py-1.5 rounded-lg text-sm transition-all flex items-center gap-1 ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
                                        }`}
                                >
                                    <Layers className="w-3 h-3" />
                                    全部 ({questions.length})
                                </button>
                                <button
                                    onClick={() => setViewMode('byTag')}
                                    className={`px-3 py-1.5 rounded-lg text-sm transition-all ${viewMode === 'byTag' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
                                        }`}
                                >
                                    按知识点
                                </button>
                                <button
                                    onClick={() => setViewMode('mastered')}
                                    className={`px-3 py-1.5 rounded-lg text-sm transition-all flex items-center gap-1 ${viewMode === 'mastered' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
                                        }`}
                                >
                                    <Archive className="w-3 h-3" />
                                    已掌握 ({masteredQuestions.length})
                                </button>
                            </div>

                            {viewMode === 'list' && (
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={selectAll}>
                                        {selectedIds.size === questions.length ? '取消全选' : '全选'}
                                    </Button>
                                    <span className="text-sm text-muted-foreground">
                                        已选 {selectedIds.size} 题
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* 列表视图 */}
                        {viewMode === 'list' && (
                            <div className="space-y-3">
                                {questions.map((q) => (
                                    <WrongQuestionCard
                                        key={q.questionId}
                                        question={q}
                                        isSelected={selectedIds.has(q.questionId)}
                                        isExpanded={expandedQuestionId === q.questionId}
                                        detail={expandedQuestionId === q.questionId ? questionDetail : null}
                                        isLoadingDetail={isLoadingDetail}
                                        onToggleSelect={() => toggleSelect(q.questionId)}
                                        onToggleDetail={() => toggleQuestionDetail(q.questionId)}
                                        onPractice={() => startPractice([q.questionId])}
                                        onMarkAsMastered={() => handleMarkAsMastered(q.questionId)}
                                    />
                                ))}
                            </div>
                        )}

                        {/* 按知识点视图 */}
                        {viewMode === 'byTag' && (
                            <TagTreeView
                                groupedQuestions={groupedQuestions}
                                onStartPractice={startPractice}
                            />
                        )}

                        {/* 已掌握视图 */}
                        {viewMode === 'mastered' && (
                            <div className="space-y-3">
                                {masteredQuestions.length === 0 ? (
                                    <div className="bg-card rounded-2xl p-12 text-center border border-dashed">
                                        <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                                            <Archive className="text-muted-foreground h-8 w-8" />
                                        </div>
                                        <h3 className="text-lg font-medium">暂无已掌握的错题</h3>
                                        <p className="text-muted-foreground mt-2">
                                            在错题详情中点击"标记为已掌握"可将攻克的题目归档
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
                                                        {q.tags.slice(0, 3).map(tag => (
                                                            <Badge key={tag} variant="outline" className="text-xs">
                                                                {tag}
                                                            </Badge>
                                                        ))}
                                                        <span className="text-xs text-green-600 flex items-center gap-1">
                                                            <CheckCircle2 className="w-3 h-3" />
                                                            掌握于 {new Date(q.masteredAt).toLocaleDateString()}
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
            {questions.length > 0 && viewMode === 'list' && selectedIds.size > 0 && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-sm border-t">
                    <div className="container mx-auto max-w-4xl">
                        <Button
                            size="lg"
                            className="w-full h-14 text-lg"
                            onClick={() => startPractice()}
                            disabled={isCreating}
                        >
                            {isCreating ? '正在创建...' : `开始练习选中的 ${selectedIds.size} 道错题`}
                            <Play className="w-5 h-5 ml-2" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
