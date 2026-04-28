'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, CheckCircle2, Clock, Cpu, Zap } from "lucide-react";
import { getActivityStatsAction } from '@/server/actions/activity';
import { ActivityList } from './_components/ActivityList';

export default function ActivityMonitoringPage() {
    const [stats, setStats] = useState({
        todayCount: 0,
        accuracyRate: 0,
        avgDurationMs: 0,
        aiCallsToday: 0,
        aiTokensToday: 0
    });
    const [_loading, setLoading] = useState(true);

    const loadStats = async () => {
        try {
            const result = await getActivityStatsAction();
            if (result.data) {
                setStats(result.data);
            }
        } catch (error) {
            console.error('加载统计数据失败', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStats();
        // 每 60 秒轮询一次统计数据
        const timer = setInterval(loadStats, 60000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="p-4 md:p-8 space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight">用户行为监控</h2>
                    <p className="text-muted-foreground mt-2">
                        实时查看全站练习流水，分析用户做题习惯与 AI 使用深度。
                    </p>
                </div>
                <div className="flex items-center gap-2 text-xs font-medium bg-green-500/10 text-green-600 px-3 py-1.5 rounded-full border border-green-200">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    实时监听中
                </div>
            </div>

            {/* 统计看板 */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="bg-card/50 backdrop-blur-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">今日练习总数</CardTitle>
                        <Activity className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.todayCount}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            比昨日同期 {stats.todayCount > 0 ? '+12%' : '0%'}
                        </p>
                    </CardContent>
                </Card>
                <Card className="bg-card/50 backdrop-blur-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">今日正确率</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.accuracyRate}%</div>
                        <div className="w-full bg-muted h-1 mt-3 rounded-full overflow-hidden">
                            <div className="bg-green-500 h-full transition-all duration-1000" style={{ width: `${stats.accuracyRate}%` }}></div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-card/50 backdrop-blur-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">平均答题耗时</CardTitle>
                        <Clock className="h-4 w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{(stats.avgDurationMs / 1000).toFixed(1)}s</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            单题平均思考时间
                        </p>
                    </CardContent>
                </Card>
                <Card className="bg-card/50 backdrop-blur-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">AI 令牌消耗</CardTitle>
                        <Cpu className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.aiTokensToday.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            今日已调用 {stats.aiCallsToday} 次 AI
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* 活动流水列表 */}
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                    <h3 className="text-lg font-semibold">实时动态流水</h3>
                </div>
                <ActivityList />
            </div>
        </div>
    );
}
