"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  getUsersAction,
  deleteUserAction,
  resetUserPasswordAction,
  updateUserRoleAction,
  revokeUserSessionAction,
} from "@/server/actions/admin";
import type { UserAdminView } from "@/types/admin";
import {
  getPlansAction,
  setUserSubscriptionAction,
} from "@/server/actions/subscription";
import { UserRole } from "@/types";
import { SubscriptionPlan } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2,
  Trash2,
  KeyRound,
  Shield,
  Search,
  CreditCard,
  LogOut,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils/utils";

// 扩展用户类型，包含订阅信息
interface UserWithSubscription extends UserAdminView {
  plan_id?: string;
  plan_name?: string;
  subscription_status?: string;
  expires_at?: string | null;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserWithSubscription[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Pagination state
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  const [resetId, setResetId] = useState<number | null>(null);
  // 目标用户快照：列表刷新/翻页后对话框仍要显示用户名，不能从当前页数据现查
  const [resetTarget, setResetTarget] = useState<UserWithSubscription | null>(
    null,
  );
  // 打开对话框的触发按钮：页面级 Dialog 没有 DialogTrigger，关闭时手动归还焦点
  const resetTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [newPass, setNewPass] = useState("");

  // 订阅对话框状态
  const [subDialogOpen, setSubDialogOpen] = useState(false);
  const [subUserId, setSubUserId] = useState<number | null>(null);
  const [subUserName, setSubUserName] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("free");
  const [subDuration, setSubDuration] = useState("0"); // 0 表示永久
  const [savingSub, setSavingSub] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // 请求序号：搜索/翻页会并发触发加载，旧请求晚返回时不能覆盖新请求的结果
  const reqIdRef = useRef(0);
  // 后台刷新独立序号：连续两次写操作（删用户 + 改角色）会连发两次后台刷新，
  // 只靠 reqId 无法区分「哪次后台刷新更新」，先发后到的那次会覆盖较新结果
  const bgSeqRef = useRef(0);
  // 当前查询条件的最新值：后台刷新的响应回来时用它判断「条件是否已经变了」
  const searchRef = useRef(search);
  const pageRef = useRef(page);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  const loadUsers = useCallback(
    async (options?: { background?: boolean }) => {
      const background = options?.background === true;
      // 绑定发起时的查询条件：后台刷新绝不能拿"点击那一刻"的条件去覆盖新搜索的结果
      const snapshot = { search, page };
      // 前台请求才抢「最新请求」身份；后台刷新沿用当前序号，不使更新的前台请求失效
      const reqId = background ? reqIdRef.current : ++reqIdRef.current;
      // 后台刷新每次自增，只有「最后一次」能落地
      const bgSeq = background ? ++bgSeqRef.current : bgSeqRef.current;
      // 后台刷新（写操作成功后）不动 loading / 错误态：列表已经是可用状态
      if (!background) {
        setLoading(true);
        setLoadError(null);
      }
      const isStale = () =>
        reqId !== reqIdRef.current ||
        (background &&
          (bgSeq !== bgSeqRef.current ||
            searchRef.current !== snapshot.search ||
            pageRef.current !== snapshot.page));
      const offset = (snapshot.page - 1) * limit;
      try {
        const result = await getUsersAction({
          limit,
          offset,
          query: snapshot.search,
        });
        // 已有更新的请求在飞，或查询条件已变：本次结果（含错误）一律丢弃
        if (isStale()) return;
        // safe-action 不抛错：serverError 与空 data 都算加载失败
        if (result.serverError) throw new Error(result.serverError);
        if (!result.data) throw new Error("用户列表返回为空，请稍后重试");
        // 后端现在直接返回订阅信息，无需前端再处理
        setUsers(result.data.users as UserWithSubscription[]);
        setTotal(result.data.total);
        // 前台结果已落地：让所有在途的后台刷新失效，避免旧数据把它盖回去
        if (!background) bgSeqRef.current++;
      } catch (error) {
        if (isStale()) return;
        if (background) {
          // audit-allow: 写操作已经成功，后台刷新失败只提示一次并保留旧列表，绝不把列表换成错误态
          console.warn("[AdminUsers] 写操作后的后台刷新失败，保留旧列表", {
            err: error,
          });
          toast.warning("列表刷新失败，请手动刷新");
          return;
        }
        // 加载失败 → 错误态 + 重试（degraded）
        console.error("[AdminUsers] 加载用户列表失败", { err: error });
        setLoadError(error instanceof Error ? error.message : String(error));
        return;
      } finally {
        // 最新请求结束时统一收 loading：否则前一请求被丢弃后 loading 会永久卡在 true
        if (reqId === reqIdRef.current) setLoading(false);
      }
    },
    [page, search],
  );

  // Debounce search resets page
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1); // Reset to first page on search
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  // Reload when page or search changes (after debounce)
  useEffect(() => {
    loadUsers();
  }, [page, loadUsers]);

  const loadPlans = async () => {
    const result = await getPlansAction(true);
    if (result.serverError) {
      console.error("加载套餐失败", result.serverError);
    } else if (result.data?.success && result.data.plans) {
      setPlans(result.data.plans);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        `确定要删除用户 ID:${id} 吗？此操作将清除该用户所有数据且不可恢复！`,
      )
    )
      return;
    const result = await deleteUserAction(id);
    if (result.serverError) {
      toast.error(result.serverError || "删除失败");
    } else if (result.data?.success) {
      toast.success("用户已删除");
      // 删除已成功：刷新失败不应把列表替换成错误态
      loadUsers({ background: true });
    }
  };

  // 打开重置密码对话框：记住触发按钮，关闭后把焦点还回去
  const openResetDialog = (
    user: UserWithSubscription,
    trigger: HTMLButtonElement | null,
  ) => {
    resetTriggerRef.current = trigger;
    setResetTarget(user);
    setResetId(user.id);
  };

  const closeResetDialog = () => {
    setResetId(null);
    setResetTarget(null);
  };

  const handleResetPassword = async () => {
    if (!resetId || !newPass) return;
    const result = await resetUserPasswordAction({
      id: resetId,
      newPassword: newPass,
    });
    if (result.serverError) {
      toast.error(result.serverError || "重置失败");
    } else if (result.data?.success) {
      toast.success("密码已重置");
      closeResetDialog();
      setNewPass("");
    }
  };

  const handleRoleChange = async (id: number, role: UserRole) => {
    const result = await updateUserRoleAction({ id, role });
    if (result.serverError) {
      toast.error(result.serverError || "更新失败");
    } else if (result.data?.success) {
      toast.success("角色已更新");
      // 角色已改成功：刷新失败不应把列表替换成错误态
      loadUsers({ background: true });
    }
  };

  const handleRevokeSession = async (id: number) => {
    if (
      !confirm(
        `确定要强制下线用户 ID:${id} 的所有活动会话吗？用户需要重新登录。`,
      )
    )
      return;
    const result = await revokeUserSessionAction(id);
    if (result.serverError) {
      toast.error(result.serverError || "操作失败");
    } else if (result.data?.success) {
      toast.success("用户已强制下线");
    }
  };

  // 打开订阅对话框
  const openSubDialog = (user: UserWithSubscription) => {
    setSubUserId(user.id);
    setSubUserName(user.username);
    setSelectedPlanId(user.plan_id || "free");
    setSubDuration("0");
    setSubDialogOpen(true);
  };

  // 保存订阅
  const handleSaveSubscription = async () => {
    if (!subUserId) return;
    setSavingSub(true);
    try {
      const duration = parseInt(subDuration);
      const result = await setUserSubscriptionAction({
        userId: subUserId,
        planId: selectedPlanId,
        durationMonths: duration || undefined,
      });
      if (result.data?.success) {
        toast.success("订阅已更新");
        setSubDialogOpen(false);
        // action 只回 { success }，不含订阅详情：先按本次请求的入参做本地乐观更新
        // （套餐 + 状态 + 到期），再用后台刷新对齐服务端的真实 status/expires_at，
        // 否则卡片/表格会一直显示改之前的套餐与到期时间
        const planName =
          plans.find((p) => p.id === selectedPlanId)?.name || selectedPlanId;
        const expiresAt = (() => {
          if (!duration || duration <= 0) return null;
          const expireDate = new Date();
          expireDate.setMonth(expireDate.getMonth() + duration);
          return expireDate.toISOString();
        })();
        setUsers((prev) =>
          prev.map((u) =>
            u.id === subUserId
              ? {
                  ...u,
                  plan_id: selectedPlanId,
                  plan_name: planName,
                  subscription_status: "active",
                  expires_at: expiresAt,
                }
              : u,
          ),
        );
        // 后台刷新失败只提示一次并保留上面的乐观值（loadUsers 内部处理）
        loadUsers({ background: true });
      } else {
        toast.error(
          `操作失败：${result.serverError || "服务端未确认订阅变更"}`,
        );
        return;
      }
    } catch (error) {
      console.error("更新用户订阅失败", error);
      toast.error(
        `操作失败：${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    } finally {
      setSavingSub(false);
    }
  };

  // const filteredUsers = users.filter(u => u.username.toLowerCase().includes(search.toLowerCase()));
  // Server-side filtering is now in place
  const filteredUsers = users;

  // 获取套餐徽章颜色
  const getPlanBadgeVariant = (planId: string) => {
    switch (planId) {
      case "pro":
        return "default";
      case "basic":
        return "secondary";
      default:
        return "outline";
    }
  };

  // 订阅状态 → 徽章文案/样式（表格与卡片共用同一份映射）
  // 注意：库里 status 只是冗余字段，到期后可能仍是 "active"（没有定时任务改它），
  // 所以判定以 expires_at 为准：已过期一律显示「已过期」，expires_at 为空视为永久。
  const getSubscriptionBadge = (
    status?: string | null,
    expiresAt?: string | null,
  ) => {
    if (status !== "active" && status !== "expired" && status !== "cancelled") {
      return null;
    }
    if (
      status !== "cancelled" &&
      expiresAt &&
      new Date(expiresAt).getTime() < Date.now()
    ) {
      return { label: "已过期", variant: "warning" as const };
    }
    switch (status) {
      case "active":
        return { label: "有效", variant: "success" as const };
      case "expired":
        return { label: "已过期", variant: "warning" as const };
      default:
        return { label: "已取消", variant: "outline" as const };
    }
  };

  // 到期时间文案（表格与卡片共用）
  const formatExpiresAt = (expiresAt?: string | null) =>
    expiresAt
      ? `到期 ${new Date(expiresAt).toLocaleDateString("zh-CN")}`
      : "永久";

  // 角色控件：桌面表格与移动卡片共用（只切换尺寸，不复制业务回调）
  const renderRoleControl = (
    user: UserWithSubscription,
    touchFriendly = false,
  ) =>
    user.is_admin ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
        <Shield className="h-3 w-3" />
        管理员
      </span>
    ) : (
      <select
        aria-label={`修改 ${user.username} 的角色`}
        value={user.role || "student"}
        onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
        className={cn(
          "rounded-lg border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary",
          touchFriendly ? "h-11" : "py-1",
        )}
      >
        <option value="student">学生</option>
        <option value="admin">管理员</option>
      </select>
    );

  // 套餐徽章：点击即打开订阅对话框（两套投影共用）。
  // 可点击元素在移动档必须 ≥ 44px（ui-system.md §6.2），Badge 默认只有 ~22px。
  const renderPlanBadge = (
    user: UserWithSubscription,
    touchFriendly = false,
  ) => (
    <Badge
      variant={getPlanBadgeVariant(user.plan_id || "free")}
      className={cn(
        "cursor-pointer hover:opacity-80",
        touchFriendly && "inline-flex min-h-11 items-center px-3",
      )}
      onClick={() => openSubDialog(user)}
    >
      <CreditCard className="h-3 w-3 mr-1" />
      {user.plan_name || "免费版"}
    </Badge>
  );

  // 订阅信息（套餐徽章 + 到期时间 + 状态徽章）：表格与卡片口径完全一致
  const renderSubscriptionInfo = (
    user: UserWithSubscription,
    touchFriendly = false,
  ) => {
    const badge = getSubscriptionBadge(
      user.subscription_status,
      user.expires_at,
    );
    return (
      <>
        {renderPlanBadge(user, touchFriendly)}
        <span className="text-xs text-muted-foreground">
          {formatExpiresAt(user.expires_at)}
        </span>
        {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
      </>
    );
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 md:px-6 lg:py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            用户管理
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            管理系统注册用户及订阅状态
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索用户名"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>用户列表</CardTitle>
          <CardDescription>共 {users.length} 位注册用户</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <>
              {/* 表格骨架：lg 起 */}
              <div className="hidden space-y-2 lg:block">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton
                    key={`table-skeleton-${i}`}
                    className="h-12 w-full rounded-lg"
                  />
                ))}
              </div>
              {/* 列表骨架：< lg */}
              <div className="space-y-2 lg:hidden">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton
                    key={`card-skeleton-${i}`}
                    className="h-20 w-full rounded-lg"
                  />
                ))}
              </div>
            </>
          ) : loadError ? (
            <ErrorState
              title="用户列表加载失败"
              description={loadError}
              onRetry={() => loadUsers()}
            />
          ) : filteredUsers.length === 0 ? (
            <EmptyState title="没有找到用户" description="换个关键词再试试" />
          ) : (
            <>
              {/*
                桌面（lg 起）：6 列宽表格放不下 md 档 —— 768 视口减去侧边栏 16rem
                只剩约 512px，列会被压出横向溢出。ui-system.md §4 的「表格从 md 起
                允许」在这里按实测放宽到 lg：md 档仍用卡片。
              */}
              <div
                className="hidden rounded-lg border lg:block"
                data-testid="admin-users-table"
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">ID</TableHead>
                      <TableHead>用户名</TableHead>
                      <TableHead>注册时间</TableHead>
                      <TableHead className="w-28">角色</TableHead>
                      <TableHead className="w-40">订阅</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-mono">{user.id}</TableCell>
                        <TableCell className="font-medium">
                          {user.username}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(user.created_at).toLocaleString("zh-CN")}
                        </TableCell>
                        <TableCell>{renderRoleControl(user)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            {renderSubscriptionInfo(user)}
                          </div>
                        </TableCell>
                        <TableCell className="space-x-2 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openSubDialog(user)}
                          >
                            <CreditCard className="h-4 w-4 mr-1" />
                            订阅
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) =>
                              openResetDialog(user, e.currentTarget)
                            }
                          >
                            <KeyRound className="h-4 w-4 mr-1" />
                            重置密码
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            title="强制下线"
                            aria-label={`强制下线 ${user.username}`}
                            className="text-orange-500 hover:bg-orange-50 hover:text-orange-600"
                            onClick={() => handleRevokeSession(user.id)}
                          >
                            <LogOut className="h-4 w-4" />
                          </Button>

                          {!user.is_admin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`删除用户 ${user.username}`}
                              className="text-destructive hover:bg-destructive/10"
                              onClick={() => handleDelete(user.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* 移动/平板（< lg）：卡片投影，字段 = 用户名+角色 / 套餐+到期+状态，操作在卡底 */}
              <ul
                className="space-y-2 lg:hidden"
                data-testid="admin-users-cards"
              >
                {filteredUsers.map((user) => (
                  <li key={user.id} className="rounded-lg border bg-card p-4">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {user.username}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          ID {user.id} · 注册于{" "}
                          {new Date(user.created_at).toLocaleDateString(
                            "zh-CN",
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {renderRoleControl(user, true)}
                        <Button
                          variant="ghost"
                          size="sm"
                          title="强制下线"
                          aria-label={`强制下线 ${user.username}`}
                          className="h-11 w-11 text-orange-500 hover:bg-orange-50 hover:text-orange-600"
                          onClick={() => handleRevokeSession(user.id)}
                        >
                          <LogOut className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {renderSubscriptionInfo(user, true)}
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-11 flex-1"
                        onClick={() => openSubDialog(user)}
                      >
                        订阅
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-11 flex-1"
                        onClick={(e) => openResetDialog(user, e.currentTarget)}
                      >
                        重置密码
                      </Button>
                      {!user.is_admin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-11 w-11 shrink-0 text-destructive hover:bg-destructive/10"
                          title="删除用户"
                          aria-label={`删除用户 ${user.username}`}
                          onClick={() => handleDelete(user.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
        <div className="flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            显示 {users.length > 0 ? (page - 1) * limit + 1 : 0} 到{" "}
            {Math.min(page * limit, total)} 条，共 {total} 条
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-11 flex-1 sm:h-9 sm:flex-none"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-11 flex-1 sm:h-9 sm:flex-none"
              onClick={() => setPage((p) => p + 1)}
              disabled={page * limit >= total || loading}
            >
              下一页
            </Button>
          </div>
        </div>
      </Card>

      {/* 重置密码对话框：只渲染一份，避免桌面/移动两套投影各弹一个 */}
      <Dialog
        open={resetId !== null}
        onOpenChange={(open) => {
          if (!open) closeResetDialog();
        }}
      >
        <DialogContent
          // 页面级 Dialog 没有 DialogTrigger：Radix 找不到触发器会把焦点丢到 body，
          // 这里显式还回打开它的那个按钮（列表刷新 / 翻页后该按钮可能已卸载，故用可选链）
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            resetTriggerRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>重置密码 - {resetTarget?.username ?? ""}</DialogTitle>
            <DialogDescription>请输入新的登录密码。</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              type="text"
              placeholder="新密码"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeResetDialog}>
              取消
            </Button>
            <Button onClick={handleResetPassword}>确认重置</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 订阅对话框 */}
      <Dialog open={subDialogOpen} onOpenChange={setSubDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>设置订阅 - {subUserName}</DialogTitle>
            <DialogDescription>为用户分配订阅套餐</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>选择套餐</Label>
              <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name} -{" "}
                      {plan.price_monthly === 0
                        ? "免费"
                        : `¥${plan.price_monthly / 100}/月`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>订阅时长</Label>
              <Select value={subDuration} onValueChange={setSubDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">永久</SelectItem>
                  <SelectItem value="1">1 个月</SelectItem>
                  <SelectItem value="3">3 个月</SelectItem>
                  <SelectItem value="6">6 个月</SelectItem>
                  <SelectItem value="12">12 个月</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveSubscription} disabled={savingSub}>
              {savingSub && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
