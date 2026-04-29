'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Cpu, Coins, MessageSquare } from 'lucide-react';
import { SystemStatus } from './types';
import { formatBytes } from './utils';

interface AICostCardsProps {
    status: SystemStatus;
}

export function AICostCards({ status }: AICostCardsProps) {
    const memUsagePercent = ((status.os.memory.total - status.os.memory.free) / status.os.memory.total) * 100;

    return (
        <>
            <h3 className="text-lg font-semibold">AI 调用与成本 (今日)</h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">今日预估成本</CardTitle>
                        <Coins className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">¥{status.ai?.today?.totalCost?.toFixed(4) || '0.0000'}</div>
                        <p className="text-xs text-muted-foreground">
                            累计: ¥{status.ai?.total?.totalCost?.toFixed(2) || '0.00'}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">今日调用次数</CardTitle>
                        <MessageSquare className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{status.ai?.today?.totalCalls || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            Token消耗: {status.ai?.today?.totalTokens?.toLocaleString() || 0}
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
        </>
    );
}
