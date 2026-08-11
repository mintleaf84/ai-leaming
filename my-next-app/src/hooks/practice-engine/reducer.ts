import type { PracticeAction, PracticeState, ReviewItem } from "@/types";
import type { Question } from "@/types";
import {
  appendToReviewQueue,
  recordAnswer,
  shouldEnterReview,
} from "./queue";
import { completeReviewItemStep } from "./review-flow";

export const INITIAL_STATE: PracticeState = {
  status: "loading",
  sessionId: null,
  sessionQueue: [],
  currentIndex: 0,
  startTime: Date.now(),
  sessionStartTime: Date.now(),
  accumulatedTime: 0,
  answers: {},
  reviewQueue: [],
  currentReviewIndex: 0,
  reviewTriggeredAt: 25, // Hardcoded per PRD
};

const NEXT_REVIEW_TRIGGER = 35;

export const createPracticeReducer =
  (enableIntelligentReview: boolean) =>
  (state: PracticeState, action: PracticeAction): PracticeState => {
    switch (action.type) {
      case "INIT_SESSION":
        return {
          ...INITIAL_STATE,
          status: "practicing",
          sessionId: action.payload.sessionId,
          sessionQueue: action.payload.questions,
          currentIndex: action.payload.startIndex || 0,
          startTime: Date.now(),
          sessionStartTime: Date.now(),
          accumulatedTime: 0,
        };

      case "ANSWER_QUESTION": {
        const { questionId, answer, isCorrect, duration } = action.payload;
        const newAnswers = recordAnswer(
          state,
          questionId,
          answer,
          isCorrect,
          duration,
        );
        const updatedReviewQueue = isCorrect
          ? state.reviewQueue
          : appendToReviewQueue(state, questionId, answer);
        const questionsAnswered = Object.keys(newAnswers).length;

        // 达到触发阈值且有错题，进入复盘模式
        if (
          shouldEnterReview(
            enableIntelligentReview,
            questionsAnswered,
            state.reviewTriggeredAt,
            updatedReviewQueue.length,
            state.status,
          )
        ) {
          return {
            ...state,
            answers: newAnswers,
            reviewQueue: updatedReviewQueue,
            accumulatedTime: state.accumulatedTime + duration,
            status: "reviewing",
            currentReviewIndex: 0,
            startTime: Date.now(), // Reset timer for review
          };
        }

        const accumulatedTime = state.accumulatedTime + duration;

        // 队列中还有题目，继续推进
        if (state.currentIndex < state.sessionQueue.length - 1) {
          return {
            ...state,
            answers: newAnswers,
            reviewQueue: updatedReviewQueue,
            accumulatedTime,
            currentIndex: state.currentIndex + 1,
            startTime: Date.now(), // Reset timer for next question
          };
        }

        // 队列末尾：有错题则进入复盘，否则结束
        if (enableIntelligentReview && updatedReviewQueue.length > 0) {
          return {
            ...state,
            answers: newAnswers,
            reviewQueue: updatedReviewQueue,
            accumulatedTime,
            status: "reviewing",
            currentReviewIndex: 0,
          };
        }
        return {
          ...state,
          answers: newAnswers,
          accumulatedTime,
          status: "finished",
        };
      }

      case "TRIGGER_REVIEW":
        return {
          ...state,
          status: "reviewing",
          currentReviewIndex: 0,
          reviewStartTime: Date.now(),
        };

      case "LOAD_REVIEW_DATA": {
        const queue = [...state.reviewQueue];
        if (queue[action.payload.index]) {
          queue[action.payload.index] = {
            ...queue[action.payload.index],
            ...action.payload.data,
          };
        }
        return { ...state, reviewQueue: queue };
      }

      case "COMPLETE_REVIEW_STEP": {
        const { queue, next } = completeReviewItemStep(
          state.reviewQueue,
          state.currentReviewIndex,
          action.payload.success,
        );
        if (next) {
          return createPracticeReducer(enableIntelligentReview)(state, {
            type: "NEXT_REVIEW_ITEM",
          });
        }
        return { ...state, reviewQueue: queue };
      }

      case "NEXT_REVIEW_ITEM": {
        const nextIndex = state.currentReviewIndex + 1;
        if (nextIndex < state.reviewQueue.length) {
          return { ...state, currentReviewIndex: nextIndex };
        }
        return createPracticeReducer(enableIntelligentReview)(state, {
          type: "RESUME_PRACTICE",
        });
      }

      case "RESUME_PRACTICE": {
        if (state.currentIndex >= state.sessionQueue.length - 1) {
          return { ...state, status: "finished" };
        }
        // 扣除复盘耗时，避免计入练习时间
        const reviewDuration = state.reviewStartTime
          ? Date.now() - state.reviewStartTime
          : 0;
        return {
          ...state,
          status: "practicing",
          reviewQueue: [],
          reviewTriggeredAt: NEXT_REVIEW_TRIGGER, // Bump trigger to end
          startTime: Date.now(), // CRITICAL: Reset timer when resuming from review
          accumulatedTime: state.accumulatedTime - reviewDuration, // 扣除复盘时间
          reviewStartTime: undefined, // 重置复盘开始时间
        };
      }

      case "FINISH_SESSION":
        return { ...state, status: "finished" };

      default:
        return state;
    }
  };
