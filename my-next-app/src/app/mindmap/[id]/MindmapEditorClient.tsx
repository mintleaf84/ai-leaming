'use client';

import React, { useState, useCallback, useRef } from 'react';
import { getErrorMessage } from '@/lib/utils/error';
import { Network, Wand2, Trash2, AlignLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import dynamic from 'next/dynamic';
import { generateMindmapAction } from '@/server/actions/mindmap';
import { updateMindmapAction } from '@/server/actions/mindmap-db';
import { toast } from 'sonner';

const SimpleMindMapViewer = dynamic(
    () => import('@/components/ocr/SimpleMindMapViewer').then(mod => mod.SimpleMindMapViewer),
    { ssr: false, loading: () => <div className="h-full w-full flex items-center justify-center text-muted-foreground animate-pulse">引擎装载中...</div> }
);

interface MindmapEditorClientProps {
    mindmap: { id: number; title: string; content: string | null };
}

export default function MindmapEditorClient({ mindmap }: MindmapEditorClientProps) {
    const [title, setTitle] = useState(mindmap.title || '未命名导图');
    const [markdown, setMarkdown] = useState(mindmap.content || '');
    const [isGenerating, setIsGenerating] = useState(false);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [saveStatus, setSaveStatus] = useState('已保存');

    const triggerSave = useCallback((newTitle: string, newContent: string) => {
        setSaveStatus('保存中...');
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        saveTimeoutRef.current = setTimeout(async () => {
            const res = await updateMindmapAction({
                id: mindmap.id,
                title: newTitle,
                content: newContent
            });
            if (res.success) {
                setSaveStatus('已保存');
            } else {
                setSaveStatus('保存失败');
            }
        }, 800);
    }, [mindmap.id]);

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setTitle(val);
        triggerSave(val, markdown);
    };

    const handleMarkdownChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setMarkdown(val);
        triggerSave(title, val);
    };

    const handleClear = useCallback(() => {
        if (confirm('确定要清空大纲内容吗？这将被立刻保存。')) {
            setMarkdown('');
            triggerSave(title, '');
        }
    }, [title, triggerSave]);

    const handleAIGenerate = useCallback(async () => {
        if (!markdown.trim()) {
            toast.error('空空如也，请粘贴需要转换的长文本');
            return;
        }

        setIsGenerating(true);
        const loadingToast = toast.loading('AI 正在深度解析文本结构，请稍候...');

        try {
            const res = await generateMindmapAction(markdown);
            if (res.success && res.data) {
                setMarkdown(res.data);
                triggerSave(title, res.data); // 自动保存
                toast.success('结构生成成功！', { id: loadingToast });
            } else {
                toast.error(res.error || '生成失败', { id: loadingToast });
            }
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, '生成过程中发生意外错误'), { id: loadingToast });
        } finally {
            setIsGenerating(false);
        }
    }, [markdown, title, triggerSave]);

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden font-sans relative">
            {/* 顶栏 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50">
                <div className="flex items-center gap-3 w-1/2">
                    <input
                        className="text-2xl font-bold bg-transparent border-none outline-none w-full placeholder:text-muted-foreground/40 font-serif"
                        value={title}
                        onChange={handleTitleChange}
                        placeholder="在此输入思维导图标题"
                    />
                </div>
                <div className="text-sm text-muted-foreground px-3 py-1 bg-accent/50 rounded-full">
                    {saveStatus}
                </div>
            </div>

            {/* Split Workspace */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left Panel: Editor */}
                <div className="w-1/3 min-w-[300px] max-w-[600px] border-r border-border flex flex-col bg-background relative">
                    <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <AlignLeft className="w-4 h-4" />
                            大纲文档
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleClear}
                                className="h-7 px-2 text-muted-foreground hover:text-destructive"
                            >
                                <Trash2 className="w-3.5 h-3.5 mr-1" />
                                清空
                            </Button>
                            <Button
                                variant="default"
                                size="sm"
                                onClick={handleAIGenerate}
                                disabled={isGenerating}
                                className="h-7 px-3 bg-indigo-500 hover:bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                            >
                                <Wand2 className={`w-3.5 h-3.5 mr-1.5 ${isGenerating ? 'animate-spin' : ''}`} />
                                {isGenerating ? 'AI 解析中...' : '提取大纲'}
                            </Button>
                        </div>
                    </div>
                    <textarea
                        value={markdown}
                        onChange={handleMarkdownChange}
                        className="flex-1 w-full p-6 bg-transparent outline-none resize-none font-mono text-[13px] leading-7 text-foreground placeholder:text-muted-foreground/30 scrollbar-thin"
                        placeholder="在此处直接使用 Markdown 符号（#、- 等）排版来生成图谱。&#10;&#10;或者直接粘贴一篇乱糟糟的长文章，点击上面的『提取大纲』召唤 AI 帮你整理！"
                        spellCheck={false}
                    />
                </div>

                {/* Right Panel: Live Viewer */}
                <div className="flex-1 bg-[#fafafa] dark:bg-black/20 p-6 relative overflow-hidden flex flex-col">
                    <SimpleMindMapViewer
                        markdown={markdown}
                        onChange={(m) => handleMarkdownChange({ target: { value: m } } as any)}
                        className="shadow-xl shadow-primary/5 w-full flex-1 rounded-2xl bg-card border-border/50"
                    />
                </div>
            </div>
        </div>
    );
}
