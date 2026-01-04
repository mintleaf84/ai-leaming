'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Sparkles, Crown, Zap, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getActivePlansAction, getMySubscriptionAction } from '@/server/actions/subscription';
import { SubscriptionPlan, UserSubscriptionDetail } from '@/lib/billing/subscription-types';
import Link from 'next/link';

// 套餐图标映射
const planIcons: Record<string, React.ReactNode> = {
    free: <Zap className="w-6 h-6" />,
    basic: <Sparkles className="w-6 h-6" />,
    pro: <Crown className="w-6 h-6" />
};

// 套餐颜色映射
const planColors: Record<string, string> = {
    free: 'from-slate-500 to-slate-600',
    basic: 'from-blue-500 to-indigo-600',
    pro: 'from-amber-500 to-orange-600'
};

export default function PricingPage() {
    const router = useRouter();
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [currentSub, setCurrentSub] = useState<UserSubscriptionDetail | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [plansRes, subRes] = await Promise.all([
                    getActivePlansAction(),
                    getMySubscriptionAction()
                ]);

                if (plansRes.success && plansRes.plans) {
                    setPlans(plansRes.plans);
                }
                if (subRes.success && subRes.subscription) {
                    setCurrentSub(subRes.subscription);
                }
            } catch (error) {
                console.error('加载数据失败', error);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, []);

    // 格式化价格
    const formatPrice = (cents: number) => {
        if (cents === 0) return { amount: '0', unit: '' };
        return { amount: (cents / 100).toString(), unit: '/月' };
    };

    // 是否为当前套餐
    const isCurrentPlan = (planId: string) => {
        return currentSub?.plan_id === planId;
    };

    // 是否为推荐套餐
    const isRecommended = (planId: string) => {
        return planId === 'basic';
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
            {/* 顶部导航 */}
            <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                    <Link href="/" className="text-xl font-bold text-primary">
                        AI 教招智学
                    </Link>
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard">
                            <Button variant="ghost">仪表盘</Button>
                        </Link>
                        <Link href="/settings">
                            <Button variant="outline">账户设置</Button>
                        </Link>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-16">
                {/* 标题区 */}
                <div className="text-center mb-16">
                    <Badge variant="outline" className="mb-4 px-4 py-1">
                        <Sparkles className="w-3 h-3 mr-1" />
                        选择适合您的方案
                    </Badge>
                    <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
                        简单透明的定价
                    </h1>
                    <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                        无隐藏费用，随时升级或降级。选择最适合您学习需求的方案。
                    </p>
                </div>

                {/* 套餐卡片 */}
                <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                    {plans.map((plan) => {
                        const price = formatPrice(plan.price_monthly);
                        const isCurrent = isCurrentPlan(plan.id);
                        const recommended = isRecommended(plan.id);

                        return (
                            <Card
                                key={plan.id}
                                className={`relative overflow-hidden transition-all duration-300 hover:shadow-xl ${recommended
                                        ? 'border-primary shadow-lg scale-105 z-10'
                                        : 'hover:border-primary/50'
                                    } ${isCurrent ? 'ring-2 ring-primary' : ''}`}
                            >
                                {/* 推荐标签 */}
                                {recommended && (
                                    <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs px-3 py-1 rounded-bl-lg font-medium">
                                        推荐
                                    </div>
                                )}

                                {/* 当前套餐标签 */}
                                {isCurrent && (
                                    <div className="absolute top-0 left-0 bg-green-500 text-white text-xs px-3 py-1 rounded-br-lg font-medium">
                                        当前套餐
                                    </div>
                                )}

                                {/* 顶部渐变条 */}
                                <div className={`h-1.5 bg-gradient-to-r ${planColors[plan.tier] || planColors.free}`} />

                                <CardHeader className="pt-8 pb-4">
                                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${planColors[plan.tier] || planColors.free} flex items-center justify-center text-white mb-4`}>
                                        {planIcons[plan.tier] || planIcons.free}
                                    </div>
                                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                                    <CardDescription>
                                        {plan.tier === 'free' && '体验核心功能'}
                                        {plan.tier === 'basic' && '满足日常学习需求'}
                                        {plan.tier === 'pro' && '无限制畅享所有功能'}
                                    </CardDescription>
                                </CardHeader>

                                <CardContent className="pb-6">
                                    {/* 价格 */}
                                    <div className="mb-6">
                                        <span className="text-4xl font-bold">¥{price.amount}</span>
                                        <span className="text-muted-foreground">{price.unit}</span>
                                    </div>

                                    {/* 特性列表 */}
                                    <ul className="space-y-3">
                                        {plan.features.map((feature, i) => (
                                            <li key={i} className="flex items-start gap-2">
                                                <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                                                <span className="text-sm">{feature}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>

                                <CardFooter className="pt-4">
                                    {isCurrent ? (
                                        <Button className="w-full" variant="outline" disabled>
                                            当前方案
                                        </Button>
                                    ) : plan.price_monthly === 0 ? (
                                        <Button className="w-full" variant="outline" disabled>
                                            免费使用
                                        </Button>
                                    ) : (
                                        <Button
                                            className={`w-full group ${recommended ? 'bg-gradient-to-r ' + planColors[plan.tier] + ' hover:opacity-90' : ''}`}
                                            variant={recommended ? 'default' : 'outline'}
                                        >
                                            立即升级
                                            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                                        </Button>
                                    )}
                                </CardFooter>
                            </Card>
                        );
                    })}
                </div>

                {/* 底部说明 */}
                <div className="text-center mt-16 text-muted-foreground">
                    <p className="mb-2">所有付费套餐均支持 7 天无理由退款</p>
                    <p className="text-sm">
                        如需企业/机构批量订阅，请
                        <Button variant="link" className="px-1 h-auto">联系我们</Button>
                    </p>
                </div>

                {/* 当前用量展示 (如果已登录) */}
                {currentSub && (
                    <div className="mt-16 max-w-2xl mx-auto">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">今日用量</CardTitle>
                                <CardDescription>您当前的套餐使用情况</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {Object.entries(currentSub.usage_today).map(([type, count]) => {
                                        const limit = currentSub.plan.limits[type as keyof typeof currentSub.plan.limits];
                                        const labels: Record<string, string> = {
                                            ai_chat: 'AI 对话',
                                            practice: '练习题',
                                            review: 'AI 复盘',
                                            rag: 'RAG 检索'
                                        };
                                        const percent = limit === -1 ? 0 : Math.min(100, (count / limit) * 100);

                                        return (
                                            <div key={type} className="text-center">
                                                <div className="text-sm text-muted-foreground mb-1">{labels[type]}</div>
                                                <div className="text-2xl font-bold">
                                                    {count}
                                                    <span className="text-sm font-normal text-muted-foreground">
                                                        /{limit === -1 ? '∞' : limit}
                                                    </span>
                                                </div>
                                                <div className="h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all ${percent > 80 ? 'bg-red-500' : percent > 50 ? 'bg-amber-500' : 'bg-green-500'
                                                            }`}
                                                        style={{ width: `${limit === -1 ? 0 : percent}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </main>
        </div>
    );
}
