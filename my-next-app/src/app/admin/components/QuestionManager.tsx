"use client";

import React, { useState, useEffect, useRef } from 'react';
import { getQuestionsAction, importQuestionsAction, deleteQuestionAction } from '@/server/actions/admin';
import { Button } from '@/components/ui/button';
import { Trash2, Upload, Database } from 'lucide-react';
import { toast } from 'sonner';

export function QuestionManager() {
    const [questions, setQuestions] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadQuestions();
    }, []);

    const loadQuestions = async () => {
        setLoading(true);
        try {
            const res = await getQuestionsAction(100, 0);
            setQuestions(res.questions);
            setTotal(res.total);
        } catch (e) {
            toast.error("题目列表加载失败");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("确定要删除这道题目吗？此操作不可恢复。")) return;
        const res = await deleteQuestionAction(id);
        if (res.success) {
            toast.success("题目已删除");
            loadQuestions();
        } else {
            toast.error("删除失败");
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                toast.info("正在导入...", { duration: 1000 });
                const res = await importQuestionsAction(json);
                if (res.success) {
                    toast.success(`成功导入 ${res.count} 道题目`);
                    loadQuestions();
                } else {
                    toast.error(`导入失败: ${res.error}`);
                }
            } catch (e) {
                toast.error("无效的 JSON 文件格式");
            }
            if (fileInputRef.current) fileInputRef.current.value = "";
        };
        reader.readAsText(file);
    };

    return (
        <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex flex-col sm:flex-row justify-between items-start sm:items-center bg-muted/30 gap-4">
                <span className="text-sm text-muted-foreground font-medium">
                    题库总数: <span className="text-blue-600 dark:text-blue-400">{total}</span>
                </span>
                <div className="flex gap-3 w-full sm:w-auto">
                    <Button variant="outline" size="sm" onClick={() => loadQuestions()} disabled={loading} className="flex-1 sm:flex-none">
                        刷新列表
                    </Button>
                    <div className="relative flex-1 sm:flex-none">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            accept=".json"
                            className="hidden"
                        />
                        <Button size="sm" onClick={() => fileInputRef.current?.click()} className="w-full">
                            <Upload className="w-4 h-4 mr-2" />
                            导入 JSON
                        </Button>
                    </div>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-muted text-muted-foreground uppercase font-medium">
                        <tr>
                            <th className="p-4 w-16">ID</th>
                            <th className="p-4">题干内容</th>
                            <th className="p-4 w-32">标签</th>
                            <th className="p-4 w-24">维度</th>
                            <th className="p-4 w-24 text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {questions.map((q) => (
                            <tr key={q.id} className="hover:bg-muted/50 transition-colors">
                                <td className="p-4 text-muted-foreground">#{q.id}</td>
                                <td className="p-4 font-medium text-foreground max-w-lg truncate" title={q.content}>
                                    {q.content}
                                </td>
                                <td className="p-4">
                                    <div className="flex flex-wrap gap-1">
                                        {q.tags?.map((t: string) => (
                                            <span key={t} className="px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs rounded-full">
                                                {t}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                <td className="p-4 text-muted-foreground">
                                    {q.dimension === 'knowledge' ? '识记' : q.dimension === 'application' ? '应用' : '理解'}
                                </td>
                                <td className="p-4 text-right">
                                    <button
                                        onClick={() => handleDelete(q.id)}
                                        className="text-muted-foreground hover:text-destructive p-2 transition-colors"
                                        title="删除"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {questions.length === 0 && !loading && (
                            <tr>
                                <td colSpan={5} className="p-8 text-center text-muted-foreground">
                                    暂无题目。请尝试导入 JSON 文件。
                                </td>
                            </tr>
                        )}
                        {loading && questions.length === 0 && (
                            <tr>
                                <td colSpan={5} className="p-8 text-center text-muted-foreground">
                                    加载中...
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
