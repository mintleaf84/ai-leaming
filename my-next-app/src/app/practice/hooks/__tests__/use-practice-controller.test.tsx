/** @vitest-environment jsdom */
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// --- vi.hoisted for stable references across mocks ---
const { mockDispatch, mockState, mockRouter } = vi.hoisted(() => ({
  mockDispatch: vi.fn(),
  mockRouter: { push: vi.fn() },
  mockState: {
    status: 'practicing',
    sessionQueue: [{ id: 1, type: 'single', content: 'Q1', answer: 'A', options: ['A', 'B'] }],
    currentIndex: 0,
    sessionId: 'session-123',
    answers: {},
    reviewQueue: [],
    currentReviewIndex: 0,
    startTime: Date.now(),
  }
}));

// 1. Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => ({ get: vi.fn().mockReturnValue(null) }),
}));

// 2. Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }
}));

// 3. Mock Server Actions
vi.mock('@/server/actions/practice', () => ({
  getPracticeSessionAction: vi.fn().mockResolvedValue({ questions: [], sessionId: null }),
  getPracticeSessionByConfigAction: vi.fn(),
  submitAnswerAction: vi.fn().mockResolvedValue({ success: true }),
  getSessionByIdAction: vi.fn(),
}));

vi.mock('@/server/actions/zone', () => ({
  moveToObservationZoneAction: vi.fn().mockResolvedValue({ success: true }),
}));

// 4. Mock Practice Engine - USE ALIAS TO MATCH SOURCE
vi.mock('@/hooks/use-practice-engine', () => ({
  usePracticeEngine: () => ({ state: mockState, dispatch: mockDispatch }),
}));

// 5. Mock sibling hooks
vi.mock('../use-review-generation', () => ({
  useReviewGeneration: () => ({ isLoadingAI: false })
}));
vi.mock('../use-keyboard-shortcuts', () => ({
  useKeyboardShortcuts: vi.fn()
}));

// --- Import the hook under test ---
import { usePracticeController } from '../use-practice-controller';

describe('usePracticeController', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should dispatch ANSWER_QUESTION with isCorrect: false for wrong answer', async () => {
        const { result } = renderHook(() => usePracticeController());

        act(() => {
            result.current.actions.handleOptionClick('B', 'single'); // Wrong answer (A is correct)
        });

        await waitFor(() => {
            expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({
                type: 'ANSWER_QUESTION',
                payload: expect.objectContaining({
                    isCorrect: false
                })
            }));
        });
    });

    it('should handle multiple choice clicks and submission', async () => {
        // Change mock state to a multi-choice question
        mockState.sessionQueue[0] = { 
            id: 2, 
            type: 'multi', 
            content: 'Q2', 
            answer: JSON.stringify(['A', 'B']), 
            options: ['Option A', 'Option B', 'Option C'] 
        };

        const { result } = renderHook(() => usePracticeController());

        act(() => {
            result.current.actions.handleOptionClick('Option A', 'multi');
            result.current.actions.handleOptionClick('Option B', 'multi');
        });

        expect(result.current.selectedOptions).toEqual(['Option A', 'Option B']);

        act(() => {
            result.current.actions.submitMultiChoice();
        });

        await waitFor(() => {
            expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({
                type: 'ANSWER_QUESTION',
                payload: expect.objectContaining({
                    // isCorrect logic should handle text -> label or JSON match
                    isCorrect: true
                })
            }));
        });
    });

    it('should handle exit confirmation', () => {
        const { result } = renderHook(() => usePracticeController());
        
        act(() => {
            result.current.actions.handleExit();
        });
        expect(result.current.showExitConfirm).toBe(true);

        act(() => {
            result.current.actions.confirmExit();
        });
        expect(mockRouter.push).toHaveBeenCalledWith('/');
    });
});
