import type { PracticeState, ReviewItem } from "@/types";

const MAX_FAILED_ATTEMPTS = 3;
const REGRESSION_QUESTION_COUNT = 3;

/**
 * 推进单个复盘项的步骤：study -> quiz -> regression(3 题)。
 * 步骤全部通过或连续失败 3 次后返回 null，表示应切换到下一项。
 */
export function advanceReviewStep(
  item: ReviewItem,
  success: boolean,
): { item: ReviewItem; done: boolean } {
  const next = { ...item };

  if (success) {
    if (next.currentStep === "study") {
      next.currentStep = "quiz";
    } else if (next.currentStep === "quiz") {
      next.currentStep = "regression";
      next.regressionSubIndex = 0;
    } else if (next.currentStep === "regression") {
      if (next.regressionSubIndex < REGRESSION_QUESTION_COUNT - 1) {
        next.regressionSubIndex += 1;
      } else {
        return { item: next, done: true };
      }
    }
  } else {
    next.failedAttempts += 1;
    if (next.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      return { item: next, done: true };
    }
  }

  return { item: next, done: false };
}

/** 完成当前复盘项的步骤，返回更新后的复盘队列与是否需切换到下一项 */
export function completeReviewItemStep(
  queue: ReviewItem[],
  index: number,
  success: boolean,
): { queue: ReviewItem[]; next: boolean } {
  const current = queue[index];
  if (!current) return { queue, next: false };

  const { item, done } = advanceReviewStep(current, success);
  const updated = [...queue];
  updated[index] = item;
  return { queue: updated, next: done };
}
