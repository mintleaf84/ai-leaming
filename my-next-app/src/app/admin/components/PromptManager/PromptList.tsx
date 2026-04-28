"use client";

import React from 'react';
import type { PromptTemplate } from '@/lib/services/prompt';

interface PromptListProps {
    prompts: PromptTemplate[];
    selectedKey: string | null;
    onSelect: (p: PromptTemplate) => void;
}

export function PromptList({ prompts, selectedKey, onSelect }: PromptListProps) {
    return (
        <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden flex flex-col h-full w-64 shrink-0">
            <div className="p-4 border-b border-border bg-muted/30">
                <h3 className="font-bold text-foreground">提示词列表</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {prompts.map(p => (
                    <button
                        key={p.key}
                        onClick={() => onSelect(p)}
                        className={`w-full text-left p-3 rounded-lg text-sm transition-colors ${selectedKey === p.key
                            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium border border-blue-500/20'
                            : 'hover:bg-muted text-muted-foreground border border-transparent'
                            }`}
                    >
                        {p.description}
                        <div className="text-xs text-muted-foreground/60 mt-1 font-mono truncate">{p.key}</div>
                    </button>
                ))}
            </div>
        </div>
    );
}
