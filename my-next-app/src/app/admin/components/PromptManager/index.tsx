"use client";

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
    getPromptTemplatesAction,
    savePromptTemplateAction,
    resetPromptTemplateAction,
    debugPromptTemplateAction,
    PromptTemplate
} from '@/server/actions/prompts';
import { PromptList } from './PromptList';
import { PromptEditor } from './PromptEditor';
import { DebugPlayground } from './DebugPlayground';

export function PromptManager() {
    const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
    const [editingPrompt, setEditingPrompt] = useState<PromptTemplate | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isDebugLoading, setIsDebugLoading] = useState(false);
    const [debugVariables, setDebugVariables] = useState<Record<string, string>>({});
    const [debugResult, setDebugResult] = useState<string | null>(null);

    useEffect(() => {
        loadPrompts();
    }, []);

    const loadPrompts = async () => {
        try {
            const data = await getPromptTemplatesAction();
            setPrompts(data);
        } catch (_e) {
            toast.error("提示词加载失败");
        }
    };

    const handleSelectPrompt = (p: PromptTemplate) => {
        setEditingPrompt({ ...p, template: p.template || p.systemDefault || '' });
        setDebugResult(null);

        const initialVars: Record<string, string> = p.variableExamples || {};
        (p.variables || []).forEach((v: string) => {
            if (!initialVars[v]) initialVars[v] = '';
        });
        setDebugVariables(initialVars);
    };

    const handleSavePrompt = async () => {
        if (!editingPrompt) return;
        setIsSaving(true);
        try {
            const res = await savePromptTemplateAction(
                editingPrompt.key,
                editingPrompt.template,
                editingPrompt.description,
                editingPrompt.variables
            );
            if (res.success) {
                toast.success("提示词已保存");
                loadPrompts();
            } else {
                toast.error("保存失败: " + res.error);
            }
        } catch (e) {
            toast.error("请求失败: " + (e as Error).message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleResetPrompt = async () => {
        if (!editingPrompt || !confirm("确定要重置为系统默认提示词吗？您的自定义修改将丢失。")) return;
        try {
            await resetPromptTemplateAction(editingPrompt.key);
            toast.success("已重置");
            loadPrompts();
            // Refetch to get the system default
            const all = await getPromptTemplatesAction();
            const fresh = all.find(x => x.key === editingPrompt.key);
            if (fresh) setEditingPrompt(fresh);
        } catch (_e) {
            toast.error("重置失败");
        }
    };

    const handleRunDebug = async () => {
        if (!editingPrompt) return;
        setIsDebugLoading(true);
        setDebugResult(null);
        try {
            const res = await debugPromptTemplateAction(editingPrompt.key, editingPrompt.template, debugVariables);
            if (res.success) {
                setDebugResult(typeof res.result === 'string' ? res.result : JSON.stringify(res.result, null, 2));
            } else {
                toast.error("生成失败: " + res.error);
                let errorMsg = "Error: " + res.error;
                if (res.result) {
                    errorMsg += "\n\n" + res.result;
                }
                setDebugResult(errorMsg);
            }
        } catch (e) {
            toast.error("调试请求失败");
            setDebugResult("Request Error: " + (e as Error).message);
        } finally {
            setIsDebugLoading(false);
        }
    };

    if (prompts.length === 0) return <div className="p-8 text-center text-muted-foreground">正在加载提示词模板...</div>;

    return (
        <div className="flex h-[calc(100vh-200px)] gap-6 overflow-hidden">
            <PromptList
                prompts={prompts}
                selectedKey={editingPrompt?.key || null}
                onSelect={handleSelectPrompt}
            />
            {editingPrompt ? (
                <>
                    <PromptEditor
                        editingPrompt={editingPrompt}
                        onChange={(val) => setEditingPrompt({ ...editingPrompt, template: val })}
                        onSave={handleSavePrompt}
                        onReset={handleResetPrompt}
                        isSaving={isSaving}
                    />
                    <DebugPlayground
                        editingPrompt={editingPrompt}
                        debugVariables={debugVariables}
                        onVariableChange={(k, v) => setDebugVariables(prev => ({ ...prev, [k]: v }))}
                        onDebug={handleRunDebug}
                        isDebugLoading={isDebugLoading}
                        debugResult={debugResult}
                    />
                </>
            ) : (
                <div className="flex-1 flex items-center justify-center bg-muted/30 rounded-lg border border-dashed border-border text-muted-foreground">
                    请在左侧选择一个模板进行编辑或调试
                </div>
            )}
        </div>
    );
}
