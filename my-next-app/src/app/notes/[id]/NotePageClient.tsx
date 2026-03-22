'use client';

import React, { useCallback, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

const NoteEditor = dynamic(() => import('@/components/editor/NoteEditor'), {
    ssr: false,
    loading: () => <div className="h-64 flex items-center justify-center text-muted-foreground animate-pulse">编辑器加载中...</div>
});
import { TagSelector } from '@/components/notes/TagSelector';
import { updateNoteAction } from '@/server/actions/note';
import { toast } from 'sonner';

interface NotePageClientProps {
    note: {
        id: number;
        title: string;
        content: string | null;
    };
}

export default function NotePageClient({ note }: NotePageClientProps) {
    const [title, setTitle] = useState(note.title);
    // Use 'any' for timeout to avoid NodeJS vs Window type issues in frontend
    const saveTimeoutRef = useRef<any>(null);

    const handleSave = useCallback((newContent?: string, newTitle?: string) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        saveTimeoutRef.current = setTimeout(async () => {
            const result = await updateNoteAction({
                id: note.id,
                title: newTitle,
                content: newContent
            });
            if (!result.success) {
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
                {/* 标签选择器 */}
                <div className="mt-3">
                    <TagSelector noteId={note.id} />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto px-12 pb-20 scrollbar-thin">
                <NoteEditor
                    key={note.id}
                    initialContent={note.content}
                    onChange={(content) => handleSave(content)}
                />
            </div>
        </div>
    );
}
