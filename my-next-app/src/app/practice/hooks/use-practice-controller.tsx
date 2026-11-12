"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw, FileText, Target } from "lucide-react";
import { usePracticeEngine } from "../../../hooks/use-practice-engine";
import { useReviewGeneration } from "./use-review-generation";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";
import {
  getPracticeSessionAction,
  getPracticeSessionByConfigAction,
  submitAnswerAction,
  getSessionByIdAction,
} from "@/server/actions/practice";
import { moveToObservationZoneAction } from "@/server/actions/zone";
import { PRACTICE_MODE_LABELS, PracticeMode } from "@/types";
import { safeParseJson } from "@/lib/utils/json";

export function usePracticeController(
  enableIntelligentReview: boolean = false,
) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, dispatch } = usePracticeEngine(enableIntelligentReview);

  // Extracted AI Generation Logic
  const { isLoadingAI } = useReviewGeneration(state, dispatch);

  const isHandlingRef = useRef(false);
  // 服务端保存失败时，本地判分已经推进，用户会误以为已保存；
  // 用 Set 保证同一题只提示一次（连点 / 重试不重复弹）。
  const notifiedSaveFailureIdsRef = useRef<Set<number>>(new Set());
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("smart");
  // 计时器配置
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [timerMode, setTimerMode] = useState<"count_up" | "count_down">(
    "count_up",
  );

  // Init Session
  useEffect(() => {
    const init = async () => {
      try {
        // 优先检查是否有 sessionId 参数（用于错题本等已创建会话的场景）
        const sessionIdParam = searchParams.get("sessionId");
        if (sessionIdParam) {
          const res = await getSessionByIdAction(sessionIdParam);
          const session = res?.data;
          if (session && session.questions.length > 0) {
            setPracticeMode((session.practiceMode as PracticeMode) || "review");
            dispatch({
              type: "INIT_SESSION",
              payload: {
                questions: session.questions,
                sessionId: session.sessionId,
                startIndex: session.completedCount,
              },
            });

            if (session.completedCount > 0) {
              toast.info(
                `已恢复练习进度 (${session.completedCount}/${session.questions.length})`,
                {
                  duration: 3000,
                  icon: <RotateCcw className="w-4 h-4" />,
                },
              );
            } else {
              toast.success(
                `错题强化模式已启动，共 ${session.questions.length} 题`,
                {
                  duration: 3000,
                  icon: <FileText className="w-4 h-4" />,
                },
              );
            }
            return; // 提前退出，不走常规创建流程
          } else {
            toast.error("会话已过期或不存在");
            router.push("/wrong-book");
            return;
          }
        }

        // 检查是否有配置参数
        const mode = searchParams.get("mode") as PracticeMode | null;
        const limit = searchParams.get("limit");
        const forceNew = searchParams.get("new") === "true";
        const noReview = searchParams.get("noReview") === "1";
        const enableTimer = searchParams.get("timer") === "1";

        let result;
        if (mode && limit) {
          // 使用配置化选题
          const config = {
            mode,
            limit: parseInt(limit) || 25,
            types: searchParams.get("types")?.split(",") as
              ("single" | "multi" | "truefalse" | "fill_blank")[] | undefined,
            tags: searchParams.get("tags")?.split(",").filter(Boolean),
            dimensions: searchParams.get("dimensions")?.split(",") as
              import("@/types").Dimension[] | undefined,
            enableReview: !noReview,
            enableTimer,
          };

          const res = await getPracticeSessionByConfigAction(config);
          result = res?.data;
          setPracticeMode(mode);

          // 设置计时器
          if (enableTimer) {
            setTimerEnabled(true);
            // 考试模式使用正计时（记录总耗时），其他模式也用正计时
            setTimerMode("count_up");
          }

          // 显示模式提示
          const modeLabel = PRACTICE_MODE_LABELS[mode] || mode;
          toast.success(
            `${modeLabel}模式已启动，共 ${result?.questions.length || 0} 题`,
            {
              duration: 3000,
              icon: <Target className="w-4 h-4" />,
            },
          );
        } else {
          // 传统选题（兼容旧入口）
          const res = await getPracticeSessionAction(forceNew);
          result = res?.data;
        }

        if (!result) {
          toast.error("初始化练习失败，未获取到题目数据");
          return;
        }

        const { questions, sessionId } = result;
        const resumed =
          "resumed" in result
            ? ((result as unknown as { resumed?: boolean }).resumed ?? false)
            : false;
        const completedCount =
          "completedCount" in result
            ? ((result as unknown as { completedCount?: number })
                .completedCount ?? 0)
            : 0;

        if (questions.length > 0) {
          dispatch({
            type: "INIT_SESSION",
            payload: {
              questions,
              sessionId,
              startIndex: resumed ? completedCount : 0,
            },
          });

          if (resumed) {
            toast.info(
              `欢迎回来！已为您恢复之前的练习进度 (${completedCount}/${questions.length})`,
              {
                duration: 4000,
                icon: <RotateCcw className="w-4 h-4" />,
              },
            );
          }
        } else {
          toast.error("暂无题目可练，请先上传题库或调整设置");
          setTimeout(() => router.push("/practice/setup"), 2000);
        }
      } catch (error) {
        console.error("Failed to init session:", error);
        toast.error("初始化练习失败，请刷新重试");
        return;
      }
    };
    init();
  }, [dispatch, router, searchParams]);

  // Exit confirmation logic
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (state.status !== "finished") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [state.status]);

  const handleExit = () => {
    if (state.status === "finished") {
      router.push("/");
    } else {
      setShowExitConfirm(true);
    }
  };

  const confirmExit = () => {
    router.push("/");
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
      if (!currentQuestion) {
        console.error("Current question not found:", state.currentIndex);
        toast.error("题目加载失败，请刷新重试");
        return;
      }
      // Basic check
      // 增强的比对逻辑：支持标号(A/B/C)与文本的双向匹配
      const checkCorrect = (
        userAns: string,
        targetAns: string,
        options: string[],
      ) => {
        if (userAns === targetAns) return true;

        // 如果用户提交的是标号 (A, B, C...)
        if (userAns.length === 1 && userAns >= "A" && userAns <= "Z") {
          const idx = userAns.charCodeAt(0) - 65;
          if (options[idx] === targetAns) return true;
        }

        // 如果正确答案是标号 (A, B, C...)
        if (targetAns.length === 1 && targetAns >= "A" && targetAns <= "Z") {
          const idx = targetAns.charCodeAt(0) - 65;
          if (options[idx] === userAns) return true;
        }

        return false;
      };

      let isCorrect = false;
      if (currentQuestion.type === "fill_blank") {
        // 填空题：按中文分号分割，逐空匹配（支持单空多答案用 | 分隔）
        const userBlanks = answer.split("；").map((s) => s.trim());
        const correctBlanks = currentQuestion.answer
          .split("；")
          .map((s) => s.trim());
        isCorrect =
          userBlanks.length === correctBlanks.length &&
          userBlanks.every((ub, i) => {
            if (!ub) return false; // 拒绝空白用户输入
            const acceptedAnswers = correctBlanks[i]
              .split("|")
              .map((s) => s.trim())
              .filter(Boolean);
            return acceptedAnswers.some((ans) => ans === ub);
          });
      } else if (currentQuestion.type === "multi") {
        const parseAnswer = (val: string): string[] => {
          // 答案既可能是 JSON 数组（新格式），也可能是逗号分隔串（历史数据）
          const parsed = safeParseJson<unknown>(val, null);
          return Array.isArray(parsed)
            ? (parsed as string[])
            : val.split(",").map((s) => s.trim());
        };
        const correctArr = parseAnswer(currentQuestion.answer).sort();
        const answerArr = parseAnswer(answer).sort();

        if (correctArr.length === answerArr.length) {
          isCorrect = answerArr.every((v, i) =>
            checkCorrect(v, correctArr[i], currentQuestion.options),
          );
        }
      } else {
        isCorrect = checkCorrect(
          answer,
          currentQuestion.answer,
          currentQuestion.options,
        );
      }

      const duration = Date.now() - (state.startTime || Date.now());
      const totalDuration = state.accumulatedTime + duration;

      dispatch({
        type: "ANSWER_QUESTION",
        payload: {
          questionId: currentQuestion.id,
          answer,
          isCorrect,
          duration,
        },
      });

      // Async save
      //
      // 本地已经 dispatch 了判分与进度，这里不能阻塞答题；但"没存上"必须让用户知道。
      // 三种失败都要覆盖：① reject；② 正常返回但 `serverError` / `success:false`
      // （safe-action 的失败不抛异常）；③ 请求一直挂起（不 resolve 也不 reject）。
      const questionId = currentQuestion.id;
      const notifySaveFailure = (reason: unknown) => {
        console.error("[practice] 作答记录保存失败", {
          err: reason,
          questionId,
        });
        if (notifiedSaveFailureIdsRef.current.has(questionId)) return;
        notifiedSaveFailureIdsRef.current.add(questionId);
        toast.error("作答记录保存失败，请检查网络后重试");
      };

      let settled = false;
      const SAVE_TIMEOUT_MS = 15_000;
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        notifySaveFailure(new Error("保存请求超时（15s 未返回）"));
      }, SAVE_TIMEOUT_MS);

      submitAnswerAction({
        questionId,
        userAnswer: answer,
        isCorrect,
        duration,
        sessionId: state.sessionId || undefined,
        totalDurationMs: totalDuration,
      })
        .then((res) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);

          // safe-action 的失败不一定抛异常：serverError / success:false 都要当失败处理
          if (res?.serverError) {
            notifySaveFailure(res.serverError);
            return;
          }
          if (!res?.data?.success) {
            notifySaveFailure("服务端未确认保存");
            return;
          }

          if (res.data.srs) {
            const srs = res.data.srs;
            toast.success(isCorrect ? "回答正确！" : "回答错误", {
              description: `下次复习: ${srs.nextInterval} 天后 (稳定性: ${srs.stability.toFixed(1)}d)`,
              duration: 2000,
              position: "top-center",
            });
          }
        })
        .catch((err: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          notifySaveFailure(err);
        });
    } catch (e) {
      console.error("Submit answer error:", e);
      toast.error("提交答案失败，请重试");
      return;
    } finally {
      setTimeout(() => {
        isHandlingRef.current = false;
      }, 500);
    }
  };

  const handleOptionClick = (option: string, mode: "single" | "multi") => {
    if (mode === "single") {
      submitAnswer(option);
    } else {
      setSelectedOptions((prev) => {
        if (prev.includes(option)) return prev.filter((o) => o !== option);
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
      if (
        currentItem.currentStep === "regression" &&
        currentItem.regressionSubIndex === 2
      ) {
        toast.success("复盘通过，该知识点已攻克！");
      } else if (currentItem.currentStep !== "regression") {
        toast.success("回答正确，进入下一阶段");
      }
      dispatch({ type: "COMPLETE_REVIEW_STEP", payload: { success: true } });
    } else {
      if (currentItem.failedAttempts >= 2) {
        toast.error(
          "多次尝试失败，该知识点已列入【长期观察区】，请课后查阅教材。",
          { duration: 5000 },
        );
        if (currentItem.tags.length > 0) {
          moveToObservationZoneAction(
            currentItem.tags[0],
            "复盘熔断：连续 3 次尝试失败",
          ).catch(console.error);
        }
      } else {
        toast.error("复盘未通过，请仔细研读解析后重试。");
      }
      dispatch({ type: "COMPLETE_REVIEW_STEP", payload: { success: false } });
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
      submitAnswer,
      handleReviewStep,
      dispatch,
    },
  };
}
