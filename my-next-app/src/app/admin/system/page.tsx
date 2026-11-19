"use client";

import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppQuery } from "@/hooks/useAppQuery";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { SystemStatus } from "./_components/types";
import { AICostCards } from "./_components/AICostCards";
import { ServerResources } from "./_components/ServerResources";
import { ModelRanking } from "./_components/ModelRanking";
import { DemoModePanel } from "./_components/DemoModePanel";
import { FeatureFlagsPanel } from "./_components/FeatureFlagsPanel";
import { ErrorState } from "@/components/ui/error-state";
import { MaintenancePanel } from "./_components/MaintenancePanel";

const STATUS_KEY = "admin-system-status";

export default function SystemPage() {
  const queryClient = useQueryClient();

  // 5 秒轮询系统状态，React Query 自动管理缓存与重试
  const {
    data: status,
    isLoading: loading,
    isError,
    error,
    refetch,
  } = useAppQuery({
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

  return (
    <div className="p-8 space-y-8">
      {/* 数据维护独立于监控接口：/system 失败时仍要能预检/执行清理 */}
      <MaintenancePanel />

      {loading && !status ? (
        <div>加载中...</div>
      ) : isError ? (
        <ErrorState
          title="系统信息加载失败"
          description={
            error instanceof Error && error.message
              ? `系统信息读取失败。（${error.message}）`
              : "系统信息读取失败。"
          }
          onRetry={() => void refetch()}
        />
      ) : !status ? (
        <div>无法获取系统状态</div>
      ) : (
        <>
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
                系统监控
              </h1>
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
        </>
      )}
    </div>
  );
}
