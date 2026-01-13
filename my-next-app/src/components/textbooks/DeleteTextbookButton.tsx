
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface DeleteTextbookButtonProps {
    id: number;
    title: string;
}

export function DeleteTextbookButton({ id, title }: DeleteTextbookButtonProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const handleDelete = async () => {
        setDeleting(true);
        try {
            const res = await fetch(`/api/textbook/${id}`, {
                method: 'DELETE',
            });

            if (!res.ok) {
                throw new Error('Failed to delete');
            }

            toast.success('删除成功');
            setOpen(false);
            router.refresh();
        } catch (error) {
            toast.error('删除失败，请稍后重试');
            console.error(error);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2 shadow-sm z-10" onClick={(e) => e.stopPropagation()}>
                    <Trash2 className="h-4 w-4" />
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                <AlertDialogHeader>
                    <AlertDialogTitle>确认删除教材？</AlertDialogTitle>
                    <AlertDialogDescription>
                        您即将删除《{title}》。
                        <br />
                        此操作将永久删除该教材及其所有章节、图片和 AI 知识索引，且无法恢复。
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDelete(); }} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        {deleting ? '删除中...' : '确认删除'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
