"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Save, RotateCcw } from 'lucide-react';
import type { PromptTemplate } from '@/lib/services/prompt';

interface PromptEditorProps {
    editingPrompt: PromptTemplate | null;
    isSaving: boolean;
    onSave: () => void;
    onReset: () => void;
    onChange: (template: string) => void;
}

export function PromptEditor({ editingPrompt, isSaving, onSave, onReset, onChange }: PromptEditorProps) {
    if (!editingPrompt) {
        return (
            <div className="bg-card rounded-xl shadow-sm border border-border h-full flex items-center justify-center text-muted-foreground text-sm">
                请从左侧选择一个提示词进行编辑
            </div>
        );
    }

    return (
        <div className="bg-card rounded-xl shadow-sm border border-border h-full flex flex-col">
            <div className="p-4 border-b border-border flex justify-between items-center bg-muted/30">
                <div>
                    <h3 className="font-bold text-foreground">{editingPrompt.description}</h3>
                    <p className="text-xs text-muted-foreground">正在编辑 Prompt 内容</p>
                </div>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={onReset} title="重置为系统默认">
                        <RotateCcw className="w-3 h-3 mr-1" /> 重置
                    </Button>
                    <Button size="sm" onClick={onSave} disabled={isSaving}>
                        <Save className="w-3 h-3 mr-1" /> 保存
                    </Button>
                </div>
            </div>
            <div className="flex-1 p-0 relative bg-background rounded-b-xl overflow-hidden">
                <textarea
                    className="w-full h-full resize-none p-4 outline-none font-mono text-sm leading-relaxed bg-transparent text-foreground placeholder:text-muted-foreground/50"
                    placeholder={editingPrompt.systemDefault ? "当前使用系统默认提示词，可在此输入自定义内容覆盖..." : "在此输入提示词模板..."}
                    value={editingPrompt.template || ''}
                    onChange={(e) => onChange(e.target.value)}
                />
                {!editingPrompt.template && editingPrompt.systemDefault && (
                    <div className="absolute inset-0 pointer-events-none p-4 font-mono text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap opacity-60">
                        {editingPrompt.systemDefault}
                    </div>
                )}
                {!editingPrompt.template && !editingPrompt.systemDefault && (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-muted/10">
                        <p className="text-muted-foreground/30 text-sm">当前无内容</p>
                    </div>
                )}
            </div>
            <div className="p-2 bg-muted/50 text-[10px] text-muted-foreground border-t border-border">
                可用变量: {(editingPrompt.variables || []).map((v: string) => `\${${v}}`).join(', ')}
            </div>
        </div>
    );
}
