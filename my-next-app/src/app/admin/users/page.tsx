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
  DialogTrigger,
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

// 扩展用户类型，包含订阅信息
interface UserWithSubscription extends UserAdminView {
  plan_id?: string;
  plan_name?: string;
  subscription_status?: string;
  expires_at?: string;
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
      setResetId(null);
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
        // 更新本地状态
        const planName =
          plans.find((p) => p.id === selectedPlanId)?.name || selectedPlanId;
        setUsers(
          users.map((u) =>
            u.id === subUserId
              ? { ...u, plan_id: selectedPlanId, plan_name: planName }
              : u,
          ),
        );
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

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">用户管理</h2>
          <p className="text-muted-foreground mt-2">
            管理系统注册用户及订阅状态
          </p>
        </div>
        <div className="relative w-64">
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
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr className="text-left">
                  <th className="p-4 font-medium">ID</th>
                  <th className="p-4 font-medium">用户名</th>
                  <th className="p-4 font-medium">注册时间</th>
                  <th className="p-4 font-medium">角色</th>
                  <th className="p-4 font-medium">订阅</th>
                  <th className="p-4 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-8 text-center text-muted-foreground"
                    >
                      <Loader2 className="animate-spin h-6 w-6 mx-auto mb-2" />
                      加载中...
                    </td>
                  </tr>
                ) : loadError ? (
                  <tr>
                    <td colSpan={6} className="p-0">
                      <ErrorState
                        title="用户列表加载失败"
                        description={loadError}
                        onRetry={() => loadUsers()}
                        className="py-8"
                      />
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-8 text-center text-muted-foreground"
                    >
                      没有找到用户
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b last:border-0 hover:bg-muted/10 transition-colors"
                    >
                      <td className="p-4 font-mono">{user.id}</td>
                      <td className="p-4 font-medium">{user.username}</td>
                      <td className="p-4 text-muted-foreground">
                        {new Date(user.created_at).toLocaleString("zh-CN")}
                      </td>
                      <td className="p-4">
                        {user.is_admin ? (
                          <span className="inline-flex items-center gap-1 bg-primary/10 text-primary px-2 py-1 rounded text-xs font-bold">
                            <Shield className="h-3 w-3" />
                            管理员
                          </span>
                        ) : (
                          <select
                            value={user.role || "student"}
                            onChange={(e) =>
                              handleRoleChange(
                                user.id,
                                e.target.value as UserRole,
                              )
                            }
                            className="text-xs border border-border rounded px-2 py-1 bg-background focus:ring-1 focus:ring-primary outline-none"
                          >
                            <option value="student">学生</option>
                            <option value="admin">管理员</option>
                          </select>
                        )}
                      </td>
                      <td className="p-4">
                        <Badge
                          variant={getPlanBadgeVariant(user.plan_id || "free")}
                          className="cursor-pointer hover:opacity-80"
                          onClick={() => openSubDialog(user)}
                        >
                          <CreditCard className="h-3 w-3 mr-1" />
                          {user.plan_name || "免费版"}
                        </Badge>
                      </td>
                      <td className="p-4 text-right space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openSubDialog(user)}
                        >
                          <CreditCard className="h-4 w-4 mr-1" />
                          订阅
                        </Button>

                        <Dialog
                          open={resetId === user.id}
                          onOpenChange={(open) => !open && setResetId(null)}
                        >
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setResetId(user.id)}
                            >
                              <KeyRound className="h-4 w-4 mr-1" />
                              重置密码
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>
                                重置密码 - {user.username}
                              </DialogTitle>
                              <DialogDescription>
                                请输入新的登录密码。
                              </DialogDescription>
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
                              <Button
                                variant="outline"
                                onClick={() => setResetId(null)}
                              >
                                取消
                              </Button>
                              <Button onClick={handleResetPassword}>
                                确认重置
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>

                        <Button
                          variant="ghost"
                          size="sm"
                          title="强制下线"
                          className="text-orange-500 hover:bg-orange-50 hover:text-orange-600"
                          onClick={() => handleRevokeSession(user.id)}
                        >
                          <LogOut className="h-4 w-4" />
                        </Button>

                        {!user.is_admin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(user.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
        <div className="flex items-center justify-between px-4 py-4 border-t">
          <div className="text-sm text-muted-foreground">
            显示 {users.length > 0 ? (page - 1) * limit + 1 : 0} 到{" "}
            {Math.min(page * limit, total)} 条，共 {total} 条
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page * limit >= total || loading}
            >
              下一页
            </Button>
          </div>
        </div>
      </Card>

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
