"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Save, RefreshCw, Network, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  getAiConfigsAction,
  getAiModelRoutesAction,
  saveAiModelRouteAction,
} from "@/server/actions/config";
import type { AiConfig, AiModelRoute } from "@/lib/services/ai-config";
import { ErrorState } from "@/components/ui/error-state";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** 单条路由的编辑草稿：与「已保存值」(`routes`) 完全分开，取消/失败都不会污染已保存态 */
type RouteDraft = { config_id: number | null; model_name: string };

export function RouteManager() {
  const [configs, setConfigs] = useState<AiConfig[]>([]);
  const [routes, setRoutes] = useState<AiModelRoute[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // 正在保存的 feature（只为该行/该卡片禁用输入，避免"提交了旧快照又继续改"）
  const [savingFeature, setSavingFeature] = useState<string | null>(null);
  // 草稿（key = feature）：输入只写这里，routes 只由服务端数据写入
  const [drafts, setDrafts] = useState<Record<string, RouteDraft>>({});
  // 卡片投影的编辑态（桌面表格是常驻行内输入，卡片默认只读、点「编辑」才出输入框）
  const [editingFeature, setEditingFeature] = useState<string | null>(null);
  // 加载失败要显式呈现，否则用户会把"加载失败"误读成"没有路由"
  const [loadError, setLoadError] = useState<string | null>(null);
  // 请求序号：保存前发出的刷新晚返回时，不能覆盖保存后的状态
  const reqIdRef = useRef(0);

  const features = [
    {
      id: "premium",
      name: "高级对话 (Premium)",
      desc: "用于深度解析、回归测试、复杂逻辑生成",
    },
    {
      id: "economy",
      name: "经济对话 (Economy)",
      desc: "用于标题生成、简单纠偏、快速反馈",
    },
    {
      id: "embedding",
      name: "向量嵌入 (Embedding)",
      desc: "用于知识库索引和检索匹配",
    },
    {
      id: "rerank",
      name: "重排序 (Rerank)",
      desc: "用于检索后的二次精排，提升准确率",
    },
    {
      id: "knowledge",
      name: "知识提取 (Knowledge)",
      desc: "用于从对话中自动提取和整理知识点",
    },
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const reqId = ++reqIdRef.current;
    setIsLoading(true);
    try {
      const [configsResult, routesResult] = await Promise.all([
        getAiConfigsAction(),
        getAiModelRoutesAction(),
      ]);
      // 已有更新的请求在飞：本次结果（含错误）一律丢弃
      if (reqId !== reqIdRef.current) return;
      if (configsResult.data) setConfigs(configsResult.data);
      if (routesResult.data) setRoutes(routesResult.data);
      setLoadError(null);
    } catch (e) {
      if (reqId !== reqIdRef.current) return;
      console.error("加载模型路由配置失败", e);
      setLoadError(e instanceof Error ? e.message : "请求失败");
      return;
    } finally {
      // 只有最新请求能收 loading，否则旧请求提前关掉会露出未就绪的 UI
      if (reqId === reqIdRef.current) setIsLoading(false);
    }
  };

  /** 已保存值（服务端数据），草稿的回退基准 */
  const getSavedRoute = (feature: string) =>
    routes.find((r) => r.feature === feature);

  /** 当前展示值：有草稿用草稿，没有草稿用已保存值 */
  const getDraft = (feature: string): RouteDraft => {
    const draft = drafts[feature];
    if (draft) return draft;
    const saved = getSavedRoute(feature);
    return {
      config_id: saved?.config_id ?? null,
      model_name: saved?.model_name ?? "",
    };
  };

  /** 写草稿：只增改这一条，绝不触碰 routes */
  const patchDraft = (feature: string, patch: Partial<RouteDraft>) => {
    setDrafts((prev) => {
      const saved = routes.find((r) => r.feature === feature);
      const base: RouteDraft = prev[feature] ?? {
        config_id: saved?.config_id ?? null,
        model_name: saved?.model_name ?? "",
      };
      return { ...prev, [feature]: { ...base, ...patch } };
    });
  };

  /** 丢弃草稿：routes 从未被污染，删掉草稿即天然恢复已保存态 */
  const discardDraft = (feature: string) => {
    setDrafts((prev) => {
      if (!(feature in prev)) return prev;
      const next = { ...prev };
      delete next[feature];
      return next;
    });
  };

  /** 该 feature 在该服务商下的默认模型（切换服务商时自动带出） */
  const getDefaultModel = (feature: string, config: AiConfig) =>
    feature === "premium"
      ? config.model_premium
      : feature === "economy"
        ? config.model_economy
        : feature === "embedding"
          ? config.model_embedding || ""
          : feature === "rerank"
            ? config.model_rerank || ""
            : feature === "knowledge"
              ? config.model_knowledge || ""
              : "";

  /**
   * 选择服务商：写草稿的 config_id，并带出该服务商在该功能下的默认模型。
   * 表格与卡片两套投影共用（不能各写一份）。
   */
  const handleConfigSelect = (feature: string, raw: string) => {
    const configId = raw === "" ? null : Number(raw);
    patchDraft(feature, { config_id: configId });
    const config = configs.find((c) => c.id === configId);
    if (config)
      patchDraft(feature, { model_name: getDefaultModel(feature, config) });
  };

  const getConfigName = (route?: AiModelRoute) =>
    configs.find((c) => c.id === route?.config_id)?.name || "未选择";

  const handleSaveRoute = async (feature: string): Promise<boolean> => {
    // 提交的是「此刻草稿的快照」：保存期间用户继续改的内容不会混进这次请求
    const snapshot = getDraft(feature);
    if (!snapshot.config_id) {
      toast.error("请先选择服务商");
      return false;
    }

    setSavingFeature(feature);
    try {
      const res = await saveAiModelRouteAction({
        feature,
        config_id: snapshot.config_id,
        model_name: snapshot.model_name,
      });
      if (res.data?.success) {
        toast.success(`${feature} 路由已更新`);
        // 只清理「仍等于本次快照」的草稿：用户在保存期间又改过就保留新草稿
        setDrafts((prev) => {
          const current = prev[feature];
          if (!current) return prev;
          if (
            current.config_id !== snapshot.config_id ||
            current.model_name !== snapshot.model_name
          ) {
            return prev;
          }
          const next = { ...prev };
          delete next[feature];
          return next;
        });
        void loadData();
        return true;
      }
      toast.error("保存失败");
      return false;
    } catch (e) {
      console.error("保存模型路由失败", e);
      toast.error("保存失败：" + (e instanceof Error ? e.message : "请求异常"));
      return false;
    } finally {
      setSavingFeature(null);
    }
  };

  /** 卡片进入编辑态：用「已保存值」初始化草稿，取消时删草稿即回到已保存态 */
  const startEdit = (feature: string) => {
    const saved = getSavedRoute(feature);
    setDrafts((prev) => ({
      ...prev,
      [feature]: {
        config_id: saved?.config_id ?? null,
        model_name: saved?.model_name ?? "",
      },
    }));
    setEditingFeature(feature);
  };

  const cancelEdit = (feature: string) => {
    discardDraft(feature);
    setEditingFeature(null);
  };

  // 行内控件的公共外观：表格档紧凑（py-1），卡片档按触控尺寸（h-11）
  const fieldBase =
    "w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary";

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-card p-6 rounded-xl shadow-sm border border-border">
          {/* 表格骨架：lg 起 */}
          <div className="hidden space-y-2 lg:block">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton
                key={`route-table-skeleton-${i}`}
                className="h-12 w-full rounded-lg"
              />
            ))}
          </div>
          {/* 卡片骨架：< lg */}
          <div className="space-y-2 lg:hidden">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton
                key={`route-card-skeleton-${i}`}
                className="h-20 w-full rounded-lg"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-4xl mx-auto">
        <ErrorState
          title="路由配置加载失败"
          description={loadError}
          onRetry={() => void loadData()}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-card p-6 rounded-xl shadow-sm border border-border">
        <div className="flex flex-wrap justify-between items-start gap-3 mb-6 sm:items-center">
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center">
              <Network className="w-5 h-5 mr-2 text-blue-500" />
              模型路由设置
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              为不同的系统功能分配特定的服务商和模型，实现多服务商混合负载。
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-11 sm:h-9"
            onClick={loadData}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
        </div>

        {/*
          桌面（lg 起）：4 列行内编辑表格；< lg 走卡片投影。
          与 /admin/users 一致把表格下限收紧到 lg —— md 档减掉 admin 侧边栏
          只剩约 512px，两列输入框会被压到无法录入。
        */}
        <div
          className="hidden rounded-lg border lg:block"
          data-testid="admin-ai-routes-table"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>功能模块</TableHead>
                <TableHead className="w-52">服务商 (Provider)</TableHead>
                <TableHead className="w-56">模型名称 (Model)</TableHead>
                <TableHead className="w-24 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {features.map((feat) => {
                const draft = getDraft(feat.id);
                const isRowSaving = savingFeature === feat.id;

                return (
                  <TableRow key={feat.id}>
                    <TableCell>
                      <div className="font-semibold text-foreground">
                        {feat.name}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {feat.desc}
                      </div>
                    </TableCell>
                    <TableCell>
                      <select
                        aria-label={`${feat.name} 的服务商`}
                        className={cn(fieldBase, "py-1")}
                        value={draft.config_id ?? ""}
                        disabled={isRowSaving}
                        onChange={(e) =>
                          handleConfigSelect(feat.id, e.target.value)
                        }
                      >
                        <option value="">未选择</option>
                        {configs.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.is_active ? "(默认)" : ""}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell>
                      <input
                        type="text"
                        aria-label={`${feat.name} 的模型名称`}
                        className={cn(fieldBase, "py-1")}
                        value={draft.model_name}
                        disabled={isRowSaving}
                        onChange={(e) =>
                          patchDraft(feat.id, { model_name: e.target.value })
                        }
                        placeholder="模型标识符"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isRowSaving}
                        aria-label={`保存 ${feat.name} 的路由`}
                        title={`保存 ${feat.name} 的路由`}
                        onClick={() => void handleSaveRoute(feat.id)}
                      >
                        <Save className="w-4 h-4 text-primary" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* 移动/平板（< lg）：卡片投影，字段 = 功能名 / 服务商 / 模型 / 操作（编辑·保存） */}
        <ul className="space-y-2 lg:hidden" data-testid="admin-ai-routes-cards">
          {features.map((feat) => {
            const route = getSavedRoute(feat.id);
            const draft = getDraft(feat.id);
            const isEditing = editingFeature === feat.id;
            const isCardSaving = savingFeature === feat.id;

            return (
              <li key={feat.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {feat.name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {feat.desc}
                    </p>
                  </div>
                  <Badge
                    variant={route?.config_id ? "secondary" : "outline"}
                    className="shrink-0"
                  >
                    {route?.config_id ? "已配置" : "未配置"}
                  </Badge>
                </div>

                {isEditing ? (
                  /* 卡片编辑态：输入框纵向排列，按钮统一 44px */
                  <div className="mt-3 grid gap-2">
                    <select
                      aria-label={`${feat.name} 的服务商`}
                      className={cn(fieldBase, "h-11")}
                      value={draft.config_id ?? ""}
                      disabled={isCardSaving}
                      onChange={(e) =>
                        handleConfigSelect(feat.id, e.target.value)
                      }
                    >
                      <option value="">未选择</option>
                      {configs.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.is_active ? "(默认)" : ""}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      aria-label={`${feat.name} 的模型名称`}
                      className={cn(fieldBase, "h-11")}
                      value={draft.model_name}
                      disabled={isCardSaving}
                      onChange={(e) =>
                        patchDraft(feat.id, { model_name: e.target.value })
                      }
                      placeholder="模型标识符"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="h-11 flex-1"
                        disabled={isCardSaving}
                        onClick={async () => {
                          const saved = await handleSaveRoute(feat.id);
                          if (saved) setEditingFeature(null);
                        }}
                      >
                        <Save className="mr-1 h-4 w-4" />
                        保存
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-11 flex-1"
                        disabled={isCardSaving}
                        onClick={() => cancelEdit(feat.id)}
                      >
                        取消
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <dl className="mt-3 grid gap-1 text-xs">
                      <div className="flex gap-2">
                        <dt className="shrink-0 text-muted-foreground">
                          服务商
                        </dt>
                        <dd className="min-w-0 truncate font-medium">
                          {getConfigName(route)}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="shrink-0 text-muted-foreground">模型</dt>
                        <dd className="min-w-0 truncate font-mono">
                          {route?.model_name || "未设置"}
                        </dd>
                      </div>
                    </dl>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 h-11 w-full"
                      aria-label={`编辑 ${feat.name} 的路由`}
                      onClick={() => startEdit(feat.id)}
                    >
                      <Pencil className="mr-1 h-4 w-4" />
                      编辑
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-6 p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
          <h4 className="text-sm font-bold text-blue-600 dark:text-blue-400 mb-1">
            路由优先级说明:
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            1. 如果特定的功能模块（如
            Rerank）配置了路由，系统将优先使用该路由指向的服务商和模型。
            <br />
            2.
            如果路由未设置或服务商已失效，系统将回退到“模型配置”标签页中标记为“激活”的全局默认配置。
            <br />
            3.
            请确保为向量嵌入（Embedding）选择的路由模型与数据库中现存向量的维度（Dimensions）保持一致。
          </p>
        </div>
      </div>
    </div>
  );
}
