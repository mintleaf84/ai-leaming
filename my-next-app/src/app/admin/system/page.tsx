"use client";

import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { SystemStatus } from "./_components/types";
import { AICostCards } from "./_components/AICostCards";
import { ServerResources } from "./_components/ServerResources";
import { ModelRanking } from "./_components/ModelRanking";
import { DemoModePanel } from "./_components/DemoModePanel";
import { FeatureFlagsPanel } from "./_components/FeatureFlagsPanel";

const STATUS_KEY = "admin-system-status";

export default function SystemPage() {
  const queryClient = useQueryClient();

  // 5 秒轮询系统状态，React Query 自动管理缓存与重试
  const { data: status, isLoading: loading } = useQuery({
    queryKey: [STATUS_KEY],
    queryFn: async () => {
      const res = await fetch("/api/admin/system");
      if (!res.ok) throw new Error("获取系统状态失败");
      return (await res.json()) as SystemStatus;
    },
    refetchInterval: 5000,
  });

  const toggleDemoMode = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_demo_mode" }),
      });
      if (!res.ok) throw new Error("切换演示模式失败");
      return (await res.json()) as { demoMode: boolean };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [STATUS_KEY] }),
    onError: () => toast.error("切换演示模式失败"),
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: [STATUS_KEY] });

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
        <Button variant="outline" onClick={refresh}>
          刷新
        </Button>
      </div>

      <AICostCards status={status} />

      <div className="grid gap-4 md:grid-cols-7">
        <ServerResources status={status} />
        <ModelRanking byModel={status.ai?.byModel} />
        <DemoModePanel
          demoMode={status.demoMode ?? false}
          onToggleDemoMode={() => toggleDemoMode.mutate()}
          onRefresh={refresh}
        />
        <FeatureFlagsPanel />
      </div>
    </div>
  );
}
