import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, BookOpen, Target, ShieldCheck, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FeedbackDialog } from './FeedbackDialog';

import { Question, ReviewItem } from '@/types';

interface ReviewCardProps {
    currentItem: ReviewItem;
    sessionQueue: Question[];
    isLoadingAI: boolean;
    onReviewStep: (success: boolean) => void;
}


export function ReviewCard({ currentItem, sessionQueue, isLoadingAI, onReviewStep }: ReviewCardProps) {
    if (!currentItem) return null;

    const steps = [
        { id: 'study', label: '解析研读', icon: BookOpen },
        { id: 'quiz', label: '纠偏找茬', icon: Target },
        { id: 'regression', label: '回归挑战', icon: ShieldCheck },
    ];

    const currentStepIndex = steps.findIndex(s => s.id === currentItem.currentStep);

    return (
        <motion.div
            key="reviewing"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="border border-amber-500/20 p-6 rounded-2xl shadow-lg bg-card relative overflow-hidden"
        >
            {/* 装饰性背景 */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full -mr-16 -mt-16 pointer-events-none" />

            <div className="relative z-10">
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                        <div className="w-2 h-6 bg-amber-500 rounded-full" />
                        智能复盘模式
                    </h2>
                    <div className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                        AI 深度个性化生成
                    </div>
                </div>

                {/* Progress Stepper */}
                <div className="flex items-center justify-between mb-10 relative">
                    {/* 连接线 */}
                    <div className="absolute top-5 left-0 w-full h-0.5 bg-muted -z-10" />
                    <div
                        className="absolute top-5 left-0 h-0.5 bg-amber-500 -z-10 transition-all duration-500"
                        style={{ width: `${(currentStepIndex / (steps.length - 1)) * 100}%` }}
                    />

                    {steps.map((step, idx) => {
                        const Icon = step.icon;
                        const isCompleted = idx < currentStepIndex;
                        const isActive = idx === currentStepIndex;

                        return (
                            <div key={step.id} className="flex flex-col items-center gap-2">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${isCompleted ? 'bg-amber-500 border-amber-500 text-white shadow-md' :
                                        isActive ? 'bg-card border-amber-500 text-amber-600 dark:text-amber-400 shadow-md ring-4 ring-amber-500/20' :
                                            'bg-card border-border text-muted-foreground'
                                    }`}>
                                    {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                                </div>
                                <span className={`text-xs font-bold transition-colors ${isActive ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                                    }`}>
                                    {step.label}
                                </span>
                            </div>
                        );
                    })}
                </div>

                <div className="mb-6">
                    <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                        <Database className="w-3.5 h-3.5" />
                        复盘原题: {currentItem.originalQuestionContent.length > 50 ? currentItem.originalQuestionContent.substring(0, 50) + '...' : currentItem.originalQuestionContent}
                    </p>
                </div>

                <div className="bg-muted/30 rounded-2xl p-4 md:p-6 mb-6 min-h-[200px] border border-border">
                    {isLoadingAI ? (
                        <div className="flex items-center justify-center h-full text-muted-foreground animate-pulse py-12">
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-8 h-8 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin" />
                                <p>AI 正在生成专属复盘内容...</p>
                            </div>
                        </div>
                    ) : (
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={currentItem.currentStep}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                            >
                                {currentItem.currentStep === 'study' && (
                                    <div className="space-y-6">
                                        {/* 突出展示原题题干 */}
                                        <div className="bg-zinc-800 text-white p-5 rounded-lg shadow-inner relative overflow-hidden">
                                            <div className="absolute top-0 right-0 p-2 opacity-10">
                                                <Database className="w-12 h-12" />
                                            </div>
                                            <h4 className="text-[10px] font-bold text-zinc-400 mb-2 uppercase tracking-[0.2em]">错题回顾 / Original Question</h4>
                                            <p className="text-lg font-medium leading-relaxed">
                                                {currentItem.originalQuestionContent}
                                            </p>
                                        </div>

                                        <div className="bg-card p-5 rounded-xl border border-border shadow-sm">
                                            <h4 className="text-xs font-bold text-muted-foreground mb-4 uppercase tracking-wider flex items-center">
                                                <div className="w-1 h-3 bg-blue-500 mr-2 rounded-full"></div>
                                                思维纠偏 (Diff Analysis)
                                            </h4>

                                            {(() => {
                                                const q = sessionQueue.find(sq => sq.id === currentItem.originalQuestionId);
                                                if (!q) return null;
                                                const userAnsRaw = currentItem.wrongAnswer;
                                                const correctAnsRaw = q.answer;
                                                const isMulti = q.type === 'multi';
                                                const isFillBlank = q.type === 'fill_blank';

                                                // 解析答案显示逻辑 (通用版本)
                                                const getAnswerDisplay = (raw: string) => {
                                                    // 填空题：直接显示文本
                                                    if (isFillBlank) {
                                                        const blanks = raw.split('；').map(s => s.trim());
                                                        return {
                                                            label: blanks.map((_, i) => `空${i + 1}`).join(' + '),
                                                            content: blanks.join('；')
                                                        };
                                                    }
                                                    try {
                                                        const arr = isMulti ? JSON.parse(raw) : [raw];
                                                        const labels: string[] = [];
                                                        const contents: string[] = [];

                                                        arr.forEach((val: string) => {
                                                            if (val.length === 1 && val >= 'A' && val <= 'Z') {
                                                                const idx = val.charCodeAt(0) - 65;
                                                                if (q.options[idx]) {
                                                                    labels.push(val);
                                                                    contents.push(q.options[idx]);
                                                                    return;
                                                                }
                                                            }
                                                            const idx = q.options.indexOf(val);
                                                            if (idx !== -1) {
                                                                labels.push(String.fromCharCode(65 + idx));
                                                                contents.push(val);
                                                            } else {
                                                                labels.push('?');
                                                                contents.push(val);
                                                            }
                                                        });

                                                        return {
                                                            label: labels.join(isMulti ? ' + ' : ''),
                                                            content: contents.join(isMulti ? '; ' : '')
                                                        };
                                                    } catch (_e) {
                                                        return { label: raw, content: raw };
                                                    }
                                                };

                                                const userAns = getAnswerDisplay(userAnsRaw);
                                                const correctAns = getAnswerDisplay(correctAnsRaw);

                                                return (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        {/* 用户错误项 */}
                                                        <div className="relative p-4 rounded-lg bg-red-500/10 border-2 border-red-500/20">
                                                            <div className="absolute -top-3 left-4 px-2 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded-full uppercase tracking-wider">
                                                                您的选择
                                                            </div>
                                                            <div className="flex items-start gap-3 mt-2">
                                                                <div className="w-8 h-8 rounded-full bg-red-500/20 text-red-700 dark:text-red-400 flex items-center justify-center font-bold text-sm shrink-0">
                                                                    {userAns.label}
                                                                </div>
                                                                <div className="text-sm text-red-700 dark:text-red-300 leading-relaxed opacity-80 line-through decoration-red-300">
                                                                    {userAns.content}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* 正确答案项 */}
                                                        <div className="relative p-4 rounded-lg bg-green-500/10 border-2 border-green-500/20">
                                                            <div className="absolute -top-3 left-4 px-2 py-0.5 bg-green-100 text-green-600 text-[10px] font-bold rounded-full uppercase tracking-wider">
                                                                正确答案
                                                            </div>
                                                            <div className="flex items-start gap-3 mt-2">
                                                                <div className="w-8 h-8 rounded-full bg-green-500/20 text-green-700 dark:text-green-400 flex items-center justify-center font-bold text-sm shrink-0">
                                                                    {correctAns.label}
                                                                </div>
                                                                <div className="text-sm text-green-700 dark:text-green-300 leading-relaxed font-medium">
                                                                    {correctAns.content}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        <h3 className="font-semibold text-muted-foreground text-lg border-b border-border pb-2">深度解析</h3>
                                        <div className="text-sm text-muted-foreground leading-relaxed bg-muted/50 p-4 rounded border-l-4 border-blue-400">
                                            {(() => {
                                                const q = sessionQueue.find(sq => sq.id === currentItem.originalQuestionId);
                                                return q?.explanation || "暂无详细解析，请结合教材理解。";
                                            })()}
                                        </div>

                                        <div className="mt-2 flex items-center justify-between">
                                            <div className="flex gap-1">
                                                {currentItem.tags.map(tag => (
                                                    <span key={tag} className="px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs rounded">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <FeedbackDialog questionId={currentItem.originalQuestionId} />
                                                <span className="text-[10px] text-muted-foreground/50">ID: {currentItem.originalQuestionId}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {currentItem.currentStep === 'quiz' && currentItem.quiz && (
                                    <div>
                                        <h3 className="font-bold text-lg mb-2 text-foreground">纠偏找茬题</h3>
                                        <div className="text-sm bg-blue-500/10 p-3 rounded mb-4 border border-blue-500/20">
                                            <strong className="text-blue-600 dark:text-blue-400">AI 分析：</strong> {currentItem.quiz?.analysis}
                                        </div>
                                        <p className="font-medium mb-4 text-foreground">{currentItem.quiz?.quiz.content}</p>
                                        <div className="grid grid-cols-1 gap-2">
                                            {currentItem.quiz?.quiz.options.map((opt, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => {
                                                        const isCorrect = opt === currentItem.quiz?.quiz.answer;
                                                        onReviewStep(isCorrect);
                                                    }}
                                                    className="w-full text-left p-3 rounded border border-border hover:bg-blue-500/10 hover:border-blue-500/30 transition-colors"
                                                >
                                                    {opt}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {currentItem.currentStep === 'regression' && currentItem.regression && (
                                    <div>
                                        <h3 className="font-bold text-lg mb-2 text-purple-700 dark:text-purple-400">
                                            回归挑战 ({currentItem.regressionSubIndex + 1}/3)
                                        </h3>
                                        <p className="text-sm text-muted-foreground mb-2">挑战类型: {
                                            currentItem.regression?.logicType === 'reverse' ? '逆向逻辑' :
                                                currentItem.regression?.logicType === 'complement' ? '补集测试' : '边界压力'
                                        }</p>
                                        {(() => {
                                            const subIndex = currentItem.regressionSubIndex;
                                            const challenge = currentItem.regression?.challenges[subIndex];
                                            if (!challenge) return null;

                                            return (
                                                <>
                                                    <p className="font-medium mb-4 text-foreground">{challenge.content}</p>
                                                    <div className="grid grid-cols-1 gap-2">
                                                        {challenge.options.map((opt, i) => (
                                                            <button
                                                                key={i}
                                                                onClick={() => {
                                                                    const isCorrect = opt === challenge.answer;
                                                                    onReviewStep(isCorrect);
                                                                }}
                                                                className="w-full text-left p-3 rounded border border-border hover:bg-purple-500/10 hover:border-purple-500/30 transition-colors"
                                                            >
                                                                {opt}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </>
                                            );
                                        })()}
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    )}
                </div>

                {currentItem.currentStep === 'study' && (
                    <div className="flex gap-4">
                        <Button className="flex-1" onClick={() => onReviewStep(true)} disabled={isLoadingAI}>我已掌握，开始测试</Button>
                        <Button variant="outline" className="flex-1" onClick={() => onReviewStep(false)} disabled={isLoadingAI}>没看懂，再试一次</Button>
                    </div>
                )}
            </div>
        </motion.div>
    );
}
