'use client';

import { useState, useEffect, useCallback } from 'react';
import type { KnowledgeCard } from '@/lib/services/knowledge';

export function useStudyMode(cards: KnowledgeCard[]) {
    const [studyMode, setStudyMode] = useState(false);
    const [studyIndex, setStudyIndex] = useState(0);
    const [studyFlipped, setStudyFlipped] = useState(false);

    const startStudy = useCallback(() => {
        if (cards.length === 0) return;
        setStudyIndex(0);
        setStudyFlipped(false);
        setStudyMode(true);
    }, [cards.length]);

    const exitStudy = useCallback(() => {
        setStudyMode(false);
    }, []);

    const nextCard = useCallback(() => {
        if (studyIndex < cards.length - 1) {
            setStudyIndex(prev => prev + 1);
            setStudyFlipped(false);
        }
    }, [studyIndex, cards.length]);

    const prevCard = useCallback(() => {
        if (studyIndex > 0) {
            setStudyIndex(prev => prev - 1);
            setStudyFlipped(false);
        }
    }, [studyIndex]);

    const toggleStudyFlip = useCallback(() => {
        setStudyFlipped(prev => !prev);
    }, []);

    useEffect(() => {
        if (!studyMode) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                e.preventDefault();
                toggleStudyFlip();
            } else if (e.code === 'ArrowLeft') {
                prevCard();
            } else if (e.code === 'ArrowRight') {
                nextCard();
            } else if (e.code === 'Escape') {
                exitStudy();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [studyMode, studyIndex, cards.length, toggleStudyFlip, prevCard, nextCard, exitStudy]);

    return {
        studyMode,
        studyIndex,
        studyFlipped,
        setStudyFlipped,
        setStudyIndex,
        startStudy,
        exitStudy,
        nextCard,
        prevCard,
        toggleStudyFlip
    };
}
