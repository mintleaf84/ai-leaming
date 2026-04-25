"use client";

import React, { Suspense } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AlertTriangle, Loader2 } from 'lucide-react';

// Imported Components
import { HeaderProgressBar } from '@/components/practice/HeaderProgressBar';
import { ExitConfirmModal } from '@/components/practice/ExitConfirmModal';
import { FinishedCard } from '@/components/practice/FinishedCard';
import { PracticeCard } from '@/components/practice/PracticeCard';
import { ReviewCard } from '@/components/practice/ReviewCard';

// Controller Hook
import { usePracticeController } from './hooks/use-practice-controller';

function PracticeContent({ enableIntelligentReview }: { enableIntelligentReview: boolean }) {
    const {
        state,
        isLoadingAI,
        showExitConfirm,
        selectedOptions,
        timerConfig,
        actions
    } = usePracticeController(enableIntelligentReview);

    if (state.status === 'loading') return (
        <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-4">
            <Loader2 className="animate-spin h-8 w-8 text-primary" />
            正在初始化练习会话...
        </div>
    );

    const currentQuestion = state.sessionQueue[state.currentIndex];

    return (
        <ErrorBoundary>
            <div className="min-h-[calc(100vh-64px)] bg-background pb-20">
                <HeaderProgressBar
                    status={state.status}
                    currentIndex={state.currentIndex}
                    totalCount={state.sessionQueue.length}
                    onExit={actions.handleExit}
                    timerEnabled={timerConfig.enabled}
                    timerMode={timerConfig.mode}
                    timerSeconds={timerConfig.secondsPerQuestion}
                    currentQuestionId={state.sessionQueue[state.currentIndex]?.id}
                    accumulatedTime={state.accumulatedTime}
                    startTime={state.startTime}
                />

                <div className="p-4 md:p-8 max-w-2xl mx-auto">
                    {enableIntelligentReview && state.reviewQueue.length > 0 && state.status === 'practicing' && (
                        <div className="mb-6 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-3 text-amber-600 dark:text-amber-400 text-sm">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span>您有 {state.reviewQueue.length} 个知识点待复盘，将在第 {state.reviewTriggeredAt} 题或结束时自动触发。</span>
                        </div>
                    )}

                    <AnimatePresence mode="wait">
                        {state.status === 'practicing' && currentQuestion && (
                            <PracticeCard
                                question={currentQuestion}
                                isMulti={currentQuestion.type === 'multi'}
                                selectedOptions={selectedOptions}
                                onOptionClick={actions.handleOptionClick}
                                onSubmitMulti={actions.submitMultiChoice}
                            />
                        )}

                        {enableIntelligentReview && state.status === 'reviewing' && (
                            <ReviewCard
                                currentItem={state.reviewQueue[state.currentReviewIndex]}
                                sessionQueue={state.sessionQueue}
                                isLoadingAI={isLoadingAI}
                                onReviewStep={actions.handleReviewStep}
                            />
                        )}

                        {state.status === 'finished' && (
                            <FinishedCard
                                sessionId={state.sessionId}
                                onDashboardClick={() => window.location.href = '/'}
                            />
                        )}
                    </AnimatePresence>
                </div>

                <ExitConfirmModal
                    isOpen={showExitConfirm}
                    onCancel={actions.cancelExit}
                    onConfirm={actions.confirmExit}
                />
            </div>
        </ErrorBoundary>
    );
}

export default function PracticeClient({ initialEnableIntelligentReview }: { initialEnableIntelligentReview: boolean }) {
    return (
        <Suspense fallback={
            <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-4">
                <Loader2 className="animate-spin h-8 w-8 text-primary" />
                正在加载练习环境...
            </div>
        }>
            <PracticeContent enableIntelligentReview={initialEnableIntelligentReview} />
        </Suspense>
    );
}
