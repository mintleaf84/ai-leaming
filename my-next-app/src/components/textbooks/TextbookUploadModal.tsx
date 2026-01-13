
"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { FileUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export function TextbookUploadModal({ children, onSuccess }: { children: React.ReactNode, onSuccess?: () => void }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'standard' | 'mineru'>('standard');
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);

        const formData = new FormData(e.currentTarget);

        try {
            const isMineru = activeTab === 'mineru';
            const endpoint = isMineru ? '/api/textbook/import/zip' : '/api/textbook/upload';

            const res = await fetch(endpoint, {
                method: 'POST',
                body: formData,
            });

            // 检查响应是否为 JSON
            const contentType = res.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await res.text();
                console.error('[Upload] Non-JSON response:', text.substring(0, 200));
                throw new Error('服务器返回了非 JSON 响应，请查看控制台日志');
            }

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || '上传失败');
            }

            toast.success(`上传成功，包含 ${data.chaptersCount} 个章节`);
            setOpen(false);
            router.refresh();
            if (onSuccess) onSuccess();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>上传新教材</DialogTitle>
                </DialogHeader>

                <div className="flex space-x-1 rounded-lg bg-muted p-1">
                    <button
                        onClick={() => setActiveTab('standard')}
                        type="button"
                        className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${activeTab === 'standard'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:bg-background/50'
                            }`}
                    >
                        普通上传 (PDF/MD)
                    </button>
                    <button
                        onClick={() => setActiveTab('mineru')}
                        type="button"
                        className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${activeTab === 'mineru'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:bg-background/50'
                            }`}
                    >
                        Mineru 导入 (Zip)
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    {/* Hidden input to track type */}
                    <input type="hidden" name="uploadType" value={activeTab} />

                    {activeTab === 'standard' ? (
                        <>
                            <div className="grid w-full max-w-sm items-center gap-1.5">
                                <Label htmlFor="file">教材文件 (PDF / Markdown)</Label>
                                <Input id="file" name="file" type="file" accept=".pdf,.md,.txt" required />
                            </div>

                            <div className="grid w-full max-w-sm items-center gap-1.5">
                                <Label htmlFor="title">教材标题</Label>
                                <Input id="title" name="title" placeholder="如果不填则使用文件名" />
                            </div>

                            <div className="grid w-full max-w-sm items-center gap-1.5">
                                <Label htmlFor="author">作者</Label>
                                <Input id="author" name="author" placeholder="可选" />
                            </div>

                            <div className="grid w-full max-w-sm items-center gap-1.5">
                                <Label htmlFor="description">简介</Label>
                                <Textarea id="description" name="description" placeholder="教材简介..." />
                            </div>
                        </>
                    ) : (
                        <div className="space-y-4">
                            <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 p-4">
                                <div className="flex">
                                    <div className="flex-shrink-0">
                                        <FileUp className="h-5 w-5 text-blue-400" aria-hidden="true" />
                                    </div>
                                    <div className="ml-3">
                                        <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">
                                            Mineru (Magic-PDF) 导入
                                        </h3>
                                        <div className="mt-2 text-sm text-blue-700 dark:text-blue-300">
                                            <p>
                                                请上传 Mineru 导出生成的 <strong>.zip</strong> 压缩包。
                                                系统将自动解析包含的 full.md 和 images 目录，保留完美的公式和排版。
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid w-full max-w-sm items-center gap-1.5">
                                <Label htmlFor="zipFile">Mineru 导出包 (.zip)</Label>
                                <Input id="zipFile" name="file" type="file" accept=".zip" required />
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button>
                        <Button type="submit" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            开始上传
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
