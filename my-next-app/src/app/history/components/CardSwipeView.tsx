/* eslint-disable react-hooks/set-state-in-effect */
'use client';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { QuestionCard, QuestionLogData } from '@/components/history';

interface CardSwipeViewProps {
    questions: { log: QuestionLogData; index: number }[];
    initialIndex?: number;
    onIndexChange?: (index: number) => void;
}

export const CardSwipeView: React.FC<CardSwipeViewProps> = ({ 
    questions, 
    initialIndex = 0,
    onIndexChange 
}) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [direction, setDirection] = useState(0);

    // Sync with external index changes (e.g. from answer sheet)
    useEffect(() => {
        if (initialIndex !== currentIndex) {
            setDirection(initialIndex > currentIndex ? 1 : -1);
            setCurrentIndex(initialIndex);
        }
    }, [initialIndex, currentIndex]);

    const paginate = (newDirection: number) => {
        const nextIndex = currentIndex + newDirection;
        if (nextIndex >= 0 && nextIndex < questions.length) {
            setDirection(newDirection);
            setCurrentIndex(nextIndex);
            onIndexChange?.(questions[nextIndex].index);
        }
    };

    if (questions.length === 0) return null;

    const currentItem = questions[currentIndex];

    const variants = {
        enter: (direction: number) => ({
            x: direction > 0 ? 300 : -300,
            opacity: 0,
            scale: 0.9
        }),
        center: {
            zIndex: 1,
            x: 0,
            opacity: 1,
            scale: 1
        },
        exit: (direction: number) => ({
            zIndex: 0,
            x: direction < 0 ? 300 : -300,
            opacity: 0,
            scale: 0.9
        })
    };

    return (
        <div className="relative w-full flex flex-col items-center py-4 px-4 overflow-hidden min-h-[500px]">
            {/* Progress Label */}
            <div className="mb-4 text-xs font-black uppercase tracking-widest opacity-40">
                第 {currentIndex + 1} 题 / 共 {questions.length} 题
            </div>

            <div className="relative w-full max-w-2xl flex items-center justify-center">
                <AnimatePresence initial={false} custom={direction} mode="wait">
                    <motion.div
                        key={currentIndex}
                        custom={direction}
                        variants={variants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{
                            x: { type: "spring", stiffness: 300, damping: 30 },
                            opacity: { duration: 0.2 }
                        }}
                        drag="x"
                        dragConstraints={{ left: 0, right: 0 }}
                        dragElastic={0.6}
                        onDragEnd={(_, info) => {
                            const swipe = info.offset.x;
                            const swipeThreshold = 50;
                            if (swipe < -swipeThreshold) {
                                paginate(1);
                            } else if (swipe > swipeThreshold) {
                                paginate(-1);
                            }
                        }}
                        className="w-full cursor-grab active:cursor-grabbing"
                    >
                        <QuestionCard
                            log={currentItem.log as unknown}
                            index={currentItem.index}
                            isExpanded={true} // Always expanded in card mode for focus
                            onToggle={() => {}} // No toggle needed in card mode
                        />
                    </motion.div>
                </AnimatePresence>

                {/* Desktop Nav Arrows (Shadowed on mobile but useful) */}
                <div className="absolute left-[-60px] top-1/2 -translate-y-1/2 hidden lg:block">
                    <button
                        onClick={() => paginate(-1)}
                        disabled={currentIndex === 0}
                        className="p-3 rounded-full bg-card border border-border hover:bg-muted transition-colors disabled:opacity-20"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                </div>
                <div className="absolute right-[-60px] top-1/2 -translate-y-1/2 hidden lg:block">
                    <button
                        onClick={() => paginate(1)}
                        disabled={currentIndex === questions.length - 1}
                        className="p-3 rounded-full bg-card border border-border hover:bg-muted transition-colors disabled:opacity-20"
                    >
                        <ChevronRight className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* Mobile Navigation Hints */}
            <div className="mt-8 flex items-center gap-10 text-muted-foreground/30 sm:hidden">
                <div className="flex flex-col items-center gap-1">
                    <div className="w-8 h-1 bg-current rounded-full opacity-20" />
                    <span className="text-[10px] font-bold">左滑下一题</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                    <div className="w-8 h-1 bg-current rounded-full opacity-20" />
                    <span className="text-[10px] font-bold">右滑上一题</span>
                </div>
            </div>
        </div>
    );
};
