'use client';

import React from 'react';
import { Tag, Edit2, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { KnowledgeCard } from '@/lib/services/knowledge';

interface KnowledgeCardItemProps {
    card: KnowledgeCard;
    isFlipped: boolean;
    onFlip: (id: number) => void;
    onEdit: (card: KnowledgeCard) => void;
    onDelete: (id: number) => void;
    categoryColor: { bg: string; text: string };
}

export const KnowledgeCardItem: React.FC<KnowledgeCardItemProps> = ({
    card,
    isFlipped,
    onFlip,
    onEdit,
    onDelete,
    categoryColor
}) => {
    return (
        <div
            className="group relative"
            style={{ perspective: '1200px' }}
        >
            <div
                className={`relative w-full h-[320px] md:h-[400px] transition-all duration-700 ease-in-out cursor-pointer ${isFlipped ? 'rotate-y-180' : ''}`}
                style={{
                    transformStyle: 'preserve-3d',
                    transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
                }}
                onClick={() => onFlip(card.id!)}
            >
                {/* FRONT SIDE */}
                <div
                    className="absolute inset-0 backface-hidden"
                    style={{ backfaceVisibility: 'hidden' }}
                >
                    <div className="h-full bg-card rounded-2xl border border-border shadow-lg hover:shadow-2xl transition-all overflow-hidden flex flex-col group/card">
                        {/* Card Header */}
                        <div className="px-6 py-4 bg-muted/30 border-b border-border relative">
                            <div className="flex items-start justify-between relative z-10">
                                <div className="flex-1 min-w-0 pr-8">
                                    <h3 className="font-bold text-foreground text-xl leading-snug line-clamp-2">{card.title}</h3>
                                    {card.category && (
                                        <span className={`inline-flex items-center gap-1.5 text-sm ${categoryColor.text} mt-3 bg-muted/60 px-3 py-1 rounded-full font-semibold`}>
                                            <Tag className="w-3.5 h-3.5" />
                                            {card.category}
                                        </span>
                                    )}
                                </div>
                                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                                    <button
                                        onClick={() => onEdit(card)}
                                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-xl transition-colors"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => onDelete(card.id!)}
                                        className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Markdown Question */}
                        <div className="flex-1 p-6 flex flex-col overflow-y-auto prose prose-slate dark:prose-invert max-w-none prose-p:leading-relaxed prose-p:text-lg scrollbar-hide">
                            <div className="flex items-center gap-2 mb-3 sticky top-0 bg-card/80 py-1 backdrop-blur-sm z-10">
                                <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-black uppercase rounded">Front</span>
                                <span className="text-[10px] text-muted-foreground font-medium">点击卡片正中央翻转答案</span>
                            </div>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {card.front || card.title}
                            </ReactMarkdown>

                            {/* Tags */}
                            {card.tags && card.tags.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-auto pt-6 border-t border-border">
                                    {card.tags.map((tag, i) => (
                                        <span key={i} className="px-3 py-1.5 bg-muted/50 text-muted-foreground text-xs rounded-lg border border-border font-bold">
                                            #{tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* BACK SIDE */}
                <div
                    className="absolute inset-0 backface-hidden rotate-y-180"
                    style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                >
                    <div className="h-full bg-card rounded-2xl border border-border shadow-xl overflow-hidden flex flex-col">
                        {/* Header for Back */}
                        <div className="px-5 py-3 bg-primary flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-5 h-5 text-primary-foreground" />
                                <span className="text-primary-foreground text-sm font-black uppercase tracking-wider">解答与要点</span>
                            </div>
                            <span className="text-primary-foreground/40 text-[10px] font-medium tracking-tighter">THE ANSWER</span>
                        </div>

                        {/* Markdown Answer Content */}
                        <div className="flex-1 p-6 overflow-y-auto prose prose-slate dark:prose-invert max-w-none prose-p:text-lg prose-headings:text-foreground prose-ul:list-disc">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {card.back || '暂无答案'}
                            </ReactMarkdown>

                            {card.key_points && card.key_points.length > 0 && (
                                <div className="mt-6 pt-4 border-t border-border">
                                    <div className="flex items-center gap-2 mb-3">
                                        <AlertCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                        <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-wider m-0">核心要点提取</h4>
                                    </div>
                                    <div className="space-y-3">
                                        {card.key_points.map((kp, i) => (
                                            <div key={i} className="bg-card p-3 rounded-lg border border-border relative overflow-hidden">
                                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-muted-foreground/30"></div>
                                                <span className="block text-xs font-bold text-foreground mb-1">{kp.term}</span>
                                                <span className="block text-[11px] text-muted-foreground leading-normal">{kp.definition}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
