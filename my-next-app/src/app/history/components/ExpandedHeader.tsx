'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { X, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SessionDetail } from '@/server/actions/history';
import { MODE_CONFIG } from './HistoryCardItem';
import { SessionSummary } from '@/components/history';

interface ExpandedHeaderProps {
    sessionId: string;
    detail: SessionDetail | null;
    initialData: {
        practiceMode?: string;
        sessionName?: string;
        accuracy?: number;
    };
    isLoading: boolean;
    onClose: () => void;
}

export const ExpandedHeader: React.FC<ExpandedHeaderProps> = ({
    sessionId,
    detail,
    initialData,
    isLoading,
    onClose
}) => {
    const practiceMode = detail?.session.practiceMode || initialData.practiceMode;
    const sessionName = detail?.session.sessionName || initialData.sessionName;
    const accuracy = detail?.session.accuracy ?? initialData.accuracy;

    return (
        <div className="p-8 md:p-12 bg-muted/20 border-b border-border/40 relative">
            <motion.button 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={onClose}
                className="absolute right-6 top-6 md:right-10 md:top-10 p-3 rounded-full bg-background/80 hover:bg-background shadow-sm transition-colors z-20"
            >
                <X className="w-6 h-6" />
            </motion.button>

            {/* Mode Tag for Continuity */}
            {/* 子元素使用 CSS 动画，避免逐个弹入导致 layout 抖动 */}
            {practiceMode && (
                <div
                    className={cn(
                        "inline-flex px-3 py-1 rounded-lg text-[10px] font-black uppercase border items-center gap-1.5 mb-4 animate-fade-in",
                        MODE_CONFIG[practiceMode!].className
                    )}
                    style={{ animationDelay: '100ms', animationFillMode: 'backwards' }}
                >
                    {MODE_CONFIG[practiceMode!].icon}
                    {MODE_CONFIG[practiceMode!].label}
                </div>
            )}

            <h3 
                className="text-3xl md:text-5xl font-black text-foreground font-serif mb-6 pr-12 leading-tight animate-fade-in"
                style={{ animationDelay: '150ms', animationFillMode: 'backwards' }}
            >
                {sessionName || "练习详情"}
            </h3>

            <div 
                className="flex items-center gap-4 mb-6 animate-fade-in"
                style={{ animationDelay: '200ms', animationFillMode: 'backwards' }}
            >
                <div className="flex items-center gap-3 px-5 py-2.5 bg-background/80 rounded-2xl border border-border shadow-sm">
                    <Target className="w-5 h-5 text-primary" />
                    <span className="text-xs font-black uppercase tracking-widest opacity-50">正确率</span>
                    <span className="text-2xl font-black text-primary">
                        {accuracy}%
                    </span>
                </div>
            </div>
            
            {!isLoading && detail && (
                <div
                    className="animate-fade-in"
                    style={{ animationDelay: '250ms', animationFillMode: 'backwards' }}
                >
                    <SessionSummary
                        createdAt={detail.session.createdAt}
                        totalQuestions={detail.session.totalQuestions}
                        accuracy={detail.session.accuracy}
                        reviewCount={detail.session.reviewCount}
                    />
                </div>
            )}
        </div>
    );
};
