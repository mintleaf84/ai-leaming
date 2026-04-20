'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Plus, Trash2, Network } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createMindmapAction, deleteMindmapAction } from '@/server/actions/mindmap-db';
import { toast } from 'sonner';

interface MindmapSidebarProps {
    records: { id: number; title: string; updated_at: string }[];
}

export function MindmapSidebar({ records }: MindmapSidebarProps) {
    const router = useRouter();
    const pathname = usePathname();

    const handleCreate = async () => {
        const loading = toast.loading('创建中...');
        try {
            const result = await createMindmapAction();
            if (result.success && result.id) {
                router.push(`/mindmap/${result.id}`);
                toast.success('新建成功', { id: loading });
            } else {
                toast.error(result.message || '创建失败', { id: loading });
            }
        } catch (_error) {
            toast.error('请求失败', { id: loading });
        }
    };

    const handleDelete = async (id: number, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm('确定要删除这张思维导图吗？')) return;

        try {
            const result = await deleteMindmapAction(id);
            if (result.success) {
                toast.success('删除成功');
                if (pathname === `/mindmap/${id}`) {
                    router.push('/mindmap');
                }
            } else {
                toast.error(result.message || '删除失败');
            }
        } catch (_error) {
            toast.error('请求失败');
        }
    };

    return (
        <div className="w-64 border-r border-border h-[calc(100vh-64px)] bg-muted/20 flex flex-col font-sans">
            <div className="p-4 border-b border-border">
                <Button
                    onClick={handleCreate}
                    className="w-full justify-start gap-2 h-10 shadow-sm"
                    variant="default"
                >
                    <Plus className="w-4 h-4" />
                    新建导图
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-thin">
                {records.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm opacity-60">
                        暂无思维导图记录
                    </div>
                ) : (
                    records.map(record => {
                        const isActive = pathname === `/mindmap/${record.id}`;
                        return (
                            <Link
                                key={record.id}
                                href={`/mindmap/${record.id}`}
                                className={`group flex items-center justify-between p-2.5 rounded-lg text-sm transition-colors ${
                                    isActive
                                        ? 'bg-primary/10 text-primary font-medium'
                                        : 'hover:bg-muted text-foreground'
                                }`}
                            >
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <Network className="w-4 h-4 flex-shrink-0 opacity-70" />
                                    <span className="truncate">{record.title}</span>
                                </div>

                                <button
                                    onClick={(e) => handleDelete(record.id, e)}
                                    className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-destructive/10 hover:text-destructive rounded transition-all"
                                    title="删除"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </Link>
                        );
                    })
                )}
            </div>
        </div>
    );
}
