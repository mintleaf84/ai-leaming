'use client';

import React from 'react';
import { CheckSquare, Square, Play, AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { QuestionDetailPanel } from './QuestionDetailPanel';
import { WrongQuestionItem, WrongQuestionDetail } from '@/server/actions/wrong-questions';

interface WrongQuestionCardProps {
    question: WrongQuestionItem;
    isSelected: boolean;
    isExpanded: boolean;
    detail: WrongQuestionDetail | null;
    isLoadingDetail: boolean;
    onToggleSelect: () => void;
    onToggleDetail: () => void;
    onPractice: () => void;
    onMarkAsMastered: () => void;
}

/**
 * 错题卡片组件
 * 显示单个错题的摘要信息，支持展开详情
 */
export function WrongQuestionCard({
    question,
    isSelected,
    isExpanded,
    detail,
    isLoadingDetail,
    onToggleSelect,
    onToggleDetail,
    onPractice,
    onMarkAsMastered
}: WrongQuestionCardProps) {
    return (
        <div
            className={`bg-card rounded-xl border shadow-sm transition-all ${isSelected ? 'border-primary ring-1 ring-primary/20' : ''
                }`}
        >
            {/* 题目摘要行 */}
            <div className="p-4 flex items-start gap-3">
                {/* 选择按钮 */}
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
                    className="mt-1 text-muted-foreground hover:text-primary"
                >
                    {isSelected ? (
                        <CheckSquare className="w-5 h-5 text-primary" />
                    ) : (
                        <Square className="w-5 h-5" />
                    )}
                </button>

                {/* 题目内容区域 */}
                <div
                    className="flex-1 cursor-pointer"
                    onClick={onToggleDetail}
                >
                    <div className="text-sm text-foreground leading-relaxed line-clamp-2 mb-2">
                        {question.questionContent}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {question.tags.slice(0, 3).map(tag => (
                            <Badge key={tag} variant="outline" className="text-xs">
                                {tag}
                            </Badge>
                        ))}
                        <span className="text-xs text-red-500 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            答错 {question.wrongCount} 次
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(question.lastWrongAt).toLocaleDateString()}
                        </span>
                        <span className="text-xs text-blue-500 ml-auto">
                            {isExpanded ? '收起详情' : '查看详情'}
                        </span>
                    </div>
                </div>

                {/* 练习按钮 */}
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); onPractice(); }}
                    className="shrink-0"
                >
                    <Play className="w-4 h-4" />
                </Button>
            </div>

            {/* 展开的详情区域 */}
            {isExpanded && detail && (
                <QuestionDetailPanel
                    detail={detail}
                    isLoading={isLoadingDetail}
                    onPractice={onPractice}
                    onMarkAsMastered={onMarkAsMastered}
                />
            )}

            {/* 加载状态 */}
            {isExpanded && !detail && isLoadingDetail && (
                <div className="border-t bg-muted/30 p-4">
                    <div className="text-center text-muted-foreground py-4">
                        加载中...
                    </div>
                </div>
            )}
        </div>
    );
}
