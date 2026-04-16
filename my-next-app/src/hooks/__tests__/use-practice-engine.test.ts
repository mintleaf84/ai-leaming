// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createPracticeReducer, INITIAL_STATE } from '../use-practice-engine';
import { Action, PracticeState, Question } from '@/lib/types';

const practiceReducer = createPracticeReducer(true);

describe('usePracticeEngine Reducer', () => {

    const mockQuestions: Question[] = [
        { id: 1, content: 'Q1', type: 'single', options: [], answer: 'A', tags: ['T1'], dimension: 'knowledge' } as any,
        { id: 2, content: 'Q2', type: 'single', options: [], answer: 'B', tags: ['T1'], dimension: 'knowledge' } as any,
        // ... need enough questions to trigger review if testing 25th question trigger, 
        // but can mock state directly to test transition logic.
    ];

    it('should initialize session correctly', () => {
        const action: Action = {
            type: 'INIT_SESSION',
            payload: { sessionId: 'sess-1', questions: mockQuestions, startIndex: 0 }
        };
        const newState = practiceReducer(INITIAL_STATE, action);

        expect(newState.status).toBe('practicing');
        expect(newState.sessionId).toBe('sess-1');
        expect(newState.sessionQueue).toHaveLength(2);
        expect(newState.currentIndex).toBe(0);
    });

    it('should handle correct answer progression', () => {
        const startState: PracticeState = {
            ...INITIAL_STATE,
            status: 'practicing',
            sessionQueue: mockQuestions,
            currentIndex: 0
        };

        const action: Action = {
            type: 'ANSWER_QUESTION',
            payload: { questionId: 1, answer: 'A', isCorrect: true, duration: 1000 }
        };

        const newState = practiceReducer(startState, action);

        expect(newState.answers[1]).toEqual({ answer: 'A', isCorrect: true, duration: 1000 });
        expect(newState.currentIndex).toBe(1);
        expect(newState.reviewQueue).toHaveLength(0); // Correct answer shouldn't add to review
    });

    it('should add wrong answer to review queue (conceptually) but not trigger mode change early', () => {
        const startState: PracticeState = {
            ...INITIAL_STATE,
            status: 'practicing',
            sessionQueue: mockQuestions,
            currentIndex: 0,
            reviewTriggeredAt: 25
        };

        const action: Action = {
            type: 'ANSWER_QUESTION',
            payload: { questionId: 1, answer: 'wrong', isCorrect: false, duration: 1000 }
        };

        const newState = practiceReducer(startState, action);

        expect(newState.answers[1].isCorrect).toBe(false);
        expect(newState.reviewQueue).toHaveLength(1);
        expect(newState.reviewQueue[0].originalQuestionId).toBe(1);
        expect(newState.status).toBe('practicing'); // Still practicing
        expect(newState.currentIndex).toBe(1);
    });

    it('should trigger review mode when threshold reached with errors', () => {
        // Mock state where we are at question 24, about to answer 25th (index 24)
        // And we have existing items in reviewQueue
        const startState: PracticeState = {
            ...INITIAL_STATE,
            status: 'practicing',
            sessionQueue: Array(30).fill({}).map((_, i) => ({ id: i, content: `Q${i}` } as any)),
            currentIndex: 24,
            reviewTriggeredAt: 25,
            reviewQueue: [{ originalQuestionId: 1 } as any], // Assume 1 error existed
            answers: {} // Populate dummy answers count logic if needed
        };

        // We need 24 answers already. Logic: questionsAnswered >= state.reviewTriggeredAt
        // Let's mock answers having 24 entries
        const mockAnswers: any = {};
        for (let i = 0; i < 24; i++) mockAnswers[i] = { isCorrect: true };
        startState.answers = mockAnswers;

        const action: Action = {
            type: 'ANSWER_QUESTION',
            payload: { questionId: 24, answer: 'wrong', isCorrect: false, duration: 1000 }
        };

        const newState = practiceReducer(startState, action);

        expect(newState.status).toBe('reviewing');
        expect(newState.currentReviewIndex).toBe(0);
    });

    it('should transition review steps: study -> quiz -> regression', () => {
        const startState: PracticeState = {
            ...INITIAL_STATE,
            status: 'reviewing',
            reviewQueue: [{
                originalQuestionId: 1,
                currentStep: 'study',
                regressionSubIndex: 0,
                failedAttempts: 0
            } as any],
            sessionQueue: [{}, {}] as any, // 2 items so index 0 is not finished
            currentReviewIndex: 0
        };

        // 1. Study -> Quiz
        let state = practiceReducer(startState, { type: 'COMPLETE_REVIEW_STEP', payload: { success: true } });
        expect(state.reviewQueue[0].currentStep).toBe('quiz');

        // 2. Quiz -> Regression
        state = practiceReducer(state, { type: 'COMPLETE_REVIEW_STEP', payload: { success: true } });
        expect(state.reviewQueue[0].currentStep).toBe('regression');
        expect(state.reviewQueue[0].regressionSubIndex).toBe(0);

        // 3. Regression Step 1 -> Step 2
        state = practiceReducer(state, { type: 'COMPLETE_REVIEW_STEP', payload: { success: true } });
        expect(state.reviewQueue[0].regressionSubIndex).toBe(1);

        // 4. Regression Step 3 -> Finish Item
        state.reviewQueue[0].regressionSubIndex = 2; // Jump to last sub-step
        state = practiceReducer(state, { type: 'COMPLETE_REVIEW_STEP', payload: { success: true } });
        // Should move to next item. If no next item, might RESUME_PRACTICE logic (depends on reducer handling recursion/return)

        // The reducer logic for 'NEXT_REVIEW_ITEM' when finished calls RESUME_PRACTICE.
        // But since we are calling COMPLETE_REVIEW_STEP, it calls NEXT_REVIEW_ITEM internally.
        // Let's check status.
        expect(state.status).toBe('practicing'); // Should resume to practicing if no more items
        expect(state.reviewTriggeredAt).toBe(35); // Threshold bumped
    });
});
