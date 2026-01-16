"use client";

import React, { useState } from 'react';
import { CheckCircle2, XCircle, BookOpen, ChevronDown, ChevronUp, BrainCircuit, Lightbulb, Loader2 } from 'lucide-react';
import { formatDuration, indexToLetter } from '@/lib/utils/utils';

export interface QuestionLogData {
    questionContent: string;
    options: string[];
    correctAnswer: string;
    userAnswer: string;
    isCorrect: boolean;
    duration: number;
    tags: string[];
    source: string;
    explanation: string;
    correctRatio?: number | null;      // 全站正确率
    mostWrongAnswer?: string | null;   // 易错项
    reviewData?: any;
}

interface QuestionCardProps {
    log: QuestionLogData;
    index: number;
    isExpanded: boolean;
    onToggle: () => void;
    refCallback?: (el: HTMLDivElement | null) => void;
}

/**
 * 单个题目卡片组件
 * 包含：题目内容、选项、统计栏、解析区域、AI复盘
 */
export function QuestionCard({ log, index, isExpanded, onToggle, refCallback }: QuestionCardProps) {
    // 第一性原理分析状态
    const [fpAnalysis, setFpAnalysis] = useState<string | null>(null);
    const [isLoadingFP, setIsLoadingFP] = useState(false);

    // 获取第一性原理分析
    const handleFirstPrinciples = async () => {
        if (fpAnalysis || isLoadingFP) return; // 已有结果或正在加载

        setIsLoadingFP(true);
        try {
            const response = await fetch('/api/practice/first-principles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    questionContent: log.questionContent,
                    explanation: log.explanation,
                    wrongAnswer: log.isCorrect ? null : log.userAnswer,
                    correctAnswer: log.correctAnswer,
                }),
            });

            if (!response.ok) throw new Error('分析失败');

            const data = await response.json();
            setFpAnalysis(data.analysis);
        } catch (error) {
            console.error('第一性原理分析失败:', error);
        } finally {
            setIsLoadingFP(false);
        }
    };

    return (
        <div
            ref={refCallback}
            className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden"
        >
            {/* 题目头部 */}
            <div className={`p-5 ${log.isCorrect ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-red-500'}`}>
                <div className="flex items-start gap-3">
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-sm font-bold text-muted-foreground">{index + 1}.</span>
                        {log.isCorrect ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                            <XCircle className="h-5 w-5 text-red-500" />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground leading-relaxed">
                            {log.questionContent}
                        </div>

                        {/* 选项列表 */}
                        {log.options.length > 0 && (
                            <div className="mt-3 space-y-2">
                                {log.options.map((opt, oi) => {
                                    const letter = indexToLetter(oi);
                                    const isCorrectOption = log.correctAnswer.includes(letter);
                                    const isUserChoice = log.userAnswer.includes(letter);

                                    return (
                                        <div
                                            key={oi}
                                            className={`flex items-start gap-2 p-2 rounded-lg text-sm ${isCorrectOption
                                                ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                                                : isUserChoice && !log.isCorrect
                                                    ? 'bg-red-500/10 text-red-700 dark:text-red-400'
                                                    : 'text-muted-foreground'
                                                }`}
                                        >
                                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isCorrectOption
                                                ? 'bg-green-500 text-white'
                                                : isUserChoice && !log.isCorrect
                                                    ? 'bg-red-500 text-white'
                                                    : 'bg-muted text-muted-foreground'
                                                }`}>
                                                {letter}
                                            </span>
                                            <span>{opt}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* 统计栏 */}
                <div className="mt-4 pt-4 border-t border-border">
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-3 text-center">
                        <div>
                            <div className="text-lg font-bold text-green-600">
                                {log.correctAnswer || '-'}
                            </div>
                            <div className="text-xs text-muted-foreground">正确答案</div>
                        </div>
                        <div>
                            <div className={`text-lg font-bold ${log.isCorrect ? 'text-green-600' : 'text-red-500'}`}>
                                {log.userAnswer || '未作答'}
                            </div>
                            <div className="text-xs text-muted-foreground">你的答案</div>
                        </div>
                        {log.correctRatio != null && (
                            <div>
                                <div className="text-lg font-bold text-purple-600">
                                    {log.correctRatio}%
                                </div>
                                <div className="text-xs text-muted-foreground">全站正确率</div>
                            </div>
                        )}
                        <div>
                            <div className="text-lg font-bold text-blue-600">
                                {formatDuration(log.duration)}
                            </div>
                            <div className="text-xs text-muted-foreground">答题用时</div>
                        </div>
                        {log.mostWrongAnswer && (
                            <div className="hidden md:block">
                                <div className="text-lg font-bold text-amber-600">
                                    {log.mostWrongAnswer}
                                </div>
                                <div className="text-xs text-muted-foreground">易错项</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* 展开按钮 */}
                <button
                    onClick={onToggle}
                    className="mt-4 w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                    {isExpanded ? (
                        <>收起详情 <ChevronUp className="h-4 w-4" /></>
                    ) : (
                        <>查看解析 <ChevronDown className="h-4 w-4" /></>
                    )}
                </button>
            </div>

            {/* 展开的详情区域 */}
            {isExpanded && (
                <div className="border-t border-border">
                    {/* 第一性原理分析 */}
                    <div className="p-5 bg-gradient-to-r from-amber-500/5 to-orange-500/5 border-b border-amber-500/10">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-sm">
                                <Lightbulb className="h-4 w-4" />
                                第一性原理
                            </div>
                            {!fpAnalysis && (
                                <button
                                    onClick={handleFirstPrinciples}
                                    disabled={isLoadingFP}
                                    className="px-3 py-1.5 text-xs font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-full border border-amber-500/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                >
                                    {isLoadingFP ? (
                                        <>
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                            分析中...
                                        </>
                                    ) : (
                                        '一键解析'
                                    )}
                                </button>
                            )}
                        </div>

                        {fpAnalysis ? (
                            <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap bg-card p-4 rounded-xl border border-amber-500/20 shadow-sm">
                                {fpAnalysis}
                            </div>
                        ) : (
                            <div className="text-xs text-muted-foreground">
                                点击上方按钮，AI 将用底层逻辑为你解析这道题（≤200字）
                            </div>
                        )}
                    </div>

                    {/* 解析 */}
                    {log.explanation && (
                        <div className="p-5 bg-blue-500/5">
                            <div className="flex items-center gap-2 mb-3 text-blue-700 dark:text-blue-400 font-bold text-sm">
                                <BookOpen className="h-4 w-4" />
                                详细解析
                            </div>
                            <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                                {log.explanation}
                            </div>
                        </div>
                    )}

                    {/* 考点和来源 */}
                    <div className="p-5 bg-muted/30 space-y-3">
                        {log.tags.length > 0 && (
                            <div>
                                <div className="text-xs font-bold text-muted-foreground mb-2">考点</div>
                                <div className="flex flex-wrap gap-2">
                                    {log.tags.map(tag => (
                                        <span key={tag} className="px-3 py-1 bg-primary/10 text-primary text-sm font-medium rounded-full">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {log.source && (
                            <div>
                                <div className="text-xs font-bold text-muted-foreground mb-1">来源</div>
                                <div className="text-sm text-blue-600 dark:text-blue-400">
                                    {log.source}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* AI复盘 */}
                    {log.reviewData && (
                        <div className="p-5 bg-amber-500/5 border-t border-amber-500/20">
                            <div className="flex items-center gap-2 mb-3 text-amber-700 dark:text-amber-300 font-bold text-sm">
                                <BrainCircuit className="h-4 w-4" />
                                AI 复盘档案
                            </div>

                            {log.reviewData.quiz && (
                                <div className="mb-4">
                                    <div className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1">纠偏找茬变式</div>
                                    <div className="text-sm text-foreground bg-card p-3 rounded-xl border border-amber-500/20 shadow-sm">
                                        {log.reviewData.quiz.quiz.content}
                                    </div>
                                </div>
                            )}

                            {log.reviewData.regression && (
                                <div>
                                    <div className="text-xs font-bold text-purple-700 dark:text-purple-400 mb-1">回归挑战变式</div>
                                    <div className="space-y-2">
                                        {log.reviewData.regression.challenges.map((c: any, ci: number) => (
                                            <div key={ci} className="text-sm text-foreground bg-card p-3 rounded-xl border border-purple-500/20 shadow-sm">
                                                {c.content}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
