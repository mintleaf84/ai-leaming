"use client";

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { usePracticeEngine } from '../../../hooks/use-practice-engine';
import { useReviewGeneration } from './use-review-generation';
import { useKeyboardShortcuts } from './use-keyboard-shortcuts';
import { Question, PracticeState } from '@/types';
import { getPracticeSessionAction, getPracticeSessionByConfigAction, submitAnswerAction, getSessionByIdAction } from '@/server/actions/practice';
import { moveToObservationZoneAction } from '@/server/actions/zone';
import { PRACTICE_MODE_LABELS, PracticeMode } from '@/lib/practice/practice-types';

export function usePracticeController(enableIntelligentReview: boolean = false) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { state, dispatch } = usePracticeEngine(enableIntelligentReview);

    // Extracted AI Generation Logic
    const { isLoadingAI } = useReviewGeneration(state, dispatch);

    const isHandlingRef = useRef(false);
    const [showExitConfirm, setShowExitConfirm] = useState(false);
    const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
    const [practiceMode, setPracticeMode] = useState<PracticeMode>('smart');
    // 计时器配置
    const [timerEnabled, setTimerEnabled] = useState(false);
    const [timerMode, setTimerMode] = useState<'count_up' | 'count_down'>('count_up');

    // Init Session
    useEffect(() => {
        const init = async () => {
            try {
                // 优先检查是否有 sessionId 参数（用于错题本等已创建会话的场景）
                const sessionIdParam = searchParams.get('sessionId');
                if (sessionIdParam) {
                    const session = await getSessionByIdAction(sessionIdParam);
                    if (session && session.questions.length > 0) {
                        setPracticeMode((session.practiceMode as PracticeMode) || 'review');
                        dispatch({
                            type: 'INIT_SESSION',
                            payload: {
                                questions: session.questions,
                                sessionId: session.sessionId,
                                startIndex: session.completedCount
                            }
                        });

                        if (session.completedCount > 0) {
                            toast.info(`已恢复练习进度 (${session.completedCount}/${session.questions.length})`, {
                                duration: 3000,
                                icon: '🔄'
                            });
                        } else {
                            toast.success(`错题强化模式已启动，共 ${session.questions.length} 题`, {
                                duration: 3000,
                                icon: '📝'
                            });
                        }
                        return; // 提前退出，不走常规创建流程
                    } else {
                        toast.error('会话已过期或不存在');
                        router.push('/wrong-book');
                        return;
                    }
                }

                // 检查是否有配置参数
                const mode = searchParams.get('mode') as PracticeMode | null;
                const limit = searchParams.get('limit');
                const forceNew = searchParams.get('new') === 'true';
                const noReview = searchParams.get('noReview') === '1';
                const enableTimer = searchParams.get('timer') === '1';

                let result;
                if (mode && limit) {
                    // 使用配置化选题
                    const config = {
                        mode,
                        limit: parseInt(limit) || 25,
                        types: searchParams.get('types')?.split(',') as ('single' | 'multi' | 'truefalse')[] | undefined,
                        tags: searchParams.get('tags')?.split(',').filter(Boolean),
                        dimensions: searchParams.get('dimensions')?.split(',') as import('@/types').Dimension[] | undefined,
                        enableReview: !noReview,
                        enableTimer
                    };

                    result = await getPracticeSessionByConfigAction(config);
                    setPracticeMode(mode);

                    // 设置计时器
                    if (enableTimer) {
                        setTimerEnabled(true);
                        // 考试模式使用正计时（记录总耗时），其他模式也用正计时
                        setTimerMode('count_up');
                    }

                    // 显示模式提示
                    const modeLabel = PRACTICE_MODE_LABELS[mode] || mode;
                    toast.success(`${modeLabel}模式已启动，共 ${result.questions.length} 题`, {
                        duration: 3000,
                        icon: '🎯'
                    });
                } else {
                    // 传统选题（兼容旧入口）
                    result = await getPracticeSessionAction(forceNew);
                }

                const { questions, sessionId } = result;
                const resumed = 'resumed' in result ? (result as any).resumed : false;
                const completedCount = 'completedCount' in result ? (result as any).completedCount : 0;

                if (questions.length > 0) {
                    dispatch({
                        type: 'INIT_SESSION',
                        payload: {
                            questions,
                            sessionId,
                            startIndex: resumed ? completedCount : 0
                        }
                    });

                    if (resumed) {
                        toast.info(`欢迎回来！已为您恢复之前的练习进度 (${completedCount}/${questions.length})`, {
                            duration: 4000,
                            icon: '🔄'
                        });
                    }
                } else {
                    toast.error("暂无题目可练，请先上传题库或调整设置");
                    setTimeout(() => router.push('/practice/setup'), 2000);
                }
            } catch (error) {
                console.error("Failed to init session:", error);
                toast.error("初始化练习失败，请刷新重试");
            }
        };
        init();
    }, [dispatch, router, searchParams]);

    // Exit confirmation logic
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (state.status !== 'finished') {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [state.status]);

    const handleExit = () => {
        if (state.status === 'finished') {
            router.push('/');
        } else {
            setShowExitConfirm(true);
        }
    };

    const confirmExit = () => {
        router.push('/');
    };

    const cancelExit = () => {
        setShowExitConfirm(false);
    };

    // Answer Handling
    const submitAnswer = async (answer: string) => {
        if (isHandlingRef.current) return;
        isHandlingRef.current = true;

        try {
            const currentQuestion = state.sessionQueue[state.currentIndex];
            // Basic check
            // 增强的比对逻辑：支持标号(A/B/C)与文本的双向匹配
            const checkCorrect = (userAns: string, targetAns: string, options: string[]) => {
                if (userAns === targetAns) return true;

                // 如果用户提交的是标号 (A, B, C...)
                if (userAns.length === 1 && userAns >= 'A' && userAns <= 'Z') {
                    const idx = userAns.charCodeAt(0) - 65;
                    if (options[idx] === targetAns) return true;
                }

                // 如果正确答案是标号 (A, B, C...)
                if (targetAns.length === 1 && targetAns >= 'A' && targetAns <= 'Z') {
                    const idx = targetAns.charCodeAt(0) - 65;
                    if (options[idx] === userAns) return true;
                }

                return false;
            };

            let isCorrect = false;
            if (currentQuestion.type === 'multi') {
                const parseAnswer = (val: string): string[] => {
                    try { return JSON.parse(val); } catch { return val.split(',').map(s => s.trim()); }
                };
                const correctArr = parseAnswer(currentQuestion.answer).sort();
                const answerArr = parseAnswer(answer).sort();

                if (correctArr.length === answerArr.length) {
                    isCorrect = answerArr.every((v, i) => checkCorrect(v, correctArr[i], currentQuestion.options));
                }
            } else {
                isCorrect = checkCorrect(answer, currentQuestion.answer, currentQuestion.options);
            }

            const duration = Math.floor((Date.now() - (state.startTime || Date.now())) / 1000);

            dispatch({
                type: 'ANSWER_QUESTION',
                payload: {
                    questionId: currentQuestion.id,
                    answer,
                    isCorrect,
                    duration
                }
            });

            // Async save
            submitAnswerAction(currentQuestion.id, answer, isCorrect, duration, state.sessionId || undefined).catch(console.error);
        } catch (e) {
            console.error("Submit answer error:", e);
        } finally {
            setTimeout(() => {
                isHandlingRef.current = false;
            }, 500);
        }
    };

    const handleOptionClick = (option: string, mode: 'single' | 'multi') => {
        if (mode === 'single') {
            submitAnswer(option);
        } else {
            setSelectedOptions(prev => {
                if (prev.includes(option)) return prev.filter(o => o !== option);
                return [...prev, option];
            });
        }
    };

    const submitMultiChoice = () => {
        if (selectedOptions.length === 0) {
            toast.warning("请至少选择一个选项");
            return;
        }
        const sorted = [...selectedOptions].sort();
        submitAnswer(JSON.stringify(sorted));
        setSelectedOptions([]);
    };

    // Review Handling
    const handleReviewStep = async (success: boolean) => {
        const currentItem = state.reviewQueue[state.currentReviewIndex];

        if (success) {
            if (currentItem.currentStep === 'regression' && currentItem.regressionSubIndex === 2) {
                toast.success("复盘通过，该知识点已攻克！");
            } else if (currentItem.currentStep !== 'regression') {
                toast.success("回答正确，进入下一阶段");
            }
            dispatch({ type: 'COMPLETE_REVIEW_STEP', payload: { success: true } });
        } else {
            if (currentItem.failedAttempts >= 2) {
                toast.error("多次尝试失败，该知识点已列入【长期观察区】，请课后查阅教材。", { duration: 5000 });
                if (currentItem.tags.length > 0) {
                    moveToObservationZoneAction(currentItem.tags[0], "复盘熔断：连续 3 次尝试失败").catch(console.error);
                }
            } else {
                toast.error("复盘未通过，请仔细研读解析后重试。");
            }
            dispatch({ type: 'COMPLETE_REVIEW_STEP', payload: { success: false } });
        }
    };

    // Keyboard Shortcuts
    useKeyboardShortcuts(state, submitAnswer);

    return {
        state,
        isLoadingAI,
        showExitConfirm,
        selectedOptions,
        practiceMode,
        // 计时器配置
        timerConfig: {
            enabled: timerEnabled,
            mode: timerMode,
            // 每题倒计时秒数（如果使用倒计时模式）
            secondsPerQuestion: 90,
        },
        actions: {
            handleExit,
            confirmExit,
            cancelExit,
            handleOptionClick,
            submitMultiChoice,
            handleReviewStep,
            dispatch
        }
    };
}
