'use client';

import React, { useEffect, useState } from 'react';
import { BackupManager } from '../components/BackupManager';
import { getHealthStatsAction } from '@/server/actions/health';
import { HealthStats } from '@/lib/health-service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
    Database,
    HardDrive,
    Cpu,
    MemoryStick,
    Clock,
    RefreshCw,
    Table,
    Activity,
    Banknote
} from 'lucide-react';

export default function SystemPage() {
    const [health, setHealth] = useState<HealthStats | null>(null);
    const [loading, setLoading] = useState(true);

    const loadHealth = async () => {
        setLoading(true);
        try {
            const data = await getHealthStatsAction();
            setHealth(data);
        } catch (e) {
            console.error('Failed to load health stats:', e);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadHealth();
        // 每30秒自动刷新
        const interval = setInterval(loadHealth, 30000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="p-4 md:p-8 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight">系统运维</h2>
                    <p className="text-muted-foreground mt-2">
                        管理系统数据安全，监控系统运行状态。
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={loadHealth}
                    disabled={loading}
                    className="gap-2"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    刷新
                </Button>
            </div>

            {/* 系统健康监控面板 */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {/* 数据库大小 */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">数据库大小</CardTitle>
                        <Database className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">{health?.database.sizeFormatted || '-'}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    SQLite 数据库文件
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* 总数据量 */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">总数据量</CardTitle>
                        <Table className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">{health?.database.totalRows.toLocaleString() || 0} 行</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    来自 {health?.database.tables.length || 0} 个数据表
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* 内存使用 */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">内存使用</CardTitle>
                        <MemoryStick className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">{health?.system.memoryUsage.formatted.heapUsed || '-'}</div>
                                <div className="mt-2">
                                    <Progress
                                        value={health ? (health.system.memoryUsage.heapUsed / health.system.memoryUsage.heapTotal) * 100 : 0}
                                        className="h-2"
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    共 {health?.system.memoryUsage.formatted.heapTotal || '-'}
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* 运行时间 */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">运行时间</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">{health?.system.uptimeFormatted || '-'}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Node {health?.system.nodeVersion || '-'}
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* API 调用统计 */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {/* 今日调用 */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">今日 API 调用</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">{health?.apiStats.today.totalCalls || 0}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    成功 {health?.apiStats.today.successCalls || 0} / 失败 {health?.apiStats.today.errorCalls || 0}
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* 总调用 */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">累计 API 调用</CardTitle>
                        <Cpu className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">{health?.apiStats.total.totalCalls.toLocaleString() || 0}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    历史所有调用
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* 今日 Token */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">今日 Token</CardTitle>
                        <Database className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">
                                    {health?.apiStats.today.totalTokens ?
                                        (health.apiStats.today.totalTokens >= 1000 ?
                                            (health.apiStats.today.totalTokens / 1000).toFixed(1) + 'K' :
                                            health.apiStats.today.totalTokens)
                                        : 0}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    输入 + 输出 Token
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* 累计 Token */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">累计 Token</CardTitle>
                        <HardDrive className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">
                                    {health?.apiStats.total.totalTokens ?
                                        (health.apiStats.total.totalTokens >= 1000000 ?
                                            (health.apiStats.total.totalTokens / 1000000).toFixed(2) + 'M' :
                                            health.apiStats.total.totalTokens >= 1000 ?
                                                (health.apiStats.total.totalTokens / 1000).toFixed(1) + 'K' :
                                                health.apiStats.total.totalTokens)
                                        : 0}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    历史所有消耗
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* 今日成本 */}
                <Card className="border-primary/20 bg-primary/5">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">今日预估成本</CardTitle>
                        <Banknote className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold text-primary">
                                    ¥{health?.apiStats.today.totalCost.toFixed(4) || '0.0000'}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    按调用配置估算
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* 累计成本 */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">累计预估成本</CardTitle>
                        <Banknote className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">
                                    ¥{health?.apiStats.total.totalCost.toFixed(2) || '0.00'}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    全周期预估支出
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* 表统计详情 */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="w-5 h-5" />
                        数据表统计
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                            {[...Array(6)].map((_, i) => (
                                <Skeleton key={i} className="h-10 w-full" />
                            ))}
                        </div>
                    ) : (
                        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                            {health?.database.tables.map((table) => (
                                <div
                                    key={table.name}
                                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                                >
                                    <code className="text-sm font-mono">{table.name}</code>
                                    <Badge variant="secondary">
                                        {table.rowCount.toLocaleString()} 行
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* 备份管理 */}
            <BackupManager />
        </div>
    );
}
