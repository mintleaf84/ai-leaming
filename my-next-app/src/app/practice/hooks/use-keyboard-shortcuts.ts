import { useEffect } from 'react';

interface Question {
    type: 'single' | 'multi' | 'boolean';
    options?: string[];
}

interface PracticeState {
    status: 'loading' | 'practicing' | 'reviewing' | 'finished';
    currentIndex: number;
    sessionQueue: Question[];
}

export function useKeyboardShortcuts(
    state: PracticeState,
    submitAnswer: (answer: string) => void
) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (state.status !== 'practicing') return;
            const currentQ = state.sessionQueue[state.currentIndex];
            if (currentQ?.type === 'multi') return;

            const key = e.key;
            const index = parseInt(key) - 1;
            if (index >= 0 && index < (currentQ?.options?.length || 0)) {
                submitAnswer(String.fromCharCode(65 + index));
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [state.status, state.currentIndex, state.sessionQueue, submitAnswer]);
}
