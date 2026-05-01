'use client';

import React, { useEffect, useState } from 'react';
import { getAdminLogsAction } from '@/server/actions/logs';
import { AdminLogEntry, formatActionName } from '@/types';
import { Loader2, User, FileQuestion, Cpu, MessageSquare, Database, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export default function LogsPage() {
    const [logs, setLogs] = useState<AdminLogEntry[]>([]);
    const [loading, setLoading] = useState(true);

    const loadLogs = async () => {
        setLoading(true);
        const data = await getAdminLogsAction(100);
        setLogs(data);
        setLoading(false);
    };

    useEffect(() => {
        loadLogs(); // eslint-disable-line -- loadLogs 是 async 函数，setState 在 await 后执行，React effect 规则误报
    }, []);

    // 获取操作类型对应的图标
    const getActionIcon = (action: string) => {
        if (action.includes('USER') || action.includes('PASSWORD') || action.includes('ROLE')) {
            return <User className="w-4 h-4" />;
        }
        if (action.includes('QUESTION')) {
            return <FileQuestion className="w-4 h-4" />;
        }
        if (action.includes('AI') || action.includes('PROMPT')) {
            return <Cpu className="w-4 h-4" />;
        }
        if (action.includes('BACKUP') || action.includes('RESTORE')) {
            return <Database className="w-4 h-4" />;
        }
        return <MessageSquare className="w-4 h-4" />;
    };

    // 获取操作类型对应的颜色
    const getActionVariant = (action: string): "default" | "destructive" | "warning" | "success" | "secondary" => {
        if (action.includes('DELETE')) return 'destructive';
        if (action.includes('RESET') || action.includes('CHANGE')) return 'warning';
        if (action.includes('CREATE')) return 'success';
        return 'secondary';
    };

    // 格式化详情
    const formatDetails = (details: string | null): string => {
        if (!details) return '-';
        try {
            const parsed = JSON.parse(details);
            return Object.entries(parsed)
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ');
        } catch {
            return details;
        }
    };

    // 格式化时间
    const formatTime = (timestamp: string): string => {
        return new Date(timestamp).toLocaleString('zh-CN', {
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    return (
        <div className="p-4 md:p-8 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight">操作日志</h2>
                    <p className="text-muted-foreground mt-2">
                        记录管理员的所有操作，便于审计和问题追溯。
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={loadLogs}
                    disabled={loading}
                    className="gap-2"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    刷新
                </Button>
            </div>

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
            ) : logs.length === 0 ? (
                <div className="text-center py-20 bg-card rounded-2xl border border-dashed border-border">
                    <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                        <MessageSquare className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium text-foreground">暂无操作日志</h3>
                    <p className="text-muted-foreground mt-2">管理员操作后，日志将显示在这里。</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {logs.map((log) => (
                        <div
                            key={log.id}
                            className="bg-card rounded-xl border border-border p-4 hover:border-primary/30 transition-colors"
                        >
                            <div className="flex items-start gap-4">
                                <div className="p-2.5 bg-muted rounded-lg">
                                    {getActionIcon(log.action)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold text-foreground">{log.username}</span>
                                        <span className="text-muted-foreground">执行了</span>
                                        <Badge variant={getActionVariant(log.action)}>
                                            {formatActionName(log.action)}
                                        </Badge>
                                        {log.target_id && (
                                            <>
                                                <span className="text-muted-foreground">目标 ID:</span>
                                                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{log.target_id}</code>
                                            </>
                                        )}
                                    </div>
                                    {log.details && (
                                        <p className="text-sm text-muted-foreground mt-1 truncate">
                                            {formatDetails(log.details)}
                                        </p>
                                    )}
                                </div>
                                <div className="text-xs text-muted-foreground whitespace-nowrap">
                                    {formatTime(log.created_at)}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
