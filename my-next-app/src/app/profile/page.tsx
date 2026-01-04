'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    User,
    Crown,
    Calendar,
    Target,
    CheckCircle2,
    BookOpen,
    MessageSquare,
    TrendingUp,
    Sparkles,
    Settings,
    CreditCard,
    ArrowRight,
    Loader2,
    Award
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { getUserProfileAction } from '@/server/actions/profile';

// 用量类型标签
const USAGE_LABELS: Record<string, string> = {
    ai_chat: 'AI 对话',
    practice: '练习题目',
    review: 'AI 复盘',
    rag: 'RAG 检索'
};

export default function ProfilePage() {
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadProfile = async () => {
            try {
                const res = await getUserProfileAction();
                if (res.success && res.profile) {
                    setProfile(res.profile);
                }
            } catch (error) {
                console.error('加载个人信息失败', error);
            } finally {
                setLoading(false);
            }
        };
        loadProfile();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <p className="text-muted-foreground mb-4">无法加载个人信息</p>
                    <Link href="/login">
                        <Button>去登录</Button>
                    </Link>
                </div>
            </div>
        );
    }

    const { stats, subscription } = profile;

    // 格式化日期
    const formatDate = (dateStr: string) => {
        if (!dateStr) return '未知';
        return new Date(dateStr).toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    // 计算用量百分比
    const getUsagePercent = (current: number, limit: number) => {
        if (limit === -1) return 0; // 无限
        return Math.min(100, (current / limit) * 100);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 pb-20">
            {/* 顶部横幅 */}
            <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b">
                <div className="container mx-auto px-4 py-8">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                                {profile.username.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold">{profile.username}</h1>
                                <p className="text-muted-foreground flex items-center gap-2 mt-1">
                                    <Calendar className="w-4 h-4" />
                                    {formatDate(profile.created_at)} 加入
                                </p>
                            </div>
                        </div>
                        <Link href="/settings">
                            <Button variant="outline" size="sm">
                                <Settings className="w-4 h-4 mr-2" />
                                设置
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>

            <div className="container mx-auto px-4 py-8">
                <div className="grid md:grid-cols-3 gap-6">
                    {/* 左侧：订阅信息 + 用量统计 */}
                    <div className="md:col-span-1 space-y-6">
                        {/* 订阅信息卡片 */}
                        <Card className="overflow-hidden">
                            <div className="h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Crown className="w-4 h-4 text-amber-500" />
                                    订阅信息
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {subscription ? (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground text-sm">当前套餐</span>
                                            <Badge variant="secondary" className="font-medium">
                                                {subscription.plan_name}
                                            </Badge>
                                        </div>
                                        {subscription.expires_at && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground text-sm">到期时间</span>
                                                <span className="text-sm">{formatDate(subscription.expires_at)}</span>
                                            </div>
                                        )}
                                        <Link href="/pricing" className="block pt-2">
                                            <Button variant="outline" size="sm" className="w-full group">
                                                <Sparkles className="w-4 h-4 mr-2" />
                                                {subscription.plan_id === 'free' ? '升级套餐' : '管理订阅'}
                                                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                                            </Button>
                                        </Link>
                                    </div>
                                ) : (
                                    <div className="text-center py-4">
                                        <p className="text-muted-foreground text-sm mb-3">暂无订阅信息</p>
                                        <Link href="/pricing">
                                            <Button size="sm">查看套餐</Button>
                                        </Link>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* 今日用量卡片 */}
                        {subscription && (
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <Target className="w-4 h-4 text-blue-500" />
                                        今日用量
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {Object.entries(subscription.usage_today).map(([type, count]) => {
                                        const limit = subscription.limits[type as keyof typeof subscription.limits];
                                        const percent = getUsagePercent(count as number, limit);
                                        return (
                                            <div key={type}>
                                                <div className="flex justify-between text-sm mb-1">
                                                    <span className="text-muted-foreground">{USAGE_LABELS[type]}</span>
                                                    <span className="font-medium">
                                                        {count} / {limit === -1 ? '∞' : limit}
                                                    </span>
                                                </div>
                                                <Progress
                                                    value={limit === -1 ? 5 : percent}
                                                    className="h-2"
                                                />
                                            </div>
                                        );
                                    })}
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* 右侧：学习数据 */}
                    <div className="md:col-span-2 space-y-6">
                        {/* 学习概览 */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <Card>
                                <CardContent className="pt-6 text-center">
                                    <BookOpen className="w-8 h-8 mx-auto mb-2 text-blue-500" />
                                    <div className="text-2xl font-bold">{stats.total_questions}</div>
                                    <div className="text-xs text-muted-foreground">练习题目</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6 text-center">
                                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
                                    <div className="text-2xl font-bold">{stats.accuracy}%</div>
                                    <div className="text-xs text-muted-foreground">正确率</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6 text-center">
                                    <Award className="w-8 h-8 mx-auto mb-2 text-amber-500" />
                                    <div className="text-2xl font-bold">{stats.mastered_tags}/{stats.total_tags}</div>
                                    <div className="text-xs text-muted-foreground">已掌握知识点</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6 text-center">
                                    <MessageSquare className="w-8 h-8 mx-auto mb-2 text-purple-500" />
                                    <div className="text-2xl font-bold">{stats.total_chats}</div>
                                    <div className="text-xs text-muted-foreground">AI 对话</div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* 学习成就卡片 */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5 text-primary" />
                                    学习成就
                                </CardTitle>
                                <CardDescription>您的学习历程</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-3 gap-4 text-center">
                                    <div className="p-4 bg-muted/50 rounded-lg">
                                        <div className="text-3xl font-bold text-primary">{stats.practice_days}</div>
                                        <div className="text-sm text-muted-foreground mt-1">学习天数</div>
                                    </div>
                                    <div className="p-4 bg-muted/50 rounded-lg">
                                        <div className="text-3xl font-bold text-primary">{stats.total_sessions}</div>
                                        <div className="text-sm text-muted-foreground mt-1">练习轮次</div>
                                    </div>
                                    <div className="p-4 bg-muted/50 rounded-lg">
                                        <div className="text-3xl font-bold text-primary">{stats.correct_count}</div>
                                        <div className="text-sm text-muted-foreground mt-1">正确答题</div>
                                    </div>
                                </div>

                                {/* 快捷入口 */}
                                <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t">
                                    <Link href="/practice">
                                        <Button variant="outline" size="sm">
                                            <BookOpen className="w-4 h-4 mr-2" />
                                            继续练习
                                        </Button>
                                    </Link>
                                    <Link href="/history">
                                        <Button variant="outline" size="sm">
                                            <Calendar className="w-4 h-4 mr-2" />
                                            练习记录
                                        </Button>
                                    </Link>
                                    <Link href="/dashboard">
                                        <Button variant="outline" size="sm">
                                            <TrendingUp className="w-4 h-4 mr-2" />
                                            知识图谱
                                        </Button>
                                    </Link>
                                    <Link href="/chat">
                                        <Button variant="outline" size="sm">
                                            <MessageSquare className="w-4 h-4 mr-2" />
                                            AI 助手
                                        </Button>
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
