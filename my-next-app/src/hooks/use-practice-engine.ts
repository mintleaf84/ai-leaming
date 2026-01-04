import { useReducer, useEffect, useCallback } from 'react';
import { PracticeState, Action, Question, ReviewItem } from '../lib/types';
import { apiClient } from '../lib/api-client';

const INITIAL_STATE: PracticeState = {
  status: 'loading',
  sessionId: null,
  sessionQueue: [],
  currentIndex: 0,
  startTime: Date.now(),
  answers: {},
  reviewQueue: [],
  currentReviewIndex: 0,
  reviewTriggeredAt: 25, // Hardcoded per PRD
};

function practiceReducer(state: PracticeState, action: Action): PracticeState {
  switch (action.type) {
    case 'INIT_SESSION':
      return {
        ...INITIAL_STATE,
        status: 'practicing',
        sessionId: action.payload.sessionId,
        sessionQueue: action.payload.questions,
        currentIndex: action.payload.startIndex || 0,
        startTime: Date.now(),
      };

    case 'ANSWER_QUESTION': {
      const { questionId, answer, isCorrect, duration } = action.payload;
      const newAnswers = { ...state.answers, [questionId]: { answer, isCorrect, duration } };
      
      // Check for Review Trigger
      const questionsAnswered = Object.keys(newAnswers).length;
      
      // If wrong, add to temp review queue (conceptually). 
      // In this reducer, we just track state. We assume the queue is built when Trigger happens or incrementally.
      // Let's build reviewQueue incrementally to allow "Risk First" sort later.
      let updatedReviewQueue = state.reviewQueue;
      if (!isCorrect) {
        const q = state.sessionQueue.find(q => q.id === questionId);
        if (q) {
            const newItem: ReviewItem = {
                originalQuestionId: q.id,
                originalQuestionContent: q.content,
                wrongAnswer: answer,
                tags: q.tags,
                currentStep: 'study',
                regressionSubIndex: 0,
                failedAttempts: 0
            };
            updatedReviewQueue = [...updatedReviewQueue, newItem];
        }
      }

      // Transition Logic
      if (questionsAnswered >= state.reviewTriggeredAt && updatedReviewQueue.length > 0 && state.status === 'practicing') {
         // Sort Review Queue: Risk First (Placeholder logic)
         // In real app, we might sort by tag mastery score here.
         return {
             ...state,
             answers: newAnswers,
             reviewQueue: updatedReviewQueue,
             status: 'reviewing',
             currentReviewIndex: 0,
             startTime: Date.now(), // Reset timer for review
         };
      }

      // Normal Progression
      if (state.currentIndex < state.sessionQueue.length - 1) {
        return {
          ...state,
          answers: newAnswers,
          reviewQueue: updatedReviewQueue,
          currentIndex: state.currentIndex + 1,
          startTime: Date.now(), // Reset timer for next question
        };
      } else {
        // End of Queue
        if (updatedReviewQueue.length > 0) {
             return {
                 ...state,
                 answers: newAnswers,
                 reviewQueue: updatedReviewQueue,
                 status: 'reviewing',
                 currentReviewIndex: 0
             };
        }
        return {
            ...state,
            answers: newAnswers,
            status: 'finished'
        };
      }
    }

    case 'TRIGGER_REVIEW':
      return {
        ...state,
        status: 'reviewing',
        currentReviewIndex: 0,
      };

    case 'LOAD_REVIEW_DATA': {
        const queue = [...state.reviewQueue];
        if (queue[action.payload.index]) {
            queue[action.payload.index] = { ...queue[action.payload.index], ...action.payload.data };
        }
        return { ...state, reviewQueue: queue };
    }

    case 'COMPLETE_REVIEW_STEP': {
        const queue = [...state.reviewQueue];
        const currentItem = { ...queue[state.currentReviewIndex] };
        
        if (!currentItem) return state;

        if (action.payload.success) {
            // Advance Step
            if (currentItem.currentStep === 'study') {
                currentItem.currentStep = 'quiz';
            } else if (currentItem.currentStep === 'quiz') {
                currentItem.currentStep = 'regression';
                currentItem.regressionSubIndex = 0;
            } else if (currentItem.currentStep === 'regression') {
                // Advance Sub-index for regression (Total 3 questions per PRD)
                if (currentItem.regressionSubIndex < 2) {
                    currentItem.regressionSubIndex += 1;
                } else {
                    // Done with all 3 regression questions
                    const nextState = practiceReducer(state, { type: 'NEXT_REVIEW_ITEM' });
                    return nextState;
                }
            }
        } else {
            // Failed Step
            currentItem.failedAttempts += 1;
            if (currentItem.failedAttempts >= 3) {
                const nextState = practiceReducer(state, { type: 'NEXT_REVIEW_ITEM' });
                return nextState;
            }
        }
        
        queue[state.currentReviewIndex] = currentItem;
        return { ...state, reviewQueue: queue };
    }

    case 'NEXT_REVIEW_ITEM': {
        const nextIndex = state.currentReviewIndex + 1;
        if (nextIndex < state.reviewQueue.length) {
            return { ...state, currentReviewIndex: nextIndex };
        } else {
            return { type: 'RESUME_PRACTICE' } as any; // Hack to trigger self-call or just return state
            // Better:
            return practiceReducer(state, { type: 'RESUME_PRACTICE' });
        }
    }

    case 'RESUME_PRACTICE':
        if (state.currentIndex >= state.sessionQueue.length - 1) {
            return { ...state, status: 'finished' };
        }
        return {
            ...state,
            status: 'practicing',
            // "If all correct, extend to 35". 
            // If we are resuming, we clear the active review queue because we processed them.
            reviewQueue: [], 
            // PRD says "25题后若出现错题即触发复盘". 
            // If we handled them, we continue.
            reviewTriggeredAt: 35 // Bump trigger to end
        };

    case 'FINISH_SESSION':
        return { ...state, status: 'finished' };

    default:
        return state;
  }
}

export function usePracticeEngine() {
  const [state, dispatch] = useReducer(practiceReducer, INITIAL_STATE);

  // Initialize (Mock)
  useEffect(() => {
    // In real app, fetch from API
    // dispatch({ type: 'INIT_SESSION', payload: [] });
  }, []);

  return { state, dispatch };
}
