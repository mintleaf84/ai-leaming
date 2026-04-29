'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { SystemStatus } from './_components/types';
import { AICostCards } from './_components/AICostCards';
import { ServerResources } from './_components/ServerResources';
import { ModelRanking } from './_components/ModelRanking';
import { DemoModePanel } from './_components/DemoModePanel';
import { FeatureFlagsPanel } from './_components/FeatureFlagsPanel';

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
        } catch {
            toast.error('获取系统状态失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStatus();
        const interval = setInterval(loadStatus, 5000);
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
        } catch {
            toast.error('切换演示模式失败');
        }
    };

    if (loading && !status) return <div className="p-8">加载中...</div>;
    if (!status) return <div className="p-8">无法获取系统状态</div>;

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

            <AICostCards status={status} />

            <div className="grid gap-4 md:grid-cols-7">
                <ServerResources status={status} />
                <ModelRanking byModel={status.ai?.byModel} />
                <DemoModePanel
                    demoMode={status.demoMode ?? false}
                    onToggleDemoMode={toggleDemoMode}
                    onRefresh={loadStatus}
                />
                <FeatureFlagsPanel />
            </div>
        </div>
    );
}
