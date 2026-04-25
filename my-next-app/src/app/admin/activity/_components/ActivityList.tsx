'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

dayjs.extend(utc);
dayjs.extend(relativeTime);
dayjs.locale('zh-cn');
import { getUserActivityAction, UserActivityEntry, ActivityFilters } from '@/server/actions/activity';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
    Search, CheckCircle2, XCircle, Clock, User, 
    RefreshCw, ChevronLeft, ChevronRight,
    Loader2
} from "lucide-react";
import { toast } from "sonner";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export function ActivityList() {
    const [activities, setActivities] = useState<UserActivityEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const pageSize = 20;

    const [filters, setFilters] = useState<ActivityFilters>({
        search: '',
        isCorrect: undefined
    });

    const loadActivities = useCallback(async (currentPage = page, currentFilters = filters) => {
        setLoading(true);
        try {
            const offset = (currentPage - 1) * pageSize;
            const res = await getUserActivityAction(pageSize, offset, currentFilters);
            setActivities(res.logs);
            setTotal(res.total);
        } catch (_error) {
            toast.error("加载记录失败");
        } finally {
            setLoading(false);
        }
    }, [page, filters]);

    useEffect(() => {
        loadActivities();
        // 自动刷新逻辑
        const timer = setInterval(() => {
            if (page === 1 && !filters.search) {
                loadActivities(1, filters);
            }
        }, 30000); // 30s 自动刷新首页
        return () => clearInterval(timer);
    }, [loadActivities, page, filters]);

    const handleSearch = () => {
        setPage(1);
        loadActivities(1, filters);
    };

    const formatDuration = (ms: number) => {
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    };

    const getTimeAgo = (timestamp: string) => {
        return dayjs.utc(timestamp).fromNow();
    };

    return (
        <div className="space-y-4">
            {/* 顶栏控制 */}
            <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-card p-4 rounded-xl border border-border">
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="搜索用户或题目..."
                            className="pl-9"
                            value={filters.search}
                            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        />
                    </div>
                    <Select
                        value={filters.isCorrect === undefined ? 'all' : String(filters.isCorrect)}
                        onValueChange={(val) => setFilters(prev => ({ 
                            ...prev, 
                            isCorrect: val === 'all' ? undefined : (val === 'true') 
                        }))}
                    >
                        <SelectTrigger className="w-[120px]">
                            <SelectValue placeholder="结果" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">所有结果</SelectItem>
                            <SelectItem value="true">正确</SelectItem>
                            <SelectItem value="false">错误</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="secondary" onClick={handleSearch} disabled={loading}>
                        刷 筛选
                    </Button>
                </div>
                <Button variant="ghost" size="icon" onClick={() => loadActivities()} disabled={loading}>
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </div>

            {/* 流水列表 */}
            <div className="space-y-3">
                {loading && activities.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                        <Loader2 className="w-8 h-8 animate-spin mb-4" />
                        <p>正在拉取最新练习流...</p>
                    </div>
                ) : activities.length === 0 ? (
                    <div className="text-center py-20 bg-card rounded-2xl border border-dashed border-border text-muted-foreground">
                        暂无行为记录
                    </div>
                ) : (
                    activities.map((log) => (
                        <div 
                            key={log.id} 
                            className="group bg-card hover:bg-card/80 border border-border p-4 rounded-xl shadow-sm transition-all hover:shadow-md"
                        >
                            <div className="flex items-start gap-4">
                                <div className={`p-2 rounded-lg ${log.is_correct ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                                    {log.is_correct ? (
                                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                                    ) : (
                                        <XCircle className="w-5 h-5 text-red-500" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                        <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary hover:bg-primary/10">
                                            <User className="w-3 h-3 mr-1" />
                                            {log.username}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">
                                            {log.is_correct ? '回答正确' : '回答错误'}
                                        </span>
                                        <Badge variant="secondary" className="text-[10px] uppercase font-bold py-0 h-5">
                                            {log.dimension === 'knowledge' ? '识记' : log.dimension === 'application' ? '应用' : '理解'}
                                        </Badge>
                                    </div>
                                    <div className="text-sm font-medium text-foreground line-clamp-1 mb-2" title={log.question_content}>
                                        {log.question_content}
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            耗时 {formatDuration(log.duration_ms)}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            用户答案: <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">{log.user_answer}</span>
                                        </span>
                                    </div>
                                </div>
                                <div className="text-right flex flex-col justify-between h-full min-w-[70px]">
                                    <span className="text-[10px] text-muted-foreground font-medium">
                                        {getTimeAgo(log.timestamp)}
                                    </span>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 self-end opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Search className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* 分页控制 */}
            {total > pageSize && (
                <div className="flex justify-between items-center bg-card p-4 rounded-xl border border-border">
                    <div className="text-xs text-muted-foreground">
                        共 {total} 条记录
                    </div>
                    <div className="flex items-center gap-4">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page === 1 || loading}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                        >
                            <ChevronLeft className="w-4 h-4 mr-2" />
                            上一页
                        </Button>
                        <span className="text-sm font-bold">{page} / {Math.ceil(total / pageSize)}</span>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page * pageSize >= total || loading}
                            onClick={() => setPage(p => p + 1)}
                        >
                            下一页
                            <ChevronRight className="w-4 h-4 ml-2" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
