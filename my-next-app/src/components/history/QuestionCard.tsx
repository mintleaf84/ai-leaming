"use client";

import React, { useState } from 'react';
import { CheckCircle2, XCircle, BookOpen, ChevronDown, ChevronUp, BrainCircuit, Lightbulb, Loader2, Sparkles, RefreshCw } from 'lucide-react';
import { formatDuration, indexToLetter } from '@/lib/utils/utils';
import { AnnotatableText } from './AnnotatableText';
import ReactMarkdown from 'react-markdown';
import { generateMnemonicAction } from '@/server/actions/ai-mnemonic';
import { toast } from 'sonner';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

export interface QuestionLogData {
    questionId?: number;           // 题目 ID (用于标注持久化)
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
    aiMnemonic?: string | null;        // AI 助记
    material?: string | null;          // 材料内容（纯文本）
    materialHtml?: string | null;      // 材料内容（HTML）
}

interface QuestionCardProps {
    log: QuestionLogData;
    index: number;
    isExpanded: boolean;
    onToggle: () => void;
    refCallback?: (el: HTMLDivElement | null) => void;
}

/**
 * 解析答案字符串（兼容单选和多选）
 * 单选: "B" -> ["B"]
 * 多选 JSON: '["A","B"]' -> ["A", "B"]
 * 多选逗号分隔: "A,B,C" -> ["A", "B", "C"]
 */
export function parseAnswer(answer: string): string[] {
    if (!answer) return [];
    const trimmed = answer.trim();

    // 1. JSON 数组格式 '["A","B"]'
    if (trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed);
            return Array.isArray(parsed) ? parsed : [answer];
        } catch {
            return [answer];
        }
    }

    // 2. 逗号分隔格式 'A,B,C' (多选题/不定项选择题)
    if (trimmed.includes(',')) {
        return trimmed.split(',').map(s => s.trim());
    }

    // 3. 单选题 / 判断题：单个值
    return [answer];
}

/**
 * 单个题目卡片组件
 * 包含：题目内容、选项、统计栏、解析区域、AI复盘
 */
export function QuestionCard({ log, index, isExpanded, onToggle, refCallback }: QuestionCardProps) {
    // 第一性原理分析状态
    const [fpAnalysis, setFpAnalysis] = useState<string | null>(null);
    const [isLoadingFP, setIsLoadingFP] = useState(false);

    // AI 助记状态 (初始值来自服务端，如果为空则允许手动生成)
    const [mnemonic, setMnemonic] = useState<string | null>(log.aiMnemonic || null);
    const [isGeneratingMnemonic, setIsGeneratingMnemonic] = useState(false);

    // 生成 AI 助记
    const handleGenerateMnemonic = async (force: boolean = false) => {
        if ((!force && mnemonic) || isGeneratingMnemonic || !log.questionId) return;

        setIsGeneratingMnemonic(true);
        try {
            const result = await generateMnemonicAction(String(log.questionId), force);
            if (result.success && result.content) {
                setMnemonic(result.content);
                if (!result.cached) {
                    toast.success(force ? '重新生成成功！' : '记忆口诀生成成功！');
                }
            } else {
                toast.error(result.message || '生成失败');
            }
        } catch (error) {
            console.error('助记生成失败:', error);
            toast.error('请求出错，请稍后重试');
        } finally {
            setIsGeneratingMnemonic(false);
        }
    };

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

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || '分析失败');
            }

            const data = await response.json();
            setFpAnalysis(data.analysis);
        } catch (error: any) {
            console.error('第一性原理分析失败:', error);
            toast.error(error.message || '分析失败，请稍后重试');
        } finally {
            setIsLoadingFP(false);
        }
    };

    const hasMaterial = !!log.materialHtml;

    return (
        <div
            ref={refCallback}
            className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden scroll-mt-24 md:scroll-mt-20"
        >
            <div className={`flex flex-col md:flex-row ${hasMaterial ? 'md:h-[600px]' : ''}`}>

                {/* 左侧：材料区域 (仅当有材料时显示) */}
                {hasMaterial && (
                    <div className="md:w-1/2 p-5 border-b md:border-b-0 md:border-r border-border bg-muted/10 overflow-auto scrollbar-thin">
                        <div className="sticky top-0 z-10 mb-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                材料
                            </span>
                        </div>
                        <div
                            className="prose prose-sm dark:prose-invert max-w-none text-foreground leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: log.materialHtml || '' }}
                        />
                    </div>
                )}

                {/* 右侧：题目与交互区域 (如果有材料，宽度为 1/2，否则占满) */}
                <div className={`flex flex-col ${hasMaterial ? 'md:w-1/2 md:h-full md:overflow-auto scrollbar-thin' : 'w-full'}`}>
                    {/* 题目头部 */}
                    <div className={`p-5 flex-1 ${log.isCorrect ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-red-500'}`}>
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
                                {/* 题干内容 */}
                                <div
                                    className="font-medium text-foreground leading-relaxed"
                                    dangerouslySetInnerHTML={{ __html: log.questionContent }}
                                />

                                {/* 选项列表 */}
                                {log.options.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                        {log.options.map((opt, oi) => {
                                            const letter = indexToLetter(oi);
                                            const correctAnswers = parseAnswer(log.correctAnswer);
                                            const userAnswers = parseAnswer(log.userAnswer);
                                            const isCorrectOption = correctAnswers.includes(letter);
                                            const isUserChoice = userAnswers.includes(letter);

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
                        <div className="mt-6 pt-4 border-t border-border">
                            <div className="grid grid-cols-3 md:grid-cols-5 gap-3 text-center">
                                <div>
                                    <div className="text-lg font-bold text-green-600">
                                        {parseAnswer(log.correctAnswer).join(', ') || '-'}
                                    </div>
                                    <div className="text-xs text-muted-foreground">正确答案</div>
                                </div>
                                <div>
                                    <div className={`text-lg font-bold ${log.isCorrect ? 'text-green-600' : 'text-red-500'}`}>
                                        {parseAnswer(log.userAnswer).join(', ') || '未作答'}
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
                            className="mt-4 w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors py-2 border border-border/50 rounded-lg hover:bg-muted/50"
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
                                    <div className="bg-card p-4 rounded-xl border border-amber-500/20 shadow-sm">
                                        {log.questionId ? (
                                            <AnnotatableText
                                                text={fpAnalysis}
                                                questionId={-log.questionId}
                                                className="text-sm text-foreground"
                                            />
                                        ) : (
                                            <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                                                {fpAnalysis}
                                            </div>
                                        )}
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
                                    {log.questionId ? (
                                        <AnnotatableText
                                            text={log.explanation}
                                            questionId={log.questionId}
                                            className="text-sm text-foreground"
                                        />
                                    ) : (
                                        <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                                            {log.explanation}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* AI 助记大师 */}
                            <div className="p-5 bg-purple-500/5 border-t border-purple-500/10">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400 font-bold text-sm">
                                        <Sparkles className="h-4 w-4" />
                                        AI 记忆大师
                                    </div>
                                    {!mnemonic && log.questionId && (
                                        <button
                                            onClick={() => handleGenerateMnemonic(false)}
                                            disabled={isGeneratingMnemonic}
                                            className="px-3 py-1.5 text-xs font-medium bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-400 rounded-full border border-purple-500/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                        >
                                            {isGeneratingMnemonic ? (
                                                <>
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                    生成中...
                                                </>
                                            ) : (
                                                '生成记忆口诀'
                                            )}
                                        </button>
                                    )}

                                    {mnemonic && log.questionId && (
                                        <button
                                            onClick={() => handleGenerateMnemonic(true)}
                                            disabled={isGeneratingMnemonic}
                                            className="p-1.5 text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 transition-colors disabled:opacity-50"
                                            title="重新生成"
                                        >
                                            <RefreshCw className={`h-4 w-4 ${isGeneratingMnemonic ? 'animate-spin' : ''}`} />
                                        </button>
                                    )}
                                </div>

                                {mnemonic ? (
                                    <div className="prose prose-sm dark:prose-invert max-w-none bg-card p-4 rounded-xl border border-purple-500/20 shadow-sm">
                                        <ReactMarkdown>{mnemonic}</ReactMarkdown>
                                    </div>
                                ) : (
                                    <div className="text-xs text-muted-foreground">
                                        遇到难记的知识点？点击按钮，AI 为你生成趣味口诀和脑洞联想。
                                    </div>
                                )}
                            </div>

                            {/* 考点和来源 */}
                            <div className="p-5 bg-muted/30 space-y-3">
                                {log.tags.length > 0 && (
                                    <div>
                                        <div className="text-xs font-bold text-muted-foreground mb-2">考点</div>
                                        <div className="flex flex-wrap gap-2">
                                            {log.tags.map((tag, i) => {
                                                const parts = tag.split('/');
                                                const leaf = parts[parts.length - 1];
                                                const fullPath = parts.join(' > ');

                                                return (
                                                    <TooltipProvider key={i}>
                                                        <Tooltip delayDuration={300}>
                                                            <TooltipTrigger asChild>
                                                                <span className="px-3 py-1 bg-primary/10 text-primary text-sm font-medium rounded-full cursor-help hover:bg-primary/20 transition-colors">
                                                                    {leaf}
                                                                </span>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p className="text-xs">{fullPath}</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                );
                                            })}
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
            </div>
        </div>
    );
}
