'use client';

import React, { useEffect, useState } from 'react';
import { getUsersAction, deleteUserAction, resetUserPasswordAction, updateUserRoleAction, revokeUserSessionAction, UserAdminView } from '@/server/actions/admin';
import { getPlansAction, setUserSubscriptionAction } from '@/server/actions/subscription';
import { UserRole } from '@/types';
import { SubscriptionPlan } from '@/lib/billing/subscription-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Trash2, KeyRound, Shield, Search, CreditCard, LogOut } from 'lucide-react';
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
import { Label } from '@/components/ui/label';

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
    const [search, setSearch] = useState('');

    // Pagination state
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const limit = 10;

    const [resetId, setResetId] = useState<number | null>(null);
    const [newPass, setNewPass] = useState('');

    // 订阅对话框状态
    const [subDialogOpen, setSubDialogOpen] = useState(false);
    const [subUserId, setSubUserId] = useState<number | null>(null);
    const [subUserName, setSubUserName] = useState('');
    const [selectedPlanId, setSelectedPlanId] = useState('free');
    const [subDuration, setSubDuration] = useState('0'); // 0 表示永久
    const [savingSub, setSavingSub] = useState(false);

    const loadUsers = async () => {
        setLoading(true);
        try {
            const offset = (page - 1) * limit;
            const res = await getUsersAction(limit, offset, search);

            // 后端现在直接返回订阅信息，无需前端再处理
            setUsers(res.users);
            setTotal(res.total);
        } catch (e) {
            toast.error("加载用户失败");
        } finally {
            setLoading(false);
        }
    };

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(1); // Reset to first page on search
            loadUsers();
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    // Reload when page changes
    useEffect(() => {
        loadUsers();
    }, [page]);

    const loadPlans = async () => {
        try {
            const res = await getPlansAction(true);
            if (res.success && res.plans) {
                setPlans(res.plans);
            }
        } catch (e) {
            console.error('加载套餐失败', e);
        }
    };

    useEffect(() => {
        loadPlans();
    }, []);

    const handleDelete = async (id: number) => {
        if (!confirm(`确定要删除用户 ID:${id} 吗？此操作将清除该用户所有数据且不可恢复！`)) return;
        const res = await deleteUserAction(id);
        if (res.success) {
            toast.success("用户已删除");
            loadUsers();
        } else {
            toast.error(res.error || "删除失败");
        }
    };

    const handleResetPassword = async () => {
        if (!resetId || !newPass) return;
        const res = await resetUserPasswordAction(resetId, newPass);
        if (res.success) {
            toast.success("密码已重置");
            setResetId(null);
            setNewPass('');
        } else {
            toast.error("重置失败");
        }
    };

    const handleRoleChange = async (id: number, role: UserRole) => {
        const res = await updateUserRoleAction(id, role);
        if (res.success) {
            toast.success("角色已更新");
            loadUsers();
        } else {
            toast.error(res.error || "更新失败");
        }
    };

    const handleRevokeSession = async (id: number) => {
        if (!confirm(`确定要强制下线用户 ID:${id} 的所有活动会话吗？用户需要重新登录。`)) return;
        const res = await revokeUserSessionAction(id);
        if (res.success) {
            toast.success("用户已强制下线");
        } else {
            toast.error(res.error || "操作失败");
        }
    };

    // 打开订阅对话框
    const openSubDialog = (user: UserWithSubscription) => {
        setSubUserId(user.id);
        setSubUserName(user.username);
        setSelectedPlanId(user.plan_id || 'free');
        setSubDuration('0');
        setSubDialogOpen(true);
    };

    // 保存订阅
    const handleSaveSubscription = async () => {
        if (!subUserId) return;
        setSavingSub(true);
        try {
            const duration = parseInt(subDuration);
            const res = await setUserSubscriptionAction(subUserId, selectedPlanId, duration || undefined);
            if (res.success) {
                toast.success('订阅已更新');
                setSubDialogOpen(false);
                // 更新本地状态
                const planName = plans.find(p => p.id === selectedPlanId)?.name || selectedPlanId;
                setUsers(users.map(u =>
                    u.id === subUserId
                        ? { ...u, plan_id: selectedPlanId, plan_name: planName }
                        : u
                ));
            } else {
                toast.error(res.error || '操作失败');
            }
        } catch (e) {
            toast.error('操作失败');
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
            case 'pro': return 'default';
            case 'basic': return 'secondary';
            default: return 'outline';
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
                                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                            <Loader2 className="animate-spin h-6 w-6 mx-auto mb-2" />
                                            加载中...
                                        </td>
                                    </tr>
                                ) : filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                            没有找到用户
                                        </td>
                                    </tr>
                                ) : (
                                    filteredUsers.map((user) => (
                                        <tr key={user.id} className="border-b last:border-0 hover:bg-muted/10 transition-colors">
                                            <td className="p-4 font-mono">{user.id}</td>
                                            <td className="p-4 font-medium">{user.username}</td>
                                            <td className="p-4 text-muted-foreground">
                                                {new Date(user.created_at).toLocaleString('zh-CN')}
                                            </td>
                                            <td className="p-4">
                                                {user.is_admin ? (
                                                    <span className="inline-flex items-center gap-1 bg-primary/10 text-primary px-2 py-1 rounded text-xs font-bold">
                                                        <Shield className="h-3 w-3" />
                                                        管理员
                                                    </span>
                                                ) : (
                                                    <select
                                                        value={user.role || 'student'}
                                                        onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                                                        className="text-xs border border-border rounded px-2 py-1 bg-background focus:ring-1 focus:ring-primary outline-none"
                                                    >
                                                        <option value="student">学生</option>
                                                        <option value="admin">管理员</option>
                                                    </select>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <Badge
                                                    variant={getPlanBadgeVariant(user.plan_id || 'free')}
                                                    className="cursor-pointer hover:opacity-80"
                                                    onClick={() => openSubDialog(user)}
                                                >
                                                    <CreditCard className="h-3 w-3 mr-1" />
                                                    {user.plan_name || '免费版'}
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

                                                <Dialog open={resetId === user.id} onOpenChange={(open) => !open && setResetId(null)}>
                                                    <DialogTrigger asChild>
                                                        <Button variant="outline" size="sm" onClick={() => setResetId(user.id)}>
                                                            <KeyRound className="h-4 w-4 mr-1" />
                                                            重置密码
                                                        </Button>
                                                    </DialogTrigger>
                                                    <DialogContent>
                                                        <DialogHeader>
                                                            <DialogTitle>重置密码 - {user.username}</DialogTitle>
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
                                                            <Button variant="outline" onClick={() => setResetId(null)}>取消</Button>
                                                            <Button onClick={handleResetPassword}>确认重置</Button>
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
                        显示 {users.length > 0 ? (page - 1) * limit + 1 : 0} 到 {Math.min(page * limit, total)} 条，共 {total} 条
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1 || loading}
                        >
                            上一页
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => p + 1)}
                            disabled={page * limit >= total || loading}
                        >
                            下一页
                        </Button>
                    </div>
                </div>
            </Card >

            {/* 订阅对话框 */}
            < Dialog open={subDialogOpen} onOpenChange={setSubDialogOpen} >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>设置订阅 - {subUserName}</DialogTitle>
                        <DialogDescription>
                            为用户分配订阅套餐
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>选择套餐</Label>
                            <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {plans.map(plan => (
                                        <SelectItem key={plan.id} value={plan.id}>
                                            {plan.name} - {plan.price_monthly === 0 ? '免费' : `¥${plan.price_monthly / 100}/月`}
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
                        <Button variant="outline" onClick={() => setSubDialogOpen(false)}>取消</Button>
                        <Button onClick={handleSaveSubscription} disabled={savingSub}>
                            {savingSub && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            确认
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog >
        </div >
    );
}
