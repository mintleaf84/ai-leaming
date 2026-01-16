'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Cpu, Clock, Database, Coins, MessageSquare, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

type SystemStatus = {
    os: {
        platform: string;
        release: string;
        uptime: number;
        loadavg: number[];
        cpus: number;
        memory: {
            total: number;
            free: number;
        };
    };
    db: {
        size: number;
    };
    process: {
        uptime: number;
        memory: {
            heapUsed: number;
            rss: number;
        };
        version: string;
    };
    ai: {
        today: {
            totalCalls: number;
            successCalls: number;
            totalCost: number;
            totalTokens: number;
        };
        total: {
            totalCalls: number;
            successCalls: number;
            totalCost: number;
            totalTokens: number;
        };
        byModel: {
            model: string;
            calls: number;
            tokens: number;
            cost: number;
        }[];
    };
    timestamp: number;
};

function formatBytes(bytes: number) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(seconds: number) {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}天 ${h}小时 ${m}分`;
}

export default function SystemPage() {
    const [status, setStatus] = useState<SystemStatus | null>(null);
    const [loading, setLoading] = useState(true);

    const loadStatus = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/system');
            if (!res.ok) throw new Error('Failed to fetch');
            const data = await res.json();
            setStatus(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStatus();
        const interval = setInterval(loadStatus, 5000); // Poll every 5s
        return () => clearInterval(interval);
    }, []);

    if (loading && !status) return <div className="p-8">加载中...</div>;
    if (!status) return <div className="p-8">无法获取系统状态</div>;

    const memUsagePercent = ((status.os.memory.total - status.os.memory.free) / status.os.memory.total) * 100;

    return (
        <div className="p-8 space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">系统监控</h2>
                    <p className="text-muted-foreground mt-2">
                        实时服务器资源、AI 成本与健康状态
                    </p>
                </div>
                <Button variant="outline" onClick={loadStatus}>刷新</Button>
            </div>

            {/* AI 成本概览 */}
            <h3 className="text-lg font-semibold">AI 调用与成本 (今日)</h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">今日预估成本</CardTitle>
                        <Coins className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">¥{status.ai?.today.totalCost.toFixed(4) || '0.0000'}</div>
                        <p className="text-xs text-muted-foreground">
                            累计: ¥{status.ai?.total.totalCost.toFixed(2)}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">今日调用次数</CardTitle>
                        <MessageSquare className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{status.ai?.today.totalCalls || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            Token消耗: {status.ai?.today.totalTokens.toLocaleString()}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">系统负载 (1min)</CardTitle>
                        <Cpu className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{status.os.loadavg[0].toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">
                            {status.os.cpus} Cores
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">内存使用率</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{memUsagePercent.toFixed(1)}%</div>
                        <p className="text-xs text-muted-foreground">
                            {formatBytes(status.os.memory.total - status.os.memory.free)} / {formatBytes(status.os.memory.total)}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-7">
                {/* 资源详情 - 左侧 */}
                <Card className="md:col-span-3">
                    <CardHeader>
                        <CardTitle>服务器资源</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between items-center border-b pb-2">
                            <span className="text-sm font-medium flex items-center gap-2">
                                <Clock className="w-3.5 h-3.5" /> 运行时间
                            </span>
                            <span className="font-mono text-sm">{formatDuration(status.os.uptime)}</span>
                        </div>
                        <div className="flex justify-between items-center border-b pb-2">
                            <span className="text-sm font-medium flex items-center gap-2">
                                <Database className="w-3.5 h-3.5" /> 数据库体积
                            </span>
                            <span className="font-mono text-sm">{formatBytes(status.db.size)}</span>
                        </div>
                        <div className="flex justify-between items-center border-b pb-2">
                            <span className="text-sm font-medium">Node 内存 (Heap)</span>
                            <span className="font-mono text-sm">{formatBytes(status.process.memory.heapUsed)}</span>
                        </div>
                        <div className="flex justify-between items-center border-b pb-2">
                            <span className="text-sm font-medium">Node 内存 (RSS)</span>
                            <span className="font-mono text-sm">{formatBytes(status.process.memory.rss)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-2">
                            <span className="text-sm font-medium">操作系统</span>
                            <span className="font-mono text-xs text-muted-foreground">{status.os.platform} ({status.os.release})</span>
                        </div>
                    </CardContent>
                </Card>

                {/* 模型消耗排行 - 右侧 */}
                <Card className="md:col-span-4">
                    <CardHeader>
                        <CardTitle>模型消耗排行</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>模型</TableHead>
                                    <TableHead className="text-right">调用</TableHead>
                                    <TableHead className="text-right">Tokens</TableHead>
                                    <TableHead className="text-right">总成本</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {status.ai?.byModel.map((m) => (
                                    <TableRow key={m.model}>
                                        <TableCell className="font-medium text-xs">{m.model}</TableCell>
                                        <TableCell className="text-right text-xs">{m.calls}</TableCell>
                                        <TableCell className="text-right text-xs">{m.tokens.toLocaleString()}</TableCell>
                                        <TableCell className="text-right font-bold text-xs">¥{m.cost.toFixed(3)}</TableCell>
                                    </TableRow>
                                ))}
                                {(!status.ai?.byModel || status.ai.byModel.length === 0) && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center text-muted-foreground h-24">
                                            暂无调用记录
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
