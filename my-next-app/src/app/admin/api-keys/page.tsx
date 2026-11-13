"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  ShieldCheck,
  ShieldOff,
  ShieldAlert,
  Loader2,
  Terminal,
  X,
} from "lucide-react";
import {
  getApiKeysAction,
  createApiKeyAction,
  toggleApiKeyAction,
  deleteApiKeyAction,
} from "@/server/actions/api-keys";
import type { ApiKeyScope, ApiKeyView } from "@/types/api-key";
import { cn } from "@/lib/utils/utils";
import { toast } from "sonner";

/**
 * 三档作用域的唯一描述来源：对话框里的选项、列表里的徽标都读这里，
 * 避免「说明文案」和「徽标」各写一份后漂移。
 */
const SCOPE_META: Record<
  ApiKeyScope,
  {
    /** 中文档位名 */
    label: string;
    /** 这一档多了什么权限（对话框里的一行说明） */
    summary: string;
    /** 风险提示（徽标上的极短标签） */
    risk: string;
  }
> = {
  read: {
    label: "只读",
    summary: "查看练习记录、错题、掌握度、知识卡片",
    risk: "低风险",
  },
  write: {
    label: "读写",
    summary: "额外可导入答题记录、增删改题目与卡片",
    risk: "中风险",
  },
  admin: {
    label: "全权",
    summary: "含管理端能力，仅限站长自用",
    risk: "高风险",
  },
};

const SCOPE_ORDER: ApiKeyScope[] = ["read", "write", "admin"];

/** 风险徽标：三档用三种底色，扫一眼就能分出严重程度 */
function RiskBadge({ scope }: { scope: ApiKeyScope }) {
  const risk = SCOPE_META[scope].risk;
  if (scope === "read") {
    return (
      <Badge variant="secondary" className="font-medium">
        {risk}
      </Badge>
    );
  }
  if (scope === "write") {
    return (
      <Badge variant="warning" className="font-medium">
        {risk}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-destructive/40 font-medium text-destructive"
    >
      {risk}
    </Badge>
  );
}

/** 作用域徽标：只读中性、读写警示、全权用描边红（不铺满，避免整张表都在喊） */
function ScopeBadge({ scope }: { scope: ApiKeyScope }) {
  const meta = SCOPE_META[scope];
  if (scope === "read") {
    return (
      <Badge variant="secondary" className="whitespace-nowrap font-medium">
        read · {meta.label}
      </Badge>
    );
  }
  if (scope === "write") {
    return (
      <Badge variant="warning" className="whitespace-nowrap font-medium">
        write · {meta.label}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="whitespace-nowrap border-destructive/40 font-medium text-destructive"
    >
      admin · {meta.label}
    </Badge>
  );
}

/** 归属徽标：全局 key 等价站长身份，用警示色单独标出来，不让人误以为是普通机器身份 */
function OwnerBadge({ userId }: { userId: number | null }) {
  if (userId === null) {
    return (
      <Badge
        variant="warning"
        className="whitespace-nowrap font-medium"
        title="全局 key 以站长身份执行请求，不要分发给他人"
      >
        <ShieldAlert className="mr-1 h-3 w-3 shrink-0" aria-hidden />
        全局
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="whitespace-nowrap font-medium">
      用户 #{userId}
    </Badge>
  );
}

/** 作用域单选卡：点击整行即可选中，键盘用原生 radio 的焦点行为 */
function ScopeOption({
  scope,
  checked,
  onSelect,
}: {
  scope: ApiKeyScope;
  checked: boolean;
  onSelect: (scope: ApiKeyScope) => void;
}) {
  const meta = SCOPE_META[scope];
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
        checked
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border hover:bg-muted/60",
      )}
    >
      <input
        type="radio"
        name="api-key-scope"
        value={scope}
        checked={checked}
        onChange={() => onSelect(scope)}
        className="sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
          checked ? "border-primary" : "border-input",
        )}
      >
        {checked && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">{meta.label}</span>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            {scope}
          </code>
          <RiskBadge scope={scope} />
        </span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
          {meta.summary}
        </span>
      </span>
    </label>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("zh-CN");
}

/** 最近使用时间：精确到分钟即可，从没用过显示破折号 */
function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 6) + "••••••••" + key.slice(-4);
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 创建对话框
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<ApiKeyScope>("read");
  // 绑定用户：留空 = 全局 key
  const [ownerId, setOwnerId] = useState("");

  // 新建完成后的密钥（只显示一次）
  const [createdKey, setCreatedKey] = useState<{
    key: string;
    scope: ApiKeyScope;
    userId: number | null;
  } | null>(null);

  // 每行密钥的可见性 / 复制态
  const [visibleKeys, setVisibleKeys] = useState<Set<number>>(new Set());
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiedCurlId, setCopiedCurlId] = useState<number | null>(null);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await getApiKeysAction();
    // safe-action 不抛错：serverError 与空 data 都算加载失败
    if (result.serverError || !result.data) {
      setLoadError(result.serverError ?? "密钥列表返回为空，请稍后重试");
      setLoading(false);
      return;
    }
    setKeys(result.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchKeys();
  }, [fetchKeys]);

  const trimmedOwner = ownerId.trim();
  const parsedOwnerId = /^\d+$/.test(trimmedOwner)
    ? Number(trimmedOwner)
    : null;
  // 空 = 全局；填了就必须是正整数
  const ownerValid = trimmedOwner === "" || (parsedOwnerId ?? 0) > 0;
  const effectiveOwnerId =
    scope === "admin" ? null : ownerValid ? parsedOwnerId : null;

  const resetForm = () => {
    setDescription("");
    setScope("read");
    setOwnerId("");
    setCreateError(null);
  };

  const openCreateDialog = () => {
    setCreatedKey(null);
    setCreateError(null);
    setCreateOpen(true);
  };

  const closeCreateDialog = () => {
    setCreateOpen(false);
    resetForm();
  };

  const handleCreate = async () => {
    if (creating || !description.trim() || !ownerValid) return;
    setCreating(true);
    setCreateError(null);
    const result = await createApiKeyAction({
      description: description.trim(),
      scopes: scope,
      userId: effectiveOwnerId,
    });
    setCreating(false);
    if (result.serverError || !result.data?.success || !result.data.key) {
      // 失败留在对话框里，不把已有列表换成错误态
      setCreateError(result.serverError ?? "密钥生成失败，请稍后重试");
      return;
    }
    setCreatedKey({
      key: result.data.key,
      scope,
      userId: effectiveOwnerId,
    });
    // 列表可能很长：对话框关掉后用户不一定看得到页首的密钥条，再给一次提示
    toast.success("密钥已生成，只显示这一次，请立即复制");
    setCreateOpen(false);
    resetForm();
    await fetchKeys();
  };

  const handleToggle = async (id: number, currentState: number) => {
    await toggleApiKeyAction({ id, isActive: !currentState });
    await fetchKeys();
  };

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "确定要永久删除这个 API Key 吗？删除后使用此密钥的外部服务将立即失效。",
      )
    )
      return;
    await deleteApiKeyAction(id);
    await fetchKeys();
  };

  const handleCopy = async (key: string, id: number) => {
    await navigator.clipboard.writeText(key);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyCurl = async (key: string, id: number) => {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const curlCommand = `curl -H "Authorization: Bearer ${key}" "${baseUrl}/api/external/questions?page=1&limit=5"`;
    await navigator.clipboard.writeText(curlCommand);
    setCopiedCurlId(id);
    setTimeout(() => setCopiedCurlId(null), 2000);
  };

  const activeCount = keys.filter((k) => k.is_active).length;
  const globalCount = keys.filter((k) => k.user_id === null).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 lg:py-10">
      {/* 1 PageHeader */}
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight md:text-3xl">
            <Key className="h-6 w-6 shrink-0 text-primary" aria-hidden />
            API Key 管理
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            外部服务用它调用开放接口。当前 {activeCount} 个激活，共{" "}
            {keys.length} 个（其中 {globalCount} 个全局 key）
          </p>
        </div>
        <Button className="hidden sm:inline-flex" onClick={openCreateDialog}>
          <Plus aria-hidden />
          生成新密钥
        </Button>
      </header>

      {/* 全局 key 的语义必须写在页面上，而不是只藏在说明里 */}
      <div className="mb-6 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-muted p-3">
        <ShieldAlert
          className="mt-0.5 h-4 w-4 shrink-0 text-warning"
          aria-hidden
        />
        <p className="text-xs leading-5 text-foreground">
          全局 key 等价站长身份：它以站长账号执行请求，只受作用域限制。
          <span className="font-medium">不要把全局 key 分发给他人</span>
          ；给第三方平台用，请选 read 作用域，或绑定到某个普通用户。
        </p>
      </div>

      {/* 新建成功的密钥（只显示一次） */}
      {createdKey && (
        <section className="mb-4 rounded-lg border border-success/30 bg-success-muted p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0 text-success"
                aria-hidden
              />
              <div>
                <p className="text-sm font-medium text-foreground">
                  密钥已生成，只显示这一次
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>{SCOPE_META[createdKey.scope].label}档</span>
                  <span aria-hidden>·</span>
                  <span>
                    {createdKey.userId === null
                      ? "全局 key（站长身份，不要分发）"
                      : `绑定用户 #${createdKey.userId}`}
                  </span>
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="关闭提示"
              onClick={() => setCreatedKey(null)}
            >
              <X />
            </Button>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs break-all">
              {createdKey.key}
            </code>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-11 flex-1 sm:h-10 sm:flex-none"
                onClick={() => handleCopy(createdKey.key, -1)}
              >
                {copiedId === -1 ? (
                  <Check className="text-success" aria-hidden />
                ) : (
                  <Copy aria-hidden />
                )}
                复制密钥
              </Button>
              <Button
                variant="outline"
                className="h-11 flex-1 sm:h-10 sm:flex-none"
                onClick={() => handleCopyCurl(createdKey.key, -1)}
              >
                {copiedCurlId === -1 ? (
                  <Check className="text-success" aria-hidden />
                ) : (
                  <Terminal aria-hidden />
                )}
                cURL
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* 3 Content：加载 → 骨架 / 失败 → ErrorState / 空 → EmptyState / 就绪 → 表格+卡片 */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={`api-key-skeleton-${i}`}
              className="h-20 rounded-lg"
            />
          ))}
        </div>
      ) : loadError ? (
        <ErrorState
          title="密钥列表加载失败"
          description={loadError}
          onRetry={() => fetchKeys()}
        />
      ) : keys.length === 0 ? (
        <EmptyState
          icon={<Key className="h-12 w-12" aria-hidden />}
          title="还没有 API Key"
          description="生成一把密钥，外部服务就能读取练习数据、导入答题记录。"
          action={
            <Button size="lg" onClick={openCreateDialog}>
              <Plus aria-hidden />
              生成新密钥
            </Button>
          }
        />
      ) : (
        <>
          {/* 桌面（lg 起）：五列 —— 密钥 / 作用域 / 归属 / 最近使用 / 操作 */}
          <div
            className="hidden rounded-lg border lg:block"
            data-testid="admin-api-keys-table"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-0">密钥</TableHead>
                  <TableHead className="w-28">作用域</TableHead>
                  <TableHead className="w-24">归属</TableHead>
                  <TableHead className="w-32">最近使用</TableHead>
                  <TableHead className="w-24 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((apiKey) => {
                  const isVisible = visibleKeys.has(apiKey.id);
                  return (
                    <TableRow
                      key={apiKey.id}
                      className={cn(!apiKey.is_active && "opacity-60")}
                    >
                      <TableCell className="max-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">
                            {apiKey.description || "未命名密钥"}
                          </span>
                          {apiKey.is_active ? (
                            <Badge variant="success" className="shrink-0">
                              激活
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="shrink-0 text-muted-foreground"
                            >
                              已停用
                            </Badge>
                          )}
                        </div>

                        <div className="mt-1 flex min-w-0 items-center gap-1">
                          <code className="truncate font-mono text-xs text-muted-foreground">
                            {isVisible
                              ? apiKey.key_string
                              : maskKey(apiKey.key_string)}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            aria-label={isVisible ? "隐藏密钥" : "显示密钥"}
                            onClick={() => {
                              const next = new Set(visibleKeys);
                              if (isVisible) {
                                next.delete(apiKey.id);
                              } else {
                                next.add(apiKey.id);
                              }
                              setVisibleKeys(next);
                            }}
                          >
                            {isVisible ? <EyeOff /> : <Eye />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            aria-label="复制密钥"
                            onClick={() =>
                              handleCopy(apiKey.key_string, apiKey.id)
                            }
                          >
                            {copiedId === apiKey.id ? (
                              <Check className="text-success" />
                            ) : (
                              <Copy />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            aria-label="复制 cURL 测试命令"
                            onClick={() =>
                              handleCopyCurl(apiKey.key_string, apiKey.id)
                            }
                          >
                            {copiedCurlId === apiKey.id ? (
                              <Check className="text-success" />
                            ) : (
                              <Terminal />
                            )}
                          </Button>
                        </div>

                        <p className="mt-1 text-xs text-muted-foreground">
                          创建于 {formatDate(apiKey.created_at)}
                        </p>
                      </TableCell>

                      <TableCell>
                        <ScopeBadge scope={apiKey.scopes} />
                      </TableCell>
                      <TableCell>
                        <OwnerBadge userId={apiKey.user_id} />
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {formatDateTime(apiKey.last_used_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={
                              apiKey.is_active ? "停用该密钥" : "启用该密钥"
                            }
                            title={apiKey.is_active ? "停用" : "启用"}
                            onClick={() =>
                              handleToggle(apiKey.id, apiKey.is_active)
                            }
                          >
                            {apiKey.is_active ? (
                              <ShieldCheck className="text-success" />
                            ) : (
                              <ShieldOff className="text-muted-foreground" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="删除该密钥"
                            title="删除"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(apiKey.id)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* 手机 / 平板（< lg）：卡片投影，字段 3 个（描述 / 作用域+归属 / 最近使用） */}
          <ul
            className="space-y-2 lg:hidden"
            data-testid="admin-api-keys-cards"
          >
            {keys.map((apiKey) => (
              <li
                key={apiKey.id}
                className={cn(
                  "rounded-lg border bg-card p-4",
                  !apiKey.is_active && "opacity-60",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 text-sm font-medium leading-6">
                    {apiKey.description || "未命名密钥"}
                  </p>
                  <span className="shrink-0">
                    {apiKey.is_active ? (
                      <Badge variant="success">激活</Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-muted-foreground"
                      >
                        已停用
                      </Badge>
                    )}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <ScopeBadge scope={apiKey.scopes} />
                  <OwnerBadge userId={apiKey.user_id} />
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  最近使用 {formatDateTime(apiKey.last_used_at)} · 创建于{" "}
                  {formatDate(apiKey.created_at)}
                </p>

                <div className="mt-2 flex items-center gap-1 rounded-lg bg-muted/60 px-3">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                    {maskKey(apiKey.key_string)}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    aria-label="复制密钥"
                    onClick={() => handleCopy(apiKey.key_string, apiKey.id)}
                  >
                    {copiedId === apiKey.id ? (
                      <Check className="text-success" />
                    ) : (
                      <Copy />
                    )}
                  </Button>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="h-11 flex-1"
                    onClick={() => handleToggle(apiKey.id, apiKey.is_active)}
                  >
                    {apiKey.is_active ? (
                      <ShieldOff aria-hidden />
                    ) : (
                      <ShieldCheck aria-hidden />
                    )}
                    {apiKey.is_active ? "停用" : "启用"}
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-11 w-11 shrink-0 text-destructive hover:text-destructive"
                    aria-label="删除该密钥"
                    onClick={() => handleDelete(apiKey.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* 手机端主操作放在内容流末尾（拇指区），桌面用页头那颗 */}
      {!loading && !loadError && keys.length > 0 && (
        <Button
          size="lg"
          className="mt-4 w-full sm:hidden"
          onClick={openCreateDialog}
        >
          <Plus aria-hidden />
          生成新密钥
        </Button>
      )}

      {/* 创建对话框 */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (open) {
            setCreateOpen(true);
          } else {
            closeCreateDialog();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>生成新密钥</DialogTitle>
            <DialogDescription>
              密钥创建后只显示一次。作用域决定它能调用哪些接口，归属决定它以谁的身份执行。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="api-key-description">用途说明</Label>
              <Input
                id="api-key-description"
                placeholder="例如：Coze 智能体接入"
                value={description}
                maxLength={60}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
              <p className="text-xs text-muted-foreground">
                写清给谁用、做什么，以后才知道哪把 key 该停用。
              </p>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">作用域</legend>
              <div className="space-y-2">
                {SCOPE_ORDER.map((item) => (
                  <ScopeOption
                    key={item}
                    scope={item}
                    checked={scope === item}
                    onSelect={setScope}
                  />
                ))}
              </div>

              {scope === "admin" && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                  <ShieldAlert
                    className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                    aria-hidden
                  />
                  <p className="text-xs leading-5 text-foreground">
                    全权 key 能改题、删数据、改用户，
                    <span className="font-medium">只给自己用</span>
                    ，不要贴进任何第三方平台的配置里。泄漏一把，等于交出后台密码。
                  </p>
                </div>
              )}
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="api-key-owner">绑定用户（可选）</Label>
              <Input
                id="api-key-owner"
                inputMode="numeric"
                placeholder="留空 = 全局 key（站长身份）"
                value={scope === "admin" ? "" : ownerId}
                disabled={scope === "admin"}
                onChange={(e) => setOwnerId(e.target.value)}
              />
              <p className="text-xs leading-5 text-muted-foreground">
                {scope === "admin"
                  ? "全权 key 不能绑定到普通用户，已固定为全局 key。"
                  : trimmedOwner === ""
                    ? "全局 key 以站长身份执行请求，不要分发给他人。"
                    : ownerValid
                      ? `该 key 的读写都记在用户 #${parsedOwnerId} 名下，用它只能看到这个用户自己的数据。`
                      : "用户 ID 只能是正整数，可到「用户管理」里查。"}
              </p>
            </div>

            <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              将创建：
              <span className="font-medium text-foreground">
                {scope} · {SCOPE_META[scope].label}
              </span>
              <span aria-hidden> · </span>
              <span className="font-medium text-foreground">
                {effectiveOwnerId === null
                  ? "全局 key"
                  : `用户 #${effectiveOwnerId} 的专属 key`}
              </span>
            </div>

            {createError && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-5 text-foreground">
                {createError}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="h-11 sm:h-10"
              onClick={closeCreateDialog}
            >
              取消
            </Button>
            <Button
              className="h-11 sm:h-10"
              onClick={handleCreate}
              disabled={creating || !description.trim() || !ownerValid}
            >
              {creating && <Loader2 className="animate-spin" aria-hidden />}
              生成密钥
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
