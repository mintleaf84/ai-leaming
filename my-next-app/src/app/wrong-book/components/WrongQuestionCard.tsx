'use client';

import React from 'react';
import { CheckSquare, Square, Play, AlertTriangle, Clock, Brain, Zap } from 'lucide-react';
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
            className={`bg-card rounded-xl border shadow-sm transition-shadow ${isSelected ? 'border-primary ring-1 ring-primary/20' : ''
                }`}
        >
            {/* 题目摘要行 */}
            <div className="p-4 flex items-start gap-3">
                {/* 选择按钮 */}
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
                    className="mt-1 text-muted-foreground hover:text-primary active:scale-95 transition-transform"
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
                        {question.srs && (
                            <div className="flex items-center gap-2 border-l pl-2 ml-1">
                                <span className="text-[10px] text-blue-500 flex items-center gap-1 font-medium" title="记忆稳定性 (天)">
                                    <Brain className="w-3 h-3" />
                                    {question.srs.stability.toFixed(1)}d
                                </span>
                                <span className="text-[10px] text-amber-500 flex items-center gap-1 font-medium" title="题目难度">
                                    <Zap className="w-3 h-3" />
                                    {question.srs.difficulty.toFixed(1)}
                                </span>
                            </div>
                        )}
                        <span className="text-xs text-blue-500 ml-auto font-medium">
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

            {/* 展开的详情区域与加载状态 (瞬间切换) */}
            {isExpanded && (
                <div className="border-t">
                    {detail ? (
                        <QuestionDetailPanel
                            detail={detail}
                            isLoading={isLoadingDetail}
                            onPractice={onPractice}
                            onMarkAsMastered={onMarkAsMastered}
                        />
                    ) : isLoadingDetail ? (
                        <div className="bg-muted/30 p-4">
                            <div className="text-center text-muted-foreground py-4">
                                加载中...
                            </div>
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}
