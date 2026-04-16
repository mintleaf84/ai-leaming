'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Cpu, Clock, Database, Coins, MessageSquare, AlertCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { toggleGlobalFeatureFlag, getGlobalFeatureFlag } from '@/server/actions/feature-flags';
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
    demoMode?: boolean;
    appVersion: string;
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
    const [intelligentReviewEnabled, setIntelligentReviewEnabled] = useState(false);

    const loadFlags = async () => {
        const flag = await getGlobalFeatureFlag('ENABLE_INTELLIGENT_REVIEW', false);
        setIntelligentReviewEnabled(flag);
    };

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
        loadFlags();
        const interval = setInterval(loadStatus, 5000); // Poll every 5s
        return () => clearInterval(interval);
    }, []);

    const toggleDemoMode = async () => {
        try {
            const res = await fetch('/api/admin/system', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'toggle_demo_mode' })
            });
            if (res.ok) {
                const data = await res.json();
                setStatus(prev => prev ? { ...prev, demoMode: data.demoMode } : null);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const resetDemoSession = async () => {
        if (!confirm('确定要重置全站的演示会话数据吗？下次进入练习时将自动重新生成新剧本。')) return;
        try {
            const res = await fetch('/api/admin/system', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reset_demo_session' })
            });
            if (res.ok) {
                alert('演示会话数据已成功重置');
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleToggleIntelligentReview = async () => {
        const newVal = !intelligentReviewEnabled;
        const res = await toggleGlobalFeatureFlag('ENABLE_INTELLIGENT_REVIEW', newVal);
        if (res.success) {
            setIntelligentReviewEnabled(newVal);
            toast.success(newVal ? '智能复盘中断机制已开启' : '智能复盘中断机制已关闭');
        } else {
            toast.error(res.error || '切换失败');
        }
    };

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
                            <span className="text-sm font-medium">应用版本</span>
                            <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-primary/10 text-primary rounded-md">{status.appVersion}</span>
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

                {/* 演示模式控制 */}
                <Card className="md:col-span-7 border-blue-200 shadow-sm">
                    <CardHeader className="bg-blue-50/50">
                        <CardTitle className="flex items-center gap-2 text-blue-700">
                            <AlertCircle className="w-5 h-5" />
                            系统演示模式 (Demo Mode)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-6">
                        <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                            <div>
                                <h4 className="font-semibold mb-1">启用演示保护网关</h4>
                                <p className="text-sm text-muted-foreground max-w-3xl">
                                    开启后，无论前台学员点击何种类型练习，系统均会锁定并派发其专有的首个“固定出题剧本”。多次退出重进会自动清理进度并原样复现，彻底掐断现场网络波动风险。
                                </p>
                            </div>
                            <Button
                                variant={status.demoMode ? "destructive" : "default"}
                                onClick={toggleDemoMode}
                                className="min-w-[140px]"
                            >
                                {status.demoMode ? '停用演示模式' : '启用演示模式'}
                            </Button>
                        </div>
                        <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                            <div>
                                <h4 className="font-semibold mb-1">重置演示库数据</h4>
                                <p className="text-sm text-muted-foreground max-w-3xl">
                                    强制剔除数据库中已派配的路演会话 (is_demo=1)。如果想为下一场路演换另外一批题目进行彩排，请点击此按钮。
                                </p>
                            </div>
                            <Button variant="outline" onClick={resetDemoSession}>
                                重置并重新生成套题
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* 功能开关实验场 */}
                <Card className="md:col-span-7 border-purple-200 shadow-sm">
                    <CardHeader className="bg-purple-50/50">
                        <CardTitle className="flex items-center gap-2 text-purple-700">
                            <Sparkles className="w-5 h-5" />
                            核心功能实验场 (Feature Flags)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-6">
                        <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                            <div>
                                <h4 className="font-semibold mb-1">强制打断与复盘机制 (Intelligent Review)</h4>
                                <p className="text-sm text-muted-foreground max-w-3xl">
                                    【练习页降级保护】：当关闭时，前端会短路状态机，屏蔽由于错题积攒触发的强制复盘（知识点研读、变式、盲区等界面），让学员专注于连续刷题，直接进入成绩结算。适用于路演或希望练习流畅度优先的场景。
                                </p>
                            </div>
                            <Button
                                variant={intelligentReviewEnabled ? "default" : "outline"}
                                onClick={handleToggleIntelligentReview}
                                className={intelligentReviewEnabled ? "bg-purple-600 hover:bg-purple-700" : ""}
                            >
                                {intelligentReviewEnabled ? '已开启自动复盘' : '已降级为纯净刷题'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
