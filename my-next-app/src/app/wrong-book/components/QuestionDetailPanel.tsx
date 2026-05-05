'use client';

import React, { useState } from 'react';
import { CheckCircle2, X, Lightbulb, History, Brain, Zap, Calendar, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type WrongQuestionDetail } from '@/lib/services/wrong-question';
import { getBeijingDiffDays, formatBeijingDate } from '@/lib/utils/datetime';

interface QuestionDetailPanelProps {
    detail: WrongQuestionDetail;
    isLoading: boolean;
    onPractice: () => void;
    onMarkAsMastered: () => void;
    onRecommendSimilar?: () => void;
    isRecommendLoading?: boolean;
}

/**
 * 判断选项是否为正确答案
 */
function isCorrectOption(opt: string, correctAnswer: string | null): boolean {
    if (!correctAnswer) return false;
    if (opt === correctAnswer) return true;

    if (correctAnswer.trim().startsWith('[')) {
        try {
            const parsed = JSON.parse(correctAnswer);
            if (Array.isArray(parsed) && parsed.includes(opt)) {
                return true;
            }
        } catch { }
    }
    return false;
}

/**
 * 判断选项是否为用户错误答案
 */
function isUserWrongOption(opt: string, userAnswer: string): boolean {
    if (opt === userAnswer) return true;

    if (userAnswer.trim().startsWith('[')) {
        try {
            const parsed = JSON.parse(userAnswer);
            if (Array.isArray(parsed) && parsed.includes(opt)) {
                return true;
            }
        } catch { }
    }
    return false;
}

/**
 * 错题详情面板组件
 * 显示完整题目、选项、解析、历史记录
 */
export function QuestionDetailPanel({
    detail,
    isLoading,
    onPractice,
    onMarkAsMastered,
    onRecommendSimilar,
    isRecommendLoading
}: QuestionDetailPanelProps) {
    const [now] = useState(() => new Date());

    if (isLoading || !detail) {
        return (
            <div className="border-t bg-muted/30 p-4">
                <div className="text-center text-muted-foreground py-4">
                    加载中...
                </div>
            </div>
        );
    }

    const getDaysUntil = (dueDate: string) => {
        return getBeijingDiffDays(dueDate, now);
    };

    return (
        <div className="border-t bg-muted/30 p-4">
            <div className="space-y-4">
                {/* 完整题目 */}
                <div>
                    <h4 className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider">
                        完整题目
                    </h4>
                    <p className="text-sm text-foreground">
                        {detail.questionContent}
                    </p>
                </div>

                {/* 选项列表 */}
                <div>
                    <h4 className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider">
                        选项
                    </h4>
                    <div className="space-y-2">
                        {detail.options.map((opt: string, idx: number) => {
                            const isCorrect = isCorrectOption(opt, detail.correctAnswer);
                            const isUserWrong = isUserWrongOption(opt, detail.userLastAnswer) && !isCorrect;

                            return (
                                <div
                                    key={idx}
                                    className={`flex items-center gap-2 text-sm p-2 rounded ${isCorrect
                                        ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                                        : isUserWrong
                                            ? 'bg-red-500/10 text-red-700 dark:text-red-400 line-through'
                                            : 'text-foreground'
                                        }`}
                                >
                                    <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                                        {String.fromCharCode(65 + idx)}
                                    </span>
                                    <span>{opt}</span>
                                    {isCorrect && <CheckCircle2 className="w-4 h-4 ml-auto text-green-600" />}
                                    {isUserWrong && <X className="w-4 h-4 ml-auto text-red-600" />}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 解析 */}
                {detail.explanation && (
                    <div>
                        <h4 className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider flex items-center gap-1">
                            <Lightbulb className="w-3 h-3" />
                            解析
                        </h4>
                        <p className="text-sm text-foreground bg-amber-500/10 p-3 rounded-lg">
                            {detail.explanation}
                        </p>
                    </div>
                )}

                {/* 记忆状态与历史 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {detail.srs && (
                        <div>
                            <h4 className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider flex items-center gap-1">
                                <Brain className="w-3 h-3" />
                                记忆状态
                            </h4>
                            <div className="bg-card rounded-lg p-3 border border-border/50 space-y-2">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-muted-foreground flex items-center gap-1.5">
                                        <Zap className="w-3 h-3 text-amber-500" /> 题目难度
                                    </span>
                                    <span className="font-medium text-foreground">{detail.srs.difficulty.toFixed(1)}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-muted-foreground flex items-center gap-1.5">
                                        <Brain className="w-3 h-3 text-blue-500" /> 记忆稳定性
                                    </span>
                                    <span className="font-medium text-foreground">{detail.srs.stability.toFixed(1)} 天</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-muted-foreground flex items-center gap-1.5">
                                        <Calendar className="w-3 h-3 text-emerald-500" /> 下次复习
                                    </span>
                                    <span className="font-medium text-foreground">
                                        {formatBeijingDate(detail.srs.due_date, 'YYYY/M/D')}
                                        <span className="ml-1 opacity-60">
                                            ({getDaysUntil(detail.srs.due_date)}d)
                                        </span>
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {detail.historyLogs.length > 0 && (
                        <div>
                            <h4 className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider flex items-center gap-1">
                                <History className="w-3 h-3" />
                                历史作答
                            </h4>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                                {detail.historyLogs.slice(0, 10).map((log: WrongQuestionDetail['historyLogs'][number], idx: number) => (
                                    <div key={idx} className="flex items-center gap-2 text-xs">
                                        <span className={`w-2 h-2 rounded-full ${log.isCorrect ? 'bg-green-500' : 'bg-red-500'}`} />
                                        <span className="text-muted-foreground">
                                            {log.timestamp ? formatBeijingDate(log.timestamp, 'YYYY/M/D HH:mm') : '未知时间'}
                                        </span>
                                        <span className={log.isCorrect ? 'text-green-600' : 'text-red-600'}>
                                            {log.isCorrect ? '正确' : '错误'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* 操作按钮 */}
                <div className="flex flex-col gap-2 pt-2 border-t">
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={onPractice}
                        >
                            再次练习
                        </Button>
                        <Button
                            size="sm"
                            variant="default"
                            className="flex-1 bg-green-600 hover:bg-green-700"
                            onClick={onMarkAsMastered}
                        >
                            <CheckCircle2 className="w-4 h-4 mr-1" />
                            标记为已掌握
                        </Button>
                    </div>
                    {onRecommendSimilar && (
                        <Button
                            size="sm"
                            variant="secondary"
                            className="w-full"
                            onClick={onRecommendSimilar}
                            disabled={isRecommendLoading}
                        >
                            <Sparkles className="w-4 h-4 mr-1" />
                            {isRecommendLoading ? '推荐中...' : '推荐相似题'}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
