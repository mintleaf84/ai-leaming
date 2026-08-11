import type { PracticeState, ReviewItem } from "@/types";
import type { Question } from "@/types";

/** 记录一次作答，返回更新后的 answers 记录 */
export function recordAnswer(
  state: PracticeState,
  questionId: number,
  answer: string,
  isCorrect: boolean,
  duration: number,
): PracticeState["answers"] {
  return {
    ...state.answers,
    [questionId]: { answer, isCorrect, duration },
  };
}

/** 答错时把题目追加到复盘队列，答对或已存在则原样返回 */
export function appendToReviewQueue(
  state: PracticeState,
  questionId: number,
  answer: string,
): ReviewItem[] {
  if (
    state.reviewQueue.some((item) => item.originalQuestionId === questionId)
  ) {
    return state.reviewQueue;
  }
  const q = state.sessionQueue.find(
    (question: Question) => question.id === questionId,
  );
  if (!q) return state.reviewQueue;

  const newItem: ReviewItem = {
    originalQuestionId: q.id,
    originalQuestionContent: q.content,
    wrongAnswer: answer,
    tags: q.tags,
    currentStep: "study",
    regressionSubIndex: 0,
    failedAttempts: 0,
  };
  return [...state.reviewQueue, newItem];
}

/** 判断是否应进入复盘模式（达到触发阈值且有错题） */
export function shouldEnterReview(
  enableIntelligentReview: boolean,
  questionsAnswered: number,
  reviewTriggeredAt: number,
  reviewQueueLength: number,
  status: PracticeState["status"],
): boolean {
  return (
    enableIntelligentReview &&
    questionsAnswered >= reviewTriggeredAt &&
    reviewQueueLength > 0 &&
    status === "practicing"
  );
}
