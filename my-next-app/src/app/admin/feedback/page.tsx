'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { getFeedbackListAction, resolveFeedbackAction, dismissFeedbackAction, getFeedbackCountsAction } from '@/server/actions/admin';
import { Flag, RefreshCw, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface FeedbackItem {
    id: number;
    question_id: number;
    question_content: string | null;
    user_id: number;
    username: string | null;
    feedback_type: string;
    description: string | null;
    status: string;
    created_at: string | null;
    resolved_at: string | null;
}

const FEEDBACK_TYPE_LABELS: Record<string, string> = {
    wrong_answer: '答案有误',
    wrong_content: '题干有误',
    wrong_explanation: '解析有误',
    other: '其他问题',
};

const STATUS_LABELS: Record<string, string> = {
    pending: '待处理',
    resolved: '已解决',
    dismissed: '已忽略',
};

const STATUS_VARIANT: Record<string, 'default' | 'destructive' | 'warning' | 'success' | 'secondary'> = {
    pending: 'warning',
    resolved: 'success',
    dismissed: 'secondary',
};

export default function FeedbackPage() {
    const [items, setItems] = useState<FeedbackItem[]>([]);
    const [total, setTotal] = useState(0);
    const [counts, setCounts] = useState({ pending: 0, resolved: 0, dismissed: 0 });
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [page, setPage] = useState(0);
    const limit = 20;

    const loadData = useCallback(async () => {
        setLoading(true);
        const [listResult, countsResult] = await Promise.all([
            getFeedbackListAction({
                limit,
                offset: page * limit,
                status: statusFilter === 'all' ? undefined : statusFilter as 'pending' | 'resolved' | 'dismissed',
                feedback_type: typeFilter === 'all' ? undefined : typeFilter as 'wrong_answer' | 'wrong_content' | 'wrong_explanation' | 'other',
            }),
            getFeedbackCountsAction(),
        ]);
        if (listResult?.data) {
            setItems(listResult.data.items);
            setTotal(listResult.data.total);
        }
        if (countsResult?.data) {
            setCounts(countsResult.data);
        }
        setLoading(false);
    }, [page, statusFilter, typeFilter]);

    useEffect(() => {
        loadData(); // eslint-disable-line -- loadLogs 是 async 函数，setState 在 await 后执行，React effect 规则误报
    }, [loadData]);

    const handleResolve = async (id: number) => {
        const result = await resolveFeedbackAction(id);
        if (result?.data?.success) {
            toast.success('已标记为已解决');
            loadData();
        } else if (result?.serverError) {
            toast.error(result.serverError);
        }
    };

    const handleDismiss = async (id: number) => {
        const result = await dismissFeedbackAction(id);
        if (result?.data?.success) {
            toast.success('已忽略');
            loadData();
        } else if (result?.serverError) {
            toast.error(result.serverError);
        }
    };

    const formatTime = (timestamp: string | null) => {
        if (!timestamp) return '-';
        return new Date(timestamp).toLocaleString('zh-CN', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const totalPages = Math.ceil(total / limit);

    return (
        <div className="p-4 md:p-8 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight">纠错反馈</h2>
                    <p className="text-muted-foreground mt-2">管理用户提交的题目纠错反馈。</p>
                </div>
                <Button variant="outline" onClick={loadData} disabled={loading} className="gap-2">
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    刷新
                </Button>
            </div>

            {/* 状态卡片 */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-card rounded-xl border border-border p-4">
                    <div className="flex items-center gap-2 text-amber-500">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">待处理</span>
                    </div>
                    <p className="text-2xl font-bold mt-1">{counts.pending}</p>
                </div>
                <div className="bg-card rounded-xl border border-border p-4">
                    <div className="flex items-center gap-2 text-emerald-500">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">已解决</span>
                    </div>
                    <p className="text-2xl font-bold mt-1">{counts.resolved}</p>
                </div>
                <div className="bg-card rounded-xl border border-border p-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <XCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">已忽略</span>
                    </div>
                    <p className="text-2xl font-bold mt-1">{counts.dismissed}</p>
                </div>
            </div>

            {/* 筛选栏 */}
            <div className="flex gap-3 flex-wrap">
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
                    <SelectTrigger className="w-36">
                        <SelectValue placeholder="状态筛选" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">全部状态</SelectItem>
                        <SelectItem value="pending">待处理</SelectItem>
                        <SelectItem value="resolved">已解决</SelectItem>
                        <SelectItem value="dismissed">已忽略</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
                    <SelectTrigger className="w-36">
                        <SelectValue placeholder="类型筛选" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">全部类型</SelectItem>
                        <SelectItem value="wrong_answer">答案有误</SelectItem>
                        <SelectItem value="wrong_content">题干有误</SelectItem>
                        <SelectItem value="wrong_explanation">解析有误</SelectItem>
                        <SelectItem value="other">其他问题</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* 列表 */}
            {loading ? (
                <div className="space-y-4">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="bg-card rounded-xl border border-border p-4">
                            <div className="flex items-center gap-4">
                                <Skeleton className="h-10 w-10 rounded-full" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4 w-48" />
                                    <Skeleton className="h-3 w-32" />
                                </div>
                                <Skeleton className="h-6 w-20" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : items.length === 0 ? (
                <div className="text-center py-20 bg-card rounded-2xl border border-dashed border-border">
                    <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                        <Flag className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium text-foreground">暂无反馈</h3>
                    <p className="text-muted-foreground mt-2">用户提交反馈后将显示在这里。</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {items.map((item) => (
                        <div
                            key={item.id}
                            className="bg-card rounded-xl border border-border p-4 hover:border-primary/30 transition-colors"
                        >
                            <div className="flex items-start gap-4">
                                <div className="p-2.5 bg-muted rounded-lg">
                                    <Flag className="w-4 h-4 text-orange-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Badge variant={STATUS_VARIANT[item.status] || 'secondary'}>
                                            {STATUS_LABELS[item.status] || item.status}
                                        </Badge>
                                        <span className="text-sm font-medium">
                                            {FEEDBACK_TYPE_LABELS[item.feedback_type] || item.feedback_type}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            来自 {item.username || `用户${item.user_id}`}
                                        </span>
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                                        题目: {item.question_content || `#${item.question_id}`}
                                    </p>
                                    {item.description && (
                                        <p className="text-sm mt-1 text-foreground/80 bg-muted/50 px-2 py-1 rounded">
                                            {item.description}
                                        </p>
                                    )}
                                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                        <span>#{item.id}</span>
                                        <span>题目 ID: {item.question_id}</span>
                                        <span>{formatTime(item.created_at)}</span>
                                        {item.resolved_at && <span>处理于 {formatTime(item.resolved_at)}</span>}
                                    </div>
                                </div>
                                {item.status === 'pending' && (
                                    <div className="flex gap-2 shrink-0">
                                        <Button size="sm" onClick={() => handleResolve(item.id)} className="gap-1">
                                            <CheckCircle className="w-3.5 h-3.5" />
                                            已解决
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => handleDismiss(item.id)} className="gap-1">
                                            <XCircle className="w-3.5 h-3.5" />
                                            忽略
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* 分页 */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(Math.max(0, page - 1))}
                        disabled={page === 0}
                    >
                        上一页
                    </Button>
                    <span className="text-sm text-muted-foreground">
                        {page + 1} / {totalPages}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                        disabled={page >= totalPages - 1}
                    >
                        下一页
                    </Button>
                </div>
            )}
        </div>
    );
}
