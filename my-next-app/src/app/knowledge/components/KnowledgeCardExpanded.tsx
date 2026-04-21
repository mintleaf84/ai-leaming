'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, CheckCircle2, RotateCw } from 'lucide-react';
import { APPLE_SPRING } from '@/lib/configs/motion-config';
import { getCategoryColor } from '@/lib/utils/category-colors';
import MarkdownViewer from '@/components/chat/MarkdownViewer';

interface KnowledgeCardExpandedProps {
    card: unknown;
    onClose: () => void;
}

export const KnowledgeCardExpanded: React.FC<KnowledgeCardExpandedProps> = ({ card, onClose }) => {
    const [isFlipped, setIsFlipped] = useState(false);
    
    // 强制同步关闭前的翻转状态以确保平滑退场
    const handleClose = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        onClose();
    };

    if (!card) return null;

    return (
        <>
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleClose}
                className="fixed inset-0 bg-background/80 backdrop-blur-xl z-[150]"
            />
            
            {/* Expanded Card Container */}
            <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 md:p-12 h-[100dvh] pointer-events-none">
                <motion.div
                    layoutId={`card-container-${card.id}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={APPLE_SPRING.soft}
                    style={{ perspective: '2000px', transformStyle: 'preserve-3d' }}
                    className="w-full max-w-4xl h-[70vh] md:h-[80vh] pointer-events-auto relative will-change-transform"
                >
                    <motion.div
                        animate={{ rotateY: isFlipped ? 180 : 0 }}
                        transition={APPLE_SPRING.default}
                        style={{ transformStyle: 'preserve-3d', width: '100%', height: '100%' }}
                        className="relative"
                        onClick={() => setIsFlipped(!isFlipped)}
                    >
                        {/* FRONT SIDE (Layout Mirror of KnowledgeCardItem) */}
                        <div 
                            className="absolute inset-0 backface-hidden bg-card rounded-[3rem] border border-border shadow-2xl overflow-hidden flex flex-col"
                            style={{ backfaceVisibility: 'hidden' }}
                        >
                            {/* Header Structure Mirroring Item */}
                            <div className="px-10 py-8 bg-muted/30 border-b border-border relative flex items-start justify-between">
                                <div className="flex-1 min-w-0 pr-12">
                                    <motion.h3 
                                        layoutId={`card-title-${card.id}`} 
                                        className="font-black text-foreground text-4xl leading-tight mb-4"
                                    >
                                        {card.title}
                                    </motion.h3>
                                    {card.category && (
                                        <motion.div layoutId={`card-cat-${card.id}`} className="flex">
                                            <span className={`inline-flex items-center gap-2 text-sm ${getCategoryColor(card.category).text} bg-muted/80 px-5 py-2 rounded-full font-black uppercase tracking-widest`}>
                                                {card.category}
                                            </span>
                                        </motion.div>
                                    )}
                                </div>
                                <button 
                                    onClick={handleClose}
                                    className="absolute right-8 top-8 p-3 rounded-full bg-background/50 hover:bg-background shadow-sm transition-colors z-20 pointer-events-auto"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            {/* Main Content */}
                            <div className="flex-1 p-10 overflow-y-auto scrollbar-hide prose prose-slate dark:prose-invert max-w-none">
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 }}
                                >
                                    <h4 className="text-xs font-black uppercase tracking-[0.2em] text-primary mb-6 opacity-40">题目详情</h4>
                                    <div className="text-xl leading-relaxed">
                                        <MarkdownViewer content={card.front || card.title} />
                                    </div>
                                    
                                    <div className="mt-12 flex items-center gap-3 text-muted-foreground/40 animate-pulse">
                                        <RotateCw className="w-4 h-4" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">点击翻转卡片查看参考答案</span>
                                    </div>
                                </motion.div>
                            </div>
                        </div>

                        {/* BACK SIDE */}
                        <div 
                            className="absolute inset-0 backface-hidden bg-primary rounded-[3rem] shadow-2xl overflow-hidden flex flex-col items-center justify-center p-12 text-center"
                            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                        >
                            <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mb-8 backdrop-blur-md border border-white/20">
                                <CheckCircle2 className="w-10 h-10 text-white" />
                            </div>

                            <div className="max-w-2xl w-full">
                                <h4 className="text-white/40 text-[10px] font-black uppercase tracking-[0.3em] mb-6">参考答案</h4>
                                <div className="text-white text-2xl font-medium leading-relaxed mb-12 prose-invert prose-p:text-white/90">
                                    <MarkdownViewer content={card.back || '暂无答案'} />
                                </div>

                                {card.key_points && card.key_points.length > 0 && (
                                    <div className="grid grid-cols-2 gap-4 text-left">
                                        {card.key_points.slice(0, 2).map((kp: unknown, i: number) => (
                                            <div key={i} className="bg-black/20 p-5 rounded-2xl border border-white/10 backdrop-blur-sm">
                                                <span className="block text-xs font-black text-white/50 uppercase mb-2">#{kp.term}</span>
                                                <span className="block text-sm text-white/90 leading-snug">{kp.definition}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="absolute bottom-12 text-[10px] text-white/30 font-black uppercase tracking-[0.2em]">
                                点击返回正面
                            </div>
                            
                            <button 
                                onClick={handleClose}
                                className="absolute right-8 top-8 p-3 rounded-full bg-black/20 hover:bg-black/40 text-white shadow-sm transition-colors z-20 pointer-events-auto"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            </div>
        </>
    );
};
