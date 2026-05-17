"use client";

import React from 'react';
import { Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { AnnotatableText } from '../AnnotatableText';

interface AIMnemonicSectionProps {
    mnemonic: string | null;
    isGenerating: boolean;
    onGenerate: (force?: boolean) => void;
    questionId?: number;
}

export function AIMnemonicSection({ mnemonic, isGenerating, onGenerate, questionId }: AIMnemonicSectionProps) {
    return (
        <div className="p-5 bg-purple-500/5 border-t border-purple-500/10">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400 font-bold text-sm">
                    <Sparkles className="h-4 w-4" />
                    AI 记忆大师
                </div>
                {!mnemonic && questionId && (
                    <button
                        onClick={() => onGenerate(false)}
                        disabled={isGenerating}
                        className="px-3 py-1.5 text-xs font-medium bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-400 rounded-full border border-purple-500/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                生成中...
                            </>
                        ) : (
                            '生成记忆口诀'
                        )}
                    </button>
                )}

                {mnemonic && questionId && (
                    <button
                        onClick={() => onGenerate(true)}
                        disabled={isGenerating}
                        className="p-1.5 text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 transition-colors disabled:opacity-50"
                        title="重新生成"
                    >
                        <RefreshCw className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
                    </button>
                )}
            </div>

            {mnemonic ? (
                <div className="bg-card p-4 rounded-xl border border-purple-500/20 shadow-sm">
                    {questionId ? (
                        <AnnotatableText
                            text={mnemonic}
                            questionId={questionId}
                            className="text-sm text-foreground"
                        />
                    ) : (
                        <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                            {mnemonic}
                        </div>
                    )}
                </div>
            ) : (
                <div className="text-xs text-muted-foreground">
                    遇到难记的知识点？点击按钮，AI 为你生成趣味口诀和脑洞联想。
                </div>
            )}
        </div>
    );
}