'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Plus, FileText, Trash2, BookOpen, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createNoteAction, deleteNoteAction, createWelcomeNoteAction, searchNotesAction } from '@/server/actions/note';
import { type NotePreview } from '@/lib/services/knowledge';
import { toast } from 'sonner';
import { useDebouncedCallback } from 'use-debounce';

interface NoteSidebarProps {
    notes: NotePreview[];
}

export function NoteSidebar({ notes: initialNotes }: NoteSidebarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [isCreating, setIsCreating] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filteredNotes, setFilteredNotes] = useState(initialNotes);
    const [isSearching, setIsSearching] = useState(false);

    // 同步初始笔记列表
    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredNotes(initialNotes);
        }
    }, [initialNotes, searchQuery]);

    // 防抖搜索
    const debouncedSearch = useDebouncedCallback(async (query: string) => {
        if (!query.trim()) {
            setFilteredNotes(initialNotes);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        const result = await searchNotesAction(query);
        if (result.success && result.notes) {
            setFilteredNotes(result.notes);
        }
        setIsSearching(false);
    }, 300);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const query = e.target.value;
        setSearchQuery(query);
        debouncedSearch(query);
    };

    const handleCreate = async () => {
        setIsCreating(true);
        try {
            const result = await createNoteAction();
            if (result.success && result.noteId) {
                router.push(`/notes/${result.noteId}`);
                toast.success('新笔记已创建');
            } else {
                toast.error(result.message || '创建失败');
            }
        } catch (_error) {
            toast.error('请求失败');
        } finally {
            setIsCreating(false);
        }
    };

    const handleDelete = async (id: number, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm('确定要删除这条笔记吗？')) return;

        try {
            const result = await deleteNoteAction(id);
            if (result.success) {
                toast.success('删除成功');
                if (pathname === `/notes/${id}`) {
                    router.push('/notes');
                }
                router.refresh();
            } else {
                toast.error(result.message || '删除失败');
            }
        } catch (_error) {
            toast.error('删除出错');
        }
    };

    return (
        <div className="w-64 border-r border-border h-full bg-muted/20 flex flex-col">
            <div className="p-4 border-b border-border space-y-3">
                <Button
                    onClick={handleCreate}
                    disabled={isCreating}
                    className="w-full justify-start gap-2"
                    variant="default"
                >
                    <Plus className="w-4 h-4" />
                    {isCreating ? '创建中...' : '新建笔记'}
                </Button>

                {/* 搜索框 */}
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="搜索笔记..."
                        value={searchQuery}
                        onChange={handleSearchChange}
                        className="pl-8 h-9"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {isSearching && (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                        搜索中...
                    </div>
                )}

                {!isSearching && filteredNotes.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                        {searchQuery ? '未找到匹配的笔记' : '暂无笔记'}
                    </div>
                )}

                {!isSearching && filteredNotes.map(note => {
                    const isActive = pathname === `/notes/${note.id}`;
                    return (
                        <Link
                            key={note.id}
                            href={`/notes/${note.id}`}
                            className={`group flex items-center justify-between p-2 rounded-lg text-sm transition-colors ${isActive
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'hover:bg-muted text-foreground'
                                }`}
                        >
                            <div className="flex items-center gap-2 overflow-hidden">
                                <FileText className="w-4 h-4 flex-shrink-0 opacity-70" />
                                <span className="truncate">{note.title || '无标题'}</span>
                            </div>

                            <button
                                onClick={(e) => handleDelete(note.id, e)}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 hover:text-destructive rounded transition-all"
                                title="删除"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </Link>
                    );
                })}
            </div>

            <div className="p-2 border-t border-border">
                <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
                    onClick={async () => {
                        const loadingToast = toast.loading('正在创建示例文档...');
                        try {
                            const result = await createWelcomeNoteAction();
                            if (result.success && result.noteId) {
                                router.push(`/notes/${result.noteId}`);
                                toast.success('示例文档已创建', { id: loadingToast });
                            } else {
                                toast.error('创建失败', { id: loadingToast });
                            }
                        } catch (_e) {
                            toast.error('请求出错', { id: loadingToast });
                        }
                    }}
                >
                    <BookOpen className="w-4 h-4" />
                    导入使用指南
                </Button>
            </div>
        </div>
    );
}
