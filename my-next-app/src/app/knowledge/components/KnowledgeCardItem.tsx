'use client';

import React from 'react';
import { Tag, _Edit2, CheckCircle2, Maximize2 } from 'lucide-react';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { APPLE_SPRING } from '@/lib/configs/motion-config';

const MarkdownViewer = dynamic(() => import('@/components/chat/MarkdownViewer'), {
    ssr: false,
    loading: () => <div className="h-10 animate-pulse bg-muted rounded-md" />
});
import type { KnowledgeCard } from '@/lib/services/knowledge';

interface KnowledgeCardItemProps {
    card: KnowledgeCard;
    onExpand: (card: KnowledgeCard) => void;
    onEdit: (card: KnowledgeCard) => void;
    categoryColor: { bg: string; text: string };
}

export const KnowledgeCardItem: React.FC<KnowledgeCardItemProps> = ({
    card,
    onExpand,
    _onEdit,
    categoryColor
}) => {
    return (
        <motion.div
            layoutId={`card-container-${card.id}`}
            transition={APPLE_SPRING.default}
            onClick={() => onExpand(card)}
            whileHover={{ scale: 1.01, y: -4 }}
            whileTap={{ scale: 0.98 }}
            className="group relative w-full h-[320px] bg-card rounded-3xl border border-border shadow-md hover:shadow-xl cursor-pointer overflow-hidden flex flex-col"
        >
            {/* Header */}
            <div className="px-6 py-5 bg-muted/30 border-b border-border flex items-start justify-between">
                <div className="flex-1 min-w-0 pr-8">
                    <motion.h3 
                        layoutId={`card-title-${card.id}`}
                        className="font-bold text-foreground text-xl leading-snug line-clamp-2"
                    >
                        {card.title}
                    </motion.h3>
                    {card.category && (
                        <motion.div layoutId={`card-cat-${card.id}`} className="mt-3">
                            <span className={`inline-flex items-center gap-1.5 text-[10px] ${categoryColor.text} bg-muted/80 px-3 py-1 rounded-full font-black uppercase tracking-wider`}>
                                <Tag className="w-3" />
                                {card.category}
                            </span>
                        </motion.div>
                    )}
                </div>
                <div className="p-2 bg-primary/5 rounded-full text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    <Maximize2 className="w-4 h-4" />
                </div>
            </div>

            {/* Preview Content */}
            <div className="flex-1 p-6 overflow-hidden relative">
                <div className="prose prose-slate dark:prose-invert prose-p:text-sm line-clamp-4 mask-fade-bottom">
                    <MarkdownViewer content={card.front || card.title} />
                </div>
                
                {/* Bottom Stats/Hint */}
                <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between opacity-40 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">点击开始复习</span>
                    </div>
                </div>
            </div>

            <style jsx>{`
                .mask-fade-bottom {
                    mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
                }
            `}</style>
        </motion.div>
    );
};
