'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { APPLE_SPRING } from '@/lib/configs/motion-config';
import dynamic from 'next/dynamic';

const MarkdownViewer = dynamic(() => import('@/components/chat/MarkdownViewer'), {
    ssr: false,
    loading: () => <div className="h-40 animate-pulse bg-muted rounded-xl" />
});

interface AnalysisSectionProps {
    isAnalyzing: boolean;
    analysisReport: string | null;
    showAnalysis: boolean;
    onAnalyze: () => void;
}

export const AnalysisSection: React.FC<AnalysisSectionProps> = ({
    isAnalyzing,
    analysisReport,
    showAnalysis,
    onAnalyze
}) => {
    return (
        <div className="space-y-6">
            <Button
                onClick={onAnalyze}
                disabled={isAnalyzing}
                className="w-full h-16 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 hover:opacity-90 transition-all text-lg font-black rounded-2xl shadow-xl shadow-purple-500/20 group"
            >
                {isAnalyzing ? (
                    <Loader2 className="animate-spin mr-2" />
                ) : (
                    <Sparkles className="mr-2 group-hover:animate-pulse" />
                )}
                {analysisReport 
                    ? (showAnalysis ? '收起 AI 深度分析' : '查看 AI 深度分析') 
                    : '生成 AI 深度分析报告'}
            </Button>

            <AnimatePresence>
                {showAnalysis && (
                    <motion.div
                        initial={{ height: 0, opacity: 0, scale: 0.98 }}
                        animate={{ height: 'auto', opacity: 1, scale: 1 }}
                        exit={{ height: 0, opacity: 0, scale: 0.98 }}
                        transition={APPLE_SPRING.default}
                        className="overflow-hidden"
                    >
                        <div className="p-8 bg-muted/30 rounded-[2rem] border border-purple-500/10 prose dark:prose-invert max-w-none shadow-inner">
                            <MarkdownViewer content={analysisReport || '正在调取大模型分析数据...'} />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
