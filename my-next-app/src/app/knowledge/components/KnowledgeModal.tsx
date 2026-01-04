'use client';

import React from 'react';
import { X, Plus, Edit2, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { KnowledgeCard } from '@/lib/knowledge-service';

interface KnowledgeModalProps {
    isOpen: boolean;
    isCreate: boolean;
    card: Partial<KnowledgeCard> | null;
    onClose: () => void;
    onSave: () => void;
    onChange: (card: Partial<KnowledgeCard>) => void;
}

export const KnowledgeModal: React.FC<KnowledgeModalProps> = ({
    isOpen,
    isCreate,
    card,
    onClose,
    onSave,
    onChange
}) => {
    const [instruction, setInstruction] = React.useState('');
    const [isRegenerating, setIsRegenerating] = React.useState(false);

    // 当收到新的 card 时重置指令
    React.useEffect(() => {
        setInstruction('');
    }, [card?.id]);

    const handleRegenerate = async (instructionOverride?: string) => {
        const finalInstruction = instructionOverride || instruction;
        if (!card?.source_content || !finalInstruction.trim()) return;

        // 如果是点击建议触发的，同步更新输入框
        if (instructionOverride) {
            setInstruction(instructionOverride);
        }

        setIsRegenerating(true);
        try {
            const res = await fetch('/api/knowledge/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: card.source_content,
                    sessionId: card.session_id,
                    instruction: finalInstruction,
                    save: false // 预览模式，不保存到数据库
                }),
            });

            if (!res.ok) throw new Error('Regeneration failed');

            const data = await res.json();
            if (data.card) {
                // 保留当前 ID 和 category (如果 AI 没返回 category)
                onChange({
                    ...data.card,
                    id: card.id,
                    source_content: card.source_content, // 保持源内容
                    session_id: card.session_id,
                    suggestions: data.suggestions // 更新建议
                });
                setInstruction(''); // 清空指令
            }
        } catch (error) {
            console.error('Failed to regenerate:', error);
            // 这里可以加一个 toast，但组件内可以通过 error state 处理
        } finally {
            setIsRegenerating(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-border">
                <div className="flex items-center justify-between p-6 border-b border-border bg-muted/30">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isCreate ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'bg-purple-500/10 text-purple-600 dark:text-purple-400'}`}>
                            {isCreate ? <Plus className="w-5 h-5" /> : <Edit2 className="w-5 h-5" />}
                        </div>
                        <div>
                            <h2 className="font-bold text-xl text-foreground">{isCreate ? '手动创作知识卡片' : '精修知识卡片'}</h2>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                                {isRegenerating ? (
                                    <span className="flex items-center text-primary animate-pulse">
                                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                        AI 正在根据指令优化...
                                    </span>
                                ) : (
                                    '支持 AI 辅助优化与 Markdown 语法'
                                )}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-accent rounded-full transition-colors">
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                {/* AI Regeneration Bar */}
                {card?.source_content && (
                    <div className="px-6 py-3 bg-blue-50/50 dark:bg-blue-900/10 border-b border-blue-100 dark:border-blue-900/20 flex gap-2">
                        <input
                            type="text"
                            value={instruction}
                            onChange={(e) => setInstruction(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRegenerate()}
                            placeholder="输入指令让 AI 重新生成，例如：'用更通俗的例子解释'..."
                            className="flex-1 bg-background/50 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder:text-muted-foreground/60"
                            disabled={isRegenerating}
                        />
                        <Button
                            size="sm"
                            onClick={() => handleRegenerate()}
                            disabled={!instruction.trim() || isRegenerating}
                            className="h-auto py-1 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5 rounded-lg shadow-sm"
                        >
                            {isRegenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                            {isRegenerating ? '生成中' : '优化'}
                        </Button>
                    </div>
                )}

                {/* AI Suggestions */}
                {card?.suggestions && card.suggestions.length > 0 && (
                    <div className="px-6 pb-2 pt-2 flex flex-wrap gap-2">
                        {card.suggestions.map((suggestion, index) => (
                            <button
                                key={index}
                                onClick={() => {
                                    handleRegenerate(suggestion);
                                }}
                                className="text-[10px] px-2 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-900/30 transition-colors animate-in fade-in slide-in-from-top-1 duration-300"
                                style={{ animationDelay: `${index * 100}ms` }}
                            >
                                <Sparkles className="w-3 h-3 inline-block mr-1 opacity-70" />
                                {suggestion}
                            </button>
                        ))}
                    </div>
                )}
                <div className="flex-1 p-6 overflow-y-auto space-y-6 scrollbar-thin">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pl-1">卡片主轴标题</label>
                            <input
                                type="text"
                                placeholder="例如：广域课程的定义"
                                value={card?.title || ''}
                                onChange={(e) => onChange({ ...card, title: e.target.value })}
                                className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:bg-background transition-all outline-none font-bold text-foreground"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pl-1">所属分类</label>
                            <input
                                type="text"
                                placeholder="教育学基础"
                                value={card?.category || ''}
                                onChange={(e) => onChange({ ...card, category: e.target.value })}
                                className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:bg-background transition-all outline-none text-foreground"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pl-1">正面内容 (QUESTION - MARKDOWN)</label>
                        <textarea
                            value={card?.front || ''}
                            onChange={(e) => onChange({ ...card, front: e.target.value })}
                            rows={4}
                            placeholder="输入要记忆的问题，支持 **加粗** 等 Markdown..."
                            className="w-full px-4 py-3 bg-muted/50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:bg-background transition-all outline-none resize-none font-mono text-foreground placeholder:text-muted-foreground/50"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pl-1">背面详细解答 (ANSWER - MARKDOWN)</label>
                        <textarea
                            value={card?.back || ''}
                            onChange={(e) => onChange({ ...card, back: e.target.value })}
                            rows={6}
                            placeholder="输入详细的解释和答案..."
                            className="w-full px-4 py-3 bg-muted/50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:bg-background transition-all outline-none resize-none font-mono text-foreground placeholder:text-muted-foreground/50"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pl-1">标签集合 (用空格或逗号分隔)</label>
                        <input
                            type="text"
                            value={card?.tags?.join(', ') || ''}
                            onChange={(e) => onChange({
                                ...card,
                                tags: e.target.value.split(/[ ,，]+/).filter(Boolean)
                            })}
                            className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:bg-background transition-all outline-none text-foreground"
                        />
                    </div>
                </div>

                <div className="p-6 border-t border-border bg-muted/30 flex justify-end gap-3">
                    <Button variant="ghost" onClick={onClose} className="rounded-xl text-muted-foreground hover:bg-muted">
                        放弃修改
                    </Button>
                    <Button
                        onClick={onSave}
                        className="rounded-xl px-8 bg-primary hover:bg-primary/90 text-primary-foreground shadow-xl"
                    >
                        完成并同步
                    </Button>
                </div>
            </div >
        </div >
    );
};
