"use client";

import React from 'react';
import { BrainCircuit } from 'lucide-react';

interface ReviewData {
    quiz?: {
        quiz: {
            content: string;
        };
    };
    regression?: {
        challenges: {
            content: string;
        }[];
    };
}

interface AIReviewSectionProps {
    reviewDataRaw?: unknown;
}

export function AIReviewSection({ reviewDataRaw }: AIReviewSectionProps) {
    if (!reviewDataRaw) return null;

    const reviewData = reviewDataRaw as ReviewData;

    return (
        <div className="p-5 bg-amber-500/5 border-t border-amber-500/20">
            <div className="flex items-center gap-2 mb-3 text-amber-700 dark:text-amber-300 font-bold text-sm">
                <BrainCircuit className="h-4 w-4" />
                AI 复盘档案
            </div>

            {reviewData.quiz && (
                <div className="mb-4">
                    <div className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1">纠偏找茬变式</div>
                    <div className="text-sm text-foreground bg-card p-3 rounded-xl border border-amber-500/20 shadow-sm">
                        {reviewData.quiz.quiz.content}
                    </div>
                </div>
            )}

            {reviewData.regression && (
                <div>
                    <div className="text-xs font-bold text-purple-700 dark:text-purple-400 mb-1">回归挑战变式</div>
                    <div className="space-y-2">
                        {reviewData.regression.challenges.map((c, ci: number) => (
                            <div key={ci} className="text-sm text-foreground bg-card p-3 rounded-xl border border-purple-500/20 shadow-sm">
                                {c.content}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}