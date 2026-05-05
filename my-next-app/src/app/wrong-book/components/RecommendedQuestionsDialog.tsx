'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Play, Sparkles, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { RagResult } from '@/lib/ai/rag';

interface RecommendedQuestionsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    questions: RagResult[];
    isLoading: boolean;
    isInitializing: boolean;
    initializeProgress?: string;
    onStartPractice: (questionIds: number[]) => void;
}

/**
 * 推荐相似题弹窗
 * 显示 AI 基于当前错题推荐的相似题目
 */
export function RecommendedQuestionsDialog({
    isOpen,
    onClose,
    questions,
    isLoading,
    isInitializing,
    initializeProgress,
    onStartPractice
}: RecommendedQuestionsDialogProps) {
    const handleStartPractice = () => {
        const questionIds = questions
            .filter(q => q.metadata?.question_id)
            .map(q => q.metadata!.question_id as number);
        onStartPractice(questionIds);
    };

    // 加载/初始化状态
    const showLoading = isLoading || isInitializing;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-purple-500" />
                        推荐相似题
                    </DialogTitle>
                    <DialogDescription>
                        基于当前错题的知识点推荐的相似题目
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-3 py-2">
                    {showLoading ? (
                        <div className="text-center py-8">
                            <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-purple-500" />
                            <p className="text-muted-foreground">
                                {isInitializing ? '首次加载，正在初始化向量库...' : '正在分析题目知识点...'}
                            </p>
                            {initializeProgress && (
                                <p className="text-sm text-purple-600 mt-2">{initializeProgress}</p>
                            )}
                        </div>
                    ) : questions.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            暂未找到相似题目推荐
                        </div>
                    ) : (
                        questions.map((q, index) => (
                            <div
                                key={q.metadata?.question_id ? String(q.metadata.question_id) : `idx-${index}`}
                                className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                                onClick={() => handleStartPractice()}
                            >
                                <div className="flex items-start gap-3">
                                    <span className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center text-xs font-medium text-purple-700 dark:text-purple-300 shrink-0">
                                        {index + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm line-clamp-2">
                                            {q.content}
                                        </p>
                                        {q.metadata?.dimension ? (
                                            <Badge variant="outline" className="mt-2 text-xs">
                                                {String(q.metadata.dimension)}
                                            </Badge>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="flex gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={onClose} className="flex-1">
                        关闭
                    </Button>
                    <Button
                        onClick={handleStartPractice}
                        disabled={questions.length === 0 || isLoading}
                        className="flex-1 bg-purple-600 hover:bg-purple-700"
                    >
                        <Play className="w-4 h-4 mr-1" />
                        开始练习
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}