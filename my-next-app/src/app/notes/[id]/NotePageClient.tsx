'use client';

import React, { useCallback, useRef, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const NoteEditor = dynamic(() => import('@/components/editor/NoteEditor'), {
    ssr: false,
    loading: () => <div className="h-64 flex items-center justify-center text-muted-foreground animate-pulse">编辑器加载中...</div>
});
import { TagSelector } from '@/components/notes/TagSelector';
import { updateNoteAction } from '@/server/actions/note';
import { getGlobalFeatureFlag } from '@/server/actions/feature-flags';
import { toast } from 'sonner';
import { Network, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { tiptapToMarkdown } from '@/lib/utils/tiptapToMarkdown';

const SimpleMindMapViewer = dynamic(
    () => import('@/components/ocr/SimpleMindMapViewer').then(mod => mod.SimpleMindMapViewer),
    { ssr: false, loading: () => <div className="h-full w-full flex items-center justify-center text-muted-foreground animate-pulse">引擎装载中...</div> }
);

interface NotePageClientProps {
    note: {
        id: number;
        title: string;
        content: string | null;
    };
}

export default function NotePageClient({ note }: NotePageClientProps) {
    const [title, setTitle] = useState(note.title);
    const [viewMode, setViewMode] = useState<'editor' | 'mindmap'>('editor');
    const [currentContent, setCurrentContent] = useState(note.content || '');
    const [mindmapEnabled, setMindmapEnabled] = useState(true);

    useEffect(() => {
        getGlobalFeatureFlag('ENABLE_OCR_MINDMAP', true).then(setMindmapEnabled);
    }, []);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleSave = useCallback((newContent?: string, newTitle?: string) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        saveTimeoutRef.current = setTimeout(async () => {
            const result = await updateNoteAction({
                id: note.id,
                title: newTitle,
                content: newContent
            });
            if (newContent !== undefined) {
                setCurrentContent(newContent);
            }
            if (!result.data?.success) {
                toast.error('保存失败');
            }
        }, 1000);
    }, [note.id]);

    return (
        <div className="flex flex-col h-full max-w-4xl mx-auto w-full">
            <div className="pt-8 px-12 pb-2">
                <input
                    value={title}
                    onChange={(e) => {
                        const val = e.target.value;
                        setTitle(val);
                        handleSave(undefined, val);
                    }}
                    className="text-4xl font-bold bg-transparent border-none outline-none w-full placeholder:text-muted-foreground/40"
                    placeholder="无标题"
                />
                {/* 标签选择器与视图切换 */}
                <div className="mt-3 flex items-center justify-between">
                    <TagSelector noteId={note.id} />
                    
                    <div className="flex bg-muted/50 p-1 rounded-lg">
                        <Button
                            variant={viewMode === 'editor' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-8 gap-1.5 px-3"
                            onClick={() => setViewMode('editor')}
                        >
                            <FileText className="w-3.5 h-3.5" />
                            文档
                        </Button>
                        {mindmapEnabled && (
                        <Button
                            variant={viewMode === 'mindmap' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-8 gap-1.5 px-3"
                            onClick={() => setViewMode('mindmap')}
                        >
                            <Network className="w-3.5 h-3.5 text-primary" />
                            思维导图
                        </Button>
                        )}
                    </div>
                </div>
            </div>
            <div className={`flex-1 px-12 pb-20 scrollbar-thin ${viewMode === 'editor' ? 'overflow-y-auto' : 'overflow-hidden pt-4'}`}>
                {viewMode === 'editor' ? (
                    <NoteEditor
                        key={note.id}
                        initialContent={note.content}
                        onChange={(content) => handleSave(content)}
                    />
                ) : (
                    <SimpleMindMapViewer 
                        markdown={tiptapToMarkdown(currentContent)} 
                        onChange={(md) => {
                            // 在笔记中反向映射通常需要转换回 JSON Content 或者原样更新 currentContent
                            setCurrentContent(md);
                            handleSave(md);
                        }}
                        className="h-full max-h-none border-none shadow-none" 
                    />
                )}
            </div>
        </div>
    );
}
