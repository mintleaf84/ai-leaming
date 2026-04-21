import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { generateCorrectionQuizAction, generateRegressionChallengeAction } from '@/server/actions/ai';

import { PracticeState, PracticeAction } from '@/types';

export function useReviewGeneration(state: PracticeState, dispatch: React.Dispatch<PracticeAction>) {
    const [isLoadingAI, setIsLoadingAI] = useState(false);
    const generationTracker = useRef<Set<string>>(new Set());

    useEffect(() => {
        const checkAndGenerate = async () => {
            if (state.status !== 'reviewing') return;
            const currentItem = state.reviewQueue[state.currentReviewIndex];
            if (!currentItem) return;

            // 1. Generate Correction Quiz
            const quizKey = `quiz-${currentItem.originalQuestionId}`;
            const needsQuiz = !currentItem.quiz;
            const shouldBlockForQuiz = currentItem.currentStep === 'quiz' && needsQuiz;

            // Trigger Generation if needed and not started
            if (needsQuiz && !generationTracker.current.has(quizKey)) {
                console.log("Triggering background generation for Quiz", quizKey);
                generationTracker.current.add(quizKey);

                // If we are already in quiz step, show loading. If in study, don't block.
                if (shouldBlockForQuiz) setIsLoadingAI(true);

                generateCorrectionQuizAction(
                    currentItem.originalQuestionContent,
                    currentItem.wrongAnswer,
                    state.sessionQueue.find(q => q.id === currentItem.originalQuestionId)?.answer || ""
                ).then(data => {
                    dispatch({
                        type: 'LOAD_REVIEW_DATA',
                        payload: { index: state.currentReviewIndex, data: { quiz: data } }
                    });
                }).catch(e => {
                    console.error("Quiz gen failed", e);
                    toast.error("AI 生成失败，将使用降级模式");
                }).finally(() => {
                    setIsLoadingAI(false);
                });
            } else if (shouldBlockForQuiz && !isLoadingAI) {
                // If we are in quiz step, missing data, but tracker passed (maybe racing?), force loading
                setIsLoadingAI(true);
            }

            // 2. Generate Regression Challenge
            const regressionKey = `regression-${currentItem.originalQuestionId}`;
            const needsRegression = !currentItem.regression;
            const shouldBlockForRegression = currentItem.currentStep === 'regression' && needsRegression;

            if (needsRegression && !generationTracker.current.has(regressionKey)) {
                // Ideally trigger when leaving study or entering quiz
                if (currentItem.currentStep === 'quiz' || currentItem.currentStep === 'regression') {
                    console.log("Triggering background generation for Regression", regressionKey);
                    generationTracker.current.add(regressionKey);

                    if (shouldBlockForRegression) setIsLoadingAI(true);

                    const q = state.sessionQueue.find(q => q.id === currentItem.originalQuestionId);
                    if (q) {
                        generateRegressionChallengeAction(q.content, currentItem.tags)
                            .then(data => {
                                dispatch({
                                    type: 'LOAD_REVIEW_DATA',
                                    payload: { index: state.currentReviewIndex, data: { regression: data } }
                                });
                            }).catch(e => {
                                console.error("Regression gen failed", e);
                            }).finally(() => {
                                setIsLoadingAI(false);
                            });
                    }
                }
            } else if (shouldBlockForRegression && !isLoadingAI) {
                setIsLoadingAI(true);
            }

            // Ensure loading is off if we have what we need for current step
            if (
                (currentItem.currentStep === 'study') || // Never block study
                (currentItem.currentStep === 'quiz' && currentItem.quiz) ||
                (currentItem.currentStep === 'regression' && currentItem.regression)
            ) {
                if (isLoadingAI) setIsLoadingAI(false);
            }
        };

        checkAndGenerate();
    }, [state.status, state.currentReviewIndex, state.reviewQueue, state.sessionQueue, isLoadingAI, dispatch]); // Intentionally kept isLoadingAI to check re-entry

    return { isLoadingAI };
}
