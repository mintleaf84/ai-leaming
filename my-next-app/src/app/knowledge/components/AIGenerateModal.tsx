'use client';

import React, { useState } from 'react';
import { X, Sparkles, Loader2, Wand2, Save, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { KnowledgeCard } from '@/lib/services/knowledge';

interface AIGenerateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (card: Partial<KnowledgeCard>) => void;
}

type Step = 'input' | 'preview';

export const AIGenerateModal: React.FC<AIGenerateModalProps> = ({
    isOpen,
    onClose,
    onSave
}) => {
    const [step, setStep] = useState<Step>('input');
    const [inputText, setInputText] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedCard, setGeneratedCard] = useState<Partial<KnowledgeCard> | null>(null);
    const [error, setError] = useState<string | null>(null);

    // 重置状态
    const reset = () => {
        setStep('input');
        setInputText('');
        setGeneratedCard(null);
        setError(null);
    };

    // 关闭弹窗时重置
    const handleClose = () => {
        reset();
        onClose();
    };

    // 调用 AI 生成
    const handleGenerate = async () => {
        if (!inputText.trim()) return;

        setIsGenerating(true);
        setError(null);

        try {
            const res = await fetch('/api/knowledge/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: inputText,
                    save: false, // 预览模式
                }),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || '生成失败');
            }

            const data = await res.json();
            if (data.card) {
                setGeneratedCard({
                    ...data.card,
                    source_content: inputText, // 保存原始输入
                });
                setStep('preview');
            }
        } catch (err: any) {
            console.error('[AIGenerateModal] 生成失败:', err);
            setError(err.message || '生成失败，请重试');
        } finally {
            setIsGenerating(false);
        }
    };

    // 保存卡片
    const handleSave = () => {
        if (generatedCard) {
            onSave(generatedCard);
            handleClose();
        }
    };

    // 返回重新输入
    const handleBack = () => {
        setStep('input');
        setGeneratedCard(null);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-border">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
                            <Wand2 className="w-5 h-5 text-primary-foreground" />
                        </div>
                        <div>
                            <h2 className="font-bold text-xl text-foreground">AI 智能生成</h2>
                            <p className="text-xs text-muted-foreground">
                                {step === 'input' ? '输入知识点，AI 自动结构化为知识卡片' : '预览生成结果，可编辑后保存'}
                            </p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="p-2 hover:bg-accent rounded-full transition-colors">
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 p-6 overflow-y-auto">
                    {step === 'input' ? (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pl-1">
                                    输入知识点内容
                                </label>
                                <textarea
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                    rows={10}
                                    placeholder="请输入你想要转化为知识卡片的内容，例如：

皮亚杰认知发展理论将儿童认知发展分为四个阶段：
1. 感知运动阶段（0-2岁）：通过感觉和动作认识世界
2. 前运算阶段（2-7岁）：开始使用符号表征，但思维不可逆
3. 具体运算阶段（7-11岁）：能进行逻辑思维，但限于具体事物
4. 形式运算阶段（11岁以上）：能进行抽象思维和假设推理"
                                    className="w-full px-4 py-3 bg-muted/50 border border-border rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-background transition-all outline-none resize-none text-foreground placeholder:text-muted-foreground/50"
                                    disabled={isGenerating}
                                />
                            </div>

                            {error && (
                                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm">
                                    {error}
                                </div>
                            )}

                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Sparkles className="w-4 h-4 text-primary" />
                                <span>AI 将自动提取标题、分类、正反面内容和关键知识点</span>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* 预览编辑表单 */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pl-1">标题</label>
                                    <input
                                        type="text"
                                        value={generatedCard?.title || ''}
                                        onChange={(e) => setGeneratedCard({ ...generatedCard, title: e.target.value })}
                                        className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-background transition-all outline-none font-bold text-foreground"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pl-1">分类</label>
                                    <input
                                        type="text"
                                        value={generatedCard?.category || ''}
                                        onChange={(e) => setGeneratedCard({ ...generatedCard, category: e.target.value })}
                                        className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-background transition-all outline-none text-foreground"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pl-1">正面 (问题)</label>
                                <textarea
                                    value={generatedCard?.front || ''}
                                    onChange={(e) => setGeneratedCard({ ...generatedCard, front: e.target.value })}
                                    rows={3}
                                    className="w-full px-4 py-3 bg-muted/50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 focus:bg-background transition-all outline-none resize-none font-mono text-foreground"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pl-1">背面 (答案)</label>
                                <textarea
                                    value={generatedCard?.back || ''}
                                    onChange={(e) => setGeneratedCard({ ...generatedCard, back: e.target.value })}
                                    rows={5}
                                    className="w-full px-4 py-3 bg-muted/50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 focus:bg-background transition-all outline-none resize-none font-mono text-foreground"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pl-1">标签</label>
                                <input
                                    type="text"
                                    value={generatedCard?.tags?.join(', ') || ''}
                                    onChange={(e) => setGeneratedCard({
                                        ...generatedCard,
                                        tags: e.target.value.split(/[ ,，]+/).filter(Boolean)
                                    })}
                                    className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-background transition-all outline-none text-foreground"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-border bg-muted/30 flex justify-between">
                    {step === 'input' ? (
                        <>
                            <Button variant="ghost" onClick={handleClose} className="rounded-xl text-muted-foreground hover:bg-muted">
                                取消
                            </Button>
                            <Button
                                onClick={handleGenerate}
                                disabled={!inputText.trim() || isGenerating}
                                className="rounded-xl px-8 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground shadow-xl gap-2"
                            >
                                {isGenerating ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        生成中...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-4 h-4" />
                                        AI 生成
                                    </>
                                )}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="ghost" onClick={handleBack} className="rounded-xl text-muted-foreground hover:bg-muted gap-2">
                                <RotateCcw className="w-4 h-4" />
                                重新输入
                            </Button>
                            <Button
                                onClick={handleSave}
                                className="rounded-xl px-8 bg-primary hover:bg-primary/90 text-primary-foreground shadow-xl gap-2"
                            >
                                <Save className="w-4 h-4" />
                                保存卡片
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
