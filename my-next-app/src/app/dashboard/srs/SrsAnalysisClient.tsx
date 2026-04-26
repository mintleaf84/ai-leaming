"use client";

import React from 'react';
import { 
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area 
} from 'recharts';
import { 
    Brain, Target, Zap, Clock, Calendar, 
    TrendingUp, ShieldCheck, AlertCircle, Info, ChevronRight, RotateCcw
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SrsGlobalStats, syncSrsDataAction } from '@/server/actions/srs';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

const STATE_COLORS = {
    new: '#94a3b8',       // slate-400
    learning: '#38bdf8',  // sky-400
    review: '#10b981',    // emerald-500
    relearning: '#f43f5e', // rose-500
};

export default function SrsAnalysisClient({ stats }: { stats: SrsGlobalStats }) {
    const router = useRouter();
    const [isSyncing, setIsSyncing] = React.useState(false);

    const handleSync = async () => {
        try {
            setIsSyncing(true);
            const count = await syncSrsDataAction();
            toast.success(`同步完成！`, {
                description: `已为 ${count} 道题目更新了记忆状态与阅读速度参数。`
            });
            router.refresh();
        } catch (err) {
            console.error('Sync failed:', err);
            toast.error('同步失败，请稍后重试');
        } finally {
            setIsSyncing(false);
        }
    };

    const stateData = [
        { name: '新题目', value: stats.stateDistribution.new, color: STATE_COLORS.new },
        { name: '学习中', value: stats.stateDistribution.learning, color: STATE_COLORS.learning },
        { name: '已掌握', value: stats.stateDistribution.review, color: STATE_COLORS.review },
        { name: '重学中', value: stats.stateDistribution.relearning, color: STATE_COLORS.relearning },
    ].filter(d => d.value > 0);

    return (
        <div className="space-y-8 pb-12">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-serif font-bold text-foreground tracking-tight flex items-center gap-3">
                        <Brain className="w-8 h-8 text-primary" />
                        记忆引擎分析
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        基于 FSRS 算法的个性化记忆状态深度分析
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 px-3 py-1">
                        <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                        算法状态: 运行良好
                    </Badge>
                </div>
            </div>

            {/* Top Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                    { label: '总掌握题目', value: stats.totalCards, icon: Target, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                    { label: '真实保留率', value: `${stats.retentionStats.trueRetention.toFixed(1)}%`, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10', sub: `近 30 天 ${stats.retentionStats.totalReviews} 次复习` },
                    { label: '当前稳定性', value: stats.stabilityDistribution[stats.stabilityDistribution.length - 1].count > 0 ? '极佳' : '稳步提升', icon: Zap, color: 'text-amber-500', bg: 'bg-amber-500/10' },
                    { label: '待复习错题', value: stats.futureReviews[0]?.count || 0, icon: Clock, color: 'text-purple-500', bg: 'bg-purple-500/10', sub: stats.futureReviews[0] ? `预计耗时 ${stats.futureReviews[0].estimatedMinutes} min` : '暂无待办' },
                ].map((m, i) => (
                    <Card key={i} className="border-border/50 bg-card/50 backdrop-blur-sm">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{m.label}</p>
                                    <h3 className="text-2xl font-bold mt-1">{m.value}</h3>
                                    {m.sub && <p className="text-[10px] text-muted-foreground mt-1">{m.sub}</p>}
                                </div>
                                <div className={`p-3 rounded-2xl ${m.bg} ${m.color}`}>
                                    <m.icon className="w-5 h-5" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Main Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* State Distribution */}
                <Card className="border-border/50 shadow-sm overflow-hidden group">
                    <CardHeader className="border-b border-border/50 bg-muted/20">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Info className="w-4 h-4 text-primary" />
                            记忆状态分布
                        </CardTitle>
                        <CardDescription>展示您当前所有题目的记忆阶段比例</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={stateData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {stateData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <RechartsTooltip 
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="flex justify-center gap-4 mt-[-40px] relative z-10">
                            {stateData.map(d => (
                                <div key={d.name} className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                                    <span className="text-[10px] text-muted-foreground font-medium">{d.name}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Stability Distribution */}
                <Card className="border-border/50 shadow-sm overflow-hidden">
                    <CardHeader className="border-b border-border/50 bg-muted/20">
                        <CardTitle className="text-base flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-primary" />
                            稳定性强度 (Stability)
                        </CardTitle>
                        <CardDescription>数值越高代表记忆越牢固，复习间隔越长</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.stabilityDistribution}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                <XAxis dataKey="range" axisLine={false} tickLine={false} fontSize={10} tick={{ fill: '#888' }} />
                                <YAxis axisLine={false} tickLine={false} fontSize={10} tick={{ fill: '#888' }} />
                                <RechartsTooltip 
                                    cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Bar dataKey="count" fill="var(--color-primary)" radius={[4, 4, 0, 0]} barSize={30} fillOpacity={0.8} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Future Reviews Forecast */}
            <Card className="border-border/50 shadow-sm overflow-hidden">
                <CardHeader className="border-b border-border/50 bg-muted/20">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-primary" />
                        未来错题复习预估
                    </CardTitle>
                    <CardDescription>根据 FSRS 算法预测未来一周历史错题的复习量与耗时</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={stats.futureReviews}>
                            <defs>
                                <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                            <XAxis 
                                dataKey="date" 
                                axisLine={false} 
                                tickLine={false} 
                                fontSize={10} 
                                tick={{ fill: '#888' }} 
                                tickFormatter={(val) => val.split('-').slice(1).join('/')}
                            />
                            <YAxis axisLine={false} tickLine={false} fontSize={10} tick={{ fill: '#888' }} />
                            <RechartsTooltip 
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                labelFormatter={(label) => `日期: ${label}`}
                                formatter={(value, name) => [
                                    name === 'count' ? `${value} 题` : `${value} min`,
                                    name === 'count' ? '复习数量' : '预计耗时'
                                ]}
                            />
                            <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorCount)" />
                            <Area type="monotone" dataKey="estimatedMinutes" stroke="#8b5cf6" strokeWidth={2} fill="transparent" strokeDasharray="5 5" />
                        </AreaChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Cognitive Efficiency & Explanation Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-1 border-border/50 shadow-sm overflow-hidden flex flex-col">
                    <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
                        <CardTitle className="text-base flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Zap className="w-4 h-4 text-amber-500" />
                                认知效率分析
                            </div>
                            <button 
                                onClick={handleSync}
                                disabled={isSyncing}
                                className="text-[10px] bg-primary/10 hover:bg-primary/20 text-primary px-2 py-1 rounded-md transition-colors flex items-center gap-1 disabled:opacity-50"
                            >
                                <Clock className={`w-2.5 h-2.5 ${isSyncing ? 'animate-spin' : ''}`} />
                                {isSyncing ? '同步中...' : '同步历史数据'}
                            </button>
                        </CardTitle>
                        <CardDescription>
                            基于 {stats.learnedCount} 道题目的表现实时估算
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 flex-1 flex flex-col justify-between">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">基础阅读速度</span>
                                <div className="flex items-end gap-1">
                                    <span className="text-xl font-bold">{stats.readingSpeed.base.toFixed(1)}</span>
                                    <span className="text-[10px] text-muted-foreground mb-1">字/s</span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">多选题效率</span>
                                <div className="flex items-end gap-1">
                                    <span className="text-xl font-bold">{stats.readingSpeed.multi.toFixed(1)}</span>
                                    <span className="text-[10px] text-muted-foreground mb-1">字/s</span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">判断题效率</span>
                                <div className="flex items-end gap-1">
                                    <span className="text-xl font-bold">{stats.readingSpeed.truefalse.toFixed(1)}</span>
                                    <span className="text-[10px] text-muted-foreground mb-1">字/s</span>
                                </div>
                            </div>
                        </div>
                        <div className="mt-6 pt-4 border-t border-border/50">
                            <p className="text-[10px] text-muted-foreground italic">
                                * 阅读速度越快，算法分配给“思考”的时间比例就越高，评分越灵敏。
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <div className="md:col-span-1 p-6 rounded-3xl bg-primary/5 border border-primary/10">
                    <h4 className="font-bold flex items-center gap-2 mb-3">
                        <AlertCircle className="w-4 h-4 text-primary" />
                        什么是稳定性 (Stability)?
                    </h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        稳定性代表您遗忘该知识点的概率降至 10% 所需的时间（天数）。
                        例如，如果稳定性为 15d，意味着算法预测在 15 天后您仍有 90% 的概率能回想起它。
                        每一次成功的复习都会显著增加稳定性。
                    </p>
                </div>
                <div className="md:col-span-1 p-6 rounded-3xl bg-amber-500/5 border border-amber-500/10">
                    <h4 className="font-bold flex items-center gap-2 mb-3 text-amber-700 dark:text-amber-400">
                        <Zap className="w-4 h-4" />
                        难度 (Difficulty) 是如何计算的?
                    </h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        难度反映了知识点的认知负荷。它是动态学习的：如果您在答题时思考时间过长或回答错误，
                        算法会自动调高难度；反之，如果您能瞬间秒杀，难度会逐渐降低。
                    </p>
                </div>
            </div>
            
            {/* Action Area */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card 
                    className="cursor-pointer border-primary/20 bg-primary/5 hover:bg-primary/10 transition-all hover:scale-[1.02] active:scale-[0.98] group"
                    onClick={() => router.push('/practice/setup?mode=review')}
                >
                    <CardContent className="p-6 flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-primary text-white shadow-lg shadow-primary/20">
                            <RotateCcw className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-lg flex items-center justify-between">
                                开始记忆复习
                                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                            </h3>
                            <p className="text-xs text-muted-foreground mt-1">基于 FSRS 算法，优先复习即将遗忘的知识点</p>
                        </div>
                    </CardContent>
                </Card>

                <Card 
                    className="cursor-pointer border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 transition-all hover:scale-[1.02] active:scale-[0.98] group"
                    onClick={() => router.push('/practice/setup?mode=mistakes')}
                >
                    <CardContent className="p-6 flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-rose-500 text-white shadow-lg shadow-rose-500/20">
                            <AlertCircle className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-lg flex items-center justify-between">
                                错题专项强化
                                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                            </h3>
                            <p className="text-xs text-muted-foreground mt-1">专门针对历史练习中做错的题目进行强化练习</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
