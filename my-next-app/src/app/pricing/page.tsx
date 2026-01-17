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
        <div className="min-h-screen bg-[#faf9f6]">
            {/* Header removed as it is now handled by Sidebar */}
            <div className="container mx-auto px-6 py-12 md:py-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* 标题区 */}
                <div className="text-center mb-16 space-y-4">
                    <Badge variant="outline" className="px-4 py-1.5 border-emerald-200 text-emerald-700 bg-emerald-50/50 rounded-full font-serif">
                        <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                        订阅方案
                    </Badge>
                    <h1 className="text-4xl md:text-5xl font-serif font-bold text-neutral-800 tracking-tight">
                        投资您的<span className="text-emerald-700 mx-2">未来</span>
                    </h1>
                    <p className="text-lg text-neutral-500 max-w-2xl mx-auto font-sans leading-relaxed">
                        简单透明的定价，无隐藏费用。解锁 AI 助教的全部潜力，让学习事半功倍。
                    </p>
                </div>

                {/* 套餐卡片 */}
                <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                    {plans.map((plan) => {
                        const price = formatPrice(plan.price_monthly);
                        const isCurrent = isCurrentPlan(plan.id);
                        const recommended = isRecommended(plan.id);

                        return (
                            <Card
                                key={plan.id}
                                className={`relative transition-all duration-300 overflow-hidden flex flex-col
                                    ${recommended
                                        ? 'border-emerald-200 shadow-2xl shadow-emerald-100/50 scale-105 z-10 bg-white'
                                        : 'border-neutral-200 hover:border-emerald-200/50 hover:shadow-lg bg-white/50 backdrop-blur-sm'
                                    } ${isCurrent ? 'ring-2 ring-emerald-500 ring-offset-2' : ''}`}
                            >
                                {/* 推荐标签 */}
                                {recommended && (
                                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
                                )}

                                <CardHeader className="pt-8 pb-6">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-sm
                                            ${plan.tier === 'free' ? 'bg-neutral-400' :
                                                plan.tier === 'basic' ? 'bg-gradient-to-br from-emerald-500 to-teal-600' :
                                                    'bg-gradient-to-br from-amber-400 to-orange-500'}`}>
                                            {planIcons[plan.tier] || <Zap className="w-6 h-6" />}
                                        </div>
                                        {recommended && (
                                            <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-1 rounded-md font-bold">
                                                推荐
                                            </span>
                                        )}
                                    </div>
                                    <CardTitle className="text-2xl font-serif font-bold text-neutral-800">{plan.name}</CardTitle>
                                    <CardDescription className="text-neutral-400 mt-1">
                                        {plan.tier === 'free' && '体验核心功能，适合初学者'}
                                        {plan.tier === 'basic' && '解锁 AI 深度辅导，适合备考党'}
                                        {plan.tier === 'pro' && '无限制畅享所有功能，极客首选'}
                                    </CardDescription>
                                </CardHeader>

                                <CardContent className="flex-1 space-y-8">
                                    {/* 价格 */}
                                    <div className="flex items-baseline">
                                        <span className="text-4xl font-bold text-neutral-800">¥{price.amount}</span>
                                        <span className="text-neutral-400 ml-1">{price.unit}</span>
                                    </div>

                                    {/* 特性列表 */}
                                    <ul className="space-y-4">
                                        {plan.features.map((feature, i) => (
                                            <li key={i} className="flex items-start gap-3 text-sm text-neutral-600 group hover:text-neutral-900 transition-colors">
                                                <div className={`mt-0.5 rounded-full p-0.5 ${recommended ? 'text-emerald-600 bg-emerald-50' : 'text-neutral-400 bg-neutral-100'}`}>
                                                    <Check className="w-3.5 h-3.5" />
                                                </div>
                                                <span className="leading-tight">{feature}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>

                                <CardFooter className="pt-6 pb-8">
                                    {isCurrent ? (
                                        <Button className="w-full bg-neutral-100 text-neutral-400 hover:bg-neutral-100 cursor-default" variant="ghost">
                                            当前方案
                                        </Button>
                                    ) : plan.price_monthly === 0 ? (
                                        <Button className="w-full border-neutral-200 text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900" variant="outline" disabled>
                                            免费试用中
                                        </Button>
                                    ) : (
                                        <Button
                                            className={`w-full h-11 rounded-xl font-medium transition-all duration-300
                                                ${recommended
                                                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-200'
                                                    : 'bg-neutral-900 text-white hover:bg-neutral-800'}`}
                                        >
                                            立即升级
                                            <ArrowRight className="w-4 h-4 ml-2 opacity-70 group-hover:translate-x-1 transition-transform" />
                                        </Button>
                                    )}
                                </CardFooter>
                            </Card>
                        );
                    })}
                </div>

                {/* 底部说明 */}
                <div className="text-center mt-20 pb-10 border-t border-neutral-100 pt-10">
                    <p className="text-sm text-neutral-400 mb-2">
                        支付问题？企业采购？
                        <Button variant="link" className="text-emerald-600 hover:text-emerald-700 p-0 h-auto ml-1 font-medium">
                            联系客服支持
                        </Button>
                    </p>
                    <p className="text-xs text-neutral-300">
                        Secure payment powered by Stripe. All plans include 7-day money-back guarantee.
                    </p>
                </div>

                {/* 当前用量展示 (如果已登录) */}
                {currentSub && (
                    <div className="mt-8 max-w-3xl mx-auto">
                        <Card className="border-neutral-200 shadow-sm bg-white/80">
                            <CardHeader className="pb-4 border-b border-neutral-50">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-lg font-serif text-neutral-800">今日用量统计</CardTitle>
                                        <CardDescription className="text-xs mt-1">次日 00:00 自动重置</CardDescription>
                                    </div>
                                    <Badge variant="secondary" className="bg-neutral-100 text-neutral-500 font-normal">
                                        {new Date().toLocaleDateString()}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-6">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                    {Object.entries(currentSub.usage_today).map(([type, count]) => {
                                        const limit = currentSub.plan.limits[type as keyof typeof currentSub.plan.limits];
                                        const labels: Record<string, string> = {
                                            ai_chat: 'AI 对话',
                                            practice: '练习题',
                                            review: 'AI 复盘',
                                            rag: '知识检索',
                                            mnemonic: 'AI 记忆',
                                            first_principles: '第一性原理'
                                        };
                                        const percent = limit === -1 ? 0 : Math.min(100, (count / limit) * 100);

                                        return (
                                            <div key={type} className="group">
                                                <div className="flex justify-between items-end mb-2">
                                                    <span className="text-xs font-medium text-neutral-500">{labels[type]}</span>
                                                    <span className="text-xs text-neutral-400">
                                                        {limit === -1 ? '∞' : `${Math.round(percent)}%`}
                                                    </span>
                                                </div>
                                                <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-500 ease-out
                                                            ${percent > 90 ? 'bg-red-500' :
                                                                percent > 70 ? 'bg-amber-500' :
                                                                    'bg-emerald-500'}`}
                                                        style={{ width: `${limit === -1 ? 100 : percent}%` }}
                                                    />
                                                </div>
                                                <div className="mt-2 text-lg font-bold text-neutral-700">
                                                    {count}
                                                    <span className="text-xs font-normal text-neutral-400 ml-0.5">
                                                        /{limit === -1 ? '∞' : limit}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
}
