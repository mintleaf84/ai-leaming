'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
    getPlansAction,
    savePlanAction,
    deletePlanAction,
    getSubscriptionStatsAction
} from '@/server/actions/subscription';
import { SubscriptionPlan, PlanTier, UsageType, USAGE_TYPE_LABELS, PLAN_TIER_LABELS } from '@/lib/billing/subscription-types';

// 默认空套餐表单
const emptyPlan: Omit<SubscriptionPlan, 'created_at'> = {
    id: '',
    name: '',
    tier: 'basic',
    price_monthly: 0,
    limits: { ai_chat: -1, practice: -1, review: -1, rag: -1, mnemonic: -1, first_principles: -1 },
    features: [],
    is_active: true,
    sort_order: 0
};

export default function PlansPage() {
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [stats, setStats] = useState<{ totalUsers: number; byPlan: { plan_id: string; plan_name: string; count: number }[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingPlan, setEditingPlan] = useState<Omit<SubscriptionPlan, 'created_at'> | null>(null);
    const [saving, setSaving] = useState(false);
    const [featuresText, setFeaturesText] = useState('');

    // 加载数据
    const loadData = async () => {
        setLoading(true);
        try {
            const [plansRes, statsRes] = await Promise.all([
                getPlansAction(false),
                getSubscriptionStatsAction()
            ]);
            if (plansRes.success && plansRes.plans) {
                setPlans(plansRes.plans);
            }
            if (statsRes.success && statsRes.stats) {
                setStats(statsRes.stats);
            }
        } catch (error) {
            toast.error('加载数据失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // 打开新增对话框
    const handleAdd = () => {
        setEditingPlan({ ...emptyPlan, sort_order: plans.length + 1 });
        setFeaturesText('');
        setDialogOpen(true);
    };

    // 打开编辑对话框
    const handleEdit = (plan: SubscriptionPlan) => {
        setEditingPlan({ ...plan });
        setFeaturesText(plan.features.join('\n'));
        setDialogOpen(true);
    };

    // 保存套餐
    const handleSave = async () => {
        if (!editingPlan) return;

        // 验证
        if (!editingPlan.id.trim()) {
            toast.error('请输入套餐 ID');
            return;
        }
        if (!editingPlan.name.trim()) {
            toast.error('请输入套餐名称');
            return;
        }

        setSaving(true);
        try {
            const planToSave = {
                ...editingPlan,
                features: featuresText.split('\n').filter(f => f.trim())
            };
            const res = await savePlanAction(planToSave);
            if (res.success) {
                toast.success('套餐保存成功');
                setDialogOpen(false);
                loadData();
            } else {
                toast.error(res.error || '保存失败');
            }
        } catch (error) {
            toast.error('保存失败');
        } finally {
            setSaving(false);
        }
    };

    // 删除套餐
    const handleDelete = async (planId: string) => {
        if (!confirm('确定要删除此套餐吗？')) return;

        try {
            const res = await deletePlanAction(planId);
            if (res.success) {
                toast.success('删除成功');
                loadData();
            } else {
                toast.error(res.error || '删除失败');
            }
        } catch (error) {
            toast.error('删除失败');
        }
    };

    // 切换启用状态
    const handleToggleActive = async (plan: SubscriptionPlan) => {
        try {
            const res = await savePlanAction({ ...plan, is_active: !plan.is_active });
            if (res.success) {
                toast.success(plan.is_active ? '已禁用' : '已启用');
                loadData();
            }
        } catch (error) {
            toast.error('操作失败');
        }
    };

    // 获取套餐用户数
    const getPlanUserCount = (planId: string) => {
        return stats?.byPlan.find(p => p.plan_id === planId)?.count || 0;
    };

    // 格式化价格
    const formatPrice = (cents: number) => {
        if (cents === 0) return '免费';
        return `¥${(cents / 100).toFixed(0)}/月`;
    };

    // 格式化限额
    const formatLimit = (limit: number) => {
        return limit === -1 ? '无限' : limit.toString();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            {/* 页头 */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">套餐管理</h1>
                    <p className="text-muted-foreground mt-1">配置订阅套餐与用量限制</p>
                </div>
                <Button onClick={handleAdd}>
                    <Plus className="w-4 h-4 mr-2" />
                    新增套餐
                </Button>
            </div>

            {/* 统计卡片 */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>总用户数</CardDescription>
                            <CardTitle className="text-2xl">{stats.totalUsers}</CardTitle>
                        </CardHeader>
                    </Card>
                    {stats.byPlan.map(p => (
                        <Card key={p.plan_id}>
                            <CardHeader className="pb-2">
                                <CardDescription>{p.plan_name || p.plan_id}</CardDescription>
                                <CardTitle className="text-2xl">{p.count}</CardTitle>
                            </CardHeader>
                        </Card>
                    ))}
                </div>
            )}

            {/* 套餐列表 */}
            <div className="grid gap-4">
                {plans.map(plan => (
                    <Card key={plan.id} className={!plan.is_active ? 'opacity-60' : ''}>
                        <CardContent className="p-6">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-lg font-semibold">{plan.name}</h3>
                                        <Badge variant={plan.is_active ? 'default' : 'secondary'}>
                                            {plan.is_active ? '启用' : '禁用'}
                                        </Badge>
                                        <Badge variant="outline">{PLAN_TIER_LABELS[plan.tier]}</Badge>
                                        <span className="text-lg font-bold text-primary">
                                            {formatPrice(plan.price_monthly)}
                                        </span>
                                    </div>

                                    <p className="text-sm text-muted-foreground mt-1">
                                        ID: {plan.id} · {getPlanUserCount(plan.id)} 位用户
                                    </p>

                                    {/* 限额展示 */}
                                    <div className="flex flex-wrap gap-4 mt-3">
                                        {(Object.keys(plan.limits) as UsageType[]).map(type => (
                                            <div key={type} className="text-sm">
                                                <span className="text-muted-foreground">{USAGE_TYPE_LABELS[type]}:</span>
                                                <span className="ml-1 font-medium">{formatLimit(plan.limits[type])}/日</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* 特性列表 */}
                                    {plan.features.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-3">
                                            {plan.features.map((f, i) => (
                                                <Badge key={i} variant="outline" className="font-normal">
                                                    <Check className="w-3 h-3 mr-1" />
                                                    {f}
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* 操作按钮 */}
                                <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="icon" onClick={() => handleToggleActive(plan)}>
                                        {plan.is_active ? (
                                            <ToggleRight className="w-5 h-5 text-green-500" />
                                        ) : (
                                            <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                                        )}
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => handleEdit(plan)}>
                                        <Edit2 className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => handleDelete(plan.id)}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* 编辑对话框 */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingPlan?.id ? '编辑套餐' : '新增套餐'}</DialogTitle>
                        <DialogDescription>配置套餐信息与用量限制</DialogDescription>
                    </DialogHeader>

                    {editingPlan && (
                        <div className="space-y-4 py-4">
                            {/* 基本信息 */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>套餐 ID</Label>
                                    <Input
                                        value={editingPlan.id}
                                        onChange={e => setEditingPlan({ ...editingPlan, id: e.target.value })}
                                        placeholder="如: basic"
                                        disabled={plans.some(p => p.id === editingPlan.id)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>套餐名称</Label>
                                    <Input
                                        value={editingPlan.name}
                                        onChange={e => setEditingPlan({ ...editingPlan, name: e.target.value })}
                                        placeholder="如: 基础版"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label>套餐等级</Label>
                                    <Select
                                        value={editingPlan.tier}
                                        onValueChange={v => setEditingPlan({ ...editingPlan, tier: v as PlanTier })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {(Object.keys(PLAN_TIER_LABELS) as PlanTier[]).map(tier => (
                                                <SelectItem key={tier} value={tier}>
                                                    {PLAN_TIER_LABELS[tier]}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>月价格 (元)</Label>
                                    <Input
                                        type="number"
                                        value={editingPlan.price_monthly / 100}
                                        onChange={e => setEditingPlan({
                                            ...editingPlan,
                                            price_monthly: Math.round(parseFloat(e.target.value || '0') * 100)
                                        })}
                                        placeholder="0"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>排序顺序</Label>
                                    <Input
                                        type="number"
                                        value={editingPlan.sort_order || 0}
                                        onChange={e => setEditingPlan({
                                            ...editingPlan,
                                            sort_order: parseInt(e.target.value || '0')
                                        })}
                                    />
                                </div>
                            </div>

                            {/* 用量限制 */}
                            <div className="space-y-2">
                                <Label>每日用量限制 (-1 表示无限)</Label>
                                <div className="grid grid-cols-2 gap-4">
                                    {(Object.keys(USAGE_TYPE_LABELS) as UsageType[]).map(type => (
                                        <div key={type} className="flex items-center gap-2">
                                            <span className="w-24 text-sm text-muted-foreground">
                                                {USAGE_TYPE_LABELS[type]}
                                            </span>
                                            <Input
                                                type="number"
                                                value={editingPlan.limits[type]}
                                                onChange={e => setEditingPlan({
                                                    ...editingPlan,
                                                    limits: {
                                                        ...editingPlan.limits,
                                                        [type]: parseInt(e.target.value || '0')
                                                    }
                                                })}
                                                className="w-24"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* 特性列表 */}
                            <div className="space-y-2">
                                <Label>特性列表 (每行一个)</Label>
                                <textarea
                                    value={featuresText}
                                    onChange={e => setFeaturesText(e.target.value)}
                                    className="w-full h-24 px-3 py-2 border rounded-md text-sm resize-none"
                                    placeholder="每日 100 次 AI 对话&#10;无限练习题目&#10;优先客服支持"
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>
                            取消
                        </Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
