import Link from "next/link";
import {
  ArrowRight, Brain, BarChart3, Target, Zap, AlertCircle,
  RotateCcw, FileCheck, Shuffle, Flame, Eye, BookOpen,
  CheckCircle2, Book, GraduationCap, PlayCircle
} from "lucide-react";
import { redirect } from "next/navigation";
import { getUserStatsAction } from "@/server/actions/stats";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { KnowledgePointSelector } from "@/components/dashboard/KnowledgePointSelector";
import { getBeijingHour } from "@/lib/utils/datetime";

export default async function Home() {
  let stats;
  try {
    stats = await getUserStatsAction();
  } catch (error) {
    redirect('/login');
  }

  // Greeting logic (使用北京时间)
  const hour = getBeijingHour();
  let greeting = "早安";
  if (hour >= 11 && hour < 14) greeting = "午安";
  else if (hour >= 14 && hour < 19) greeting = "下午好";
  else if (hour >= 19) greeting = "晚上好";

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#faf9f6] p-6 md:p-12 font-sans selection:bg-emerald-100">
      <div className="max-w-6xl mx-auto space-y-10">

        {/* Header */}
        <div className="flex items-end justify-between">
          <h1 className="text-4xl font-serif font-medium text-neutral-800 tracking-tight">
            {greeting}，修习者
          </h1>
          <div className="text-sm text-neutral-400 font-medium">
            今天也要精进每一分
          </div>
        </div>

        {/* Main Grid: 3 Clean Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

          {/* Card 1: Daily Focus (Stats) */}
          <Card className="border border-white/60 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300 rounded-3xl h-[280px] flex flex-col justify-between overflow-hidden relative">
            <CardHeader className="pb-0 z-10">
              <CardTitle className="text-base font-bold text-neutral-600 flex items-center gap-2">
                <Target className="w-5 h-5 text-emerald-600" />
                今日专注
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 z-10">
              <div>
                <div className="flex items-end justify-between mb-2">
                  <div className="flex items-end gap-2">
                    <span className="text-4xl font-serif font-bold text-neutral-800">{stats.dailyProgress}%</span>
                    <span className="text-sm text-neutral-400 mb-1">完成度</span>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-serif font-bold text-emerald-600">{stats.averageMastery}<span className="text-xs text-emerald-400 ml-1">%</span></div>
                    <div className="text-[10px] text-neutral-400">平均掌握率</div>
                  </div>
                </div>
                <Progress value={stats.dailyProgress} className="h-2.5 bg-emerald-100 [&>div]:bg-emerald-500 rounded-full" />
                <div className="flex justify-between items-center mt-2 text-xs text-neutral-400 font-medium">
                  <span>已练 {stats.todayPracticed} / {stats.dailyGoal} 题</span>
                  <span>累计 {stats.totalPracticed} 题</span>
                </div>

                {stats.lastSessionId && (
                  <Link href={`/history/${stats.lastSessionId}`} className="mt-4 block">
                    <Button variant="outline" className="w-full h-8 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700">
                      继续上次练习 <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </Link>
                )}
              </div>

              <div className="flex items-center gap-2 bg-amber-50 rounded-xl px-4 py-3 border border-amber-100/50">
                <Flame className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-medium text-amber-700">
                  已连续修习 <span className="font-bold">{stats.streakDays}</span> 天，保持热忱！
                </span>
              </div>
            </CardContent>
            {/* Decoration */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full blur-[40px] -translate-y-1/2 translate-x-1/2 -z-0 opacity-60"></div>
          </Card>

          {/* Card 2: Quick Actions */}
          <Card className="border border-white/60 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300 rounded-3xl h-[280px] flex flex-col relative overflow-hidden">
            <CardHeader className="pb-4 z-10">
              <CardTitle className="text-base font-bold text-neutral-600 flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-emerald-600" />
                  快速操作
                </div>
                <Link href="/practice/setup" title="高级配置">
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-neutral-400 hover:text-emerald-600">
                    <div className="relative">
                      <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-neutral-300 rounded-full"></div>
                      <div className="w-3 h-3 border-[1.5px] border-current rounded-sm"></div>
                    </div>
                  </Button>
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 h-full z-10 content-start pb-4 overflow-y-auto pr-1 custom-scrollbar">
              <Link href="/practice?mode=smart&limit=25" className="group">
                <div className="h-full flex flex-col items-center justify-center p-3 rounded-2xl bg-white border border-neutral-100 hover:border-emerald-200 hover:shadow-sm hover:translate-y-[-1px] transition-all cursor-pointer">
                  <PlayCircle className="w-5 h-5 text-emerald-600 mb-1 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-bold text-neutral-700">智能刷题</span>
                </div>
              </Link>
              <Link href="/practice?mode=review" className="group">
                <div className="h-full flex flex-col items-center justify-center p-3 rounded-2xl bg-white border border-neutral-100 hover:border-orange-200 hover:shadow-sm hover:translate-y-[-1px] transition-all cursor-pointer">
                  <RotateCcw className="w-5 h-5 text-orange-600 mb-1 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-bold text-neutral-700">错题强化</span>
                  {stats.pendingReviewCount > 0 && (
                    <span className="bg-orange-100 text-orange-700 text-[10px] px-1.5 rounded-full mt-1">
                      {stats.pendingReviewCount}
                    </span>
                  )}
                </div>
              </Link>
              <KnowledgePointSelector>
                <div className="group h-full flex flex-col items-center justify-center p-3 rounded-2xl bg-white border border-neutral-100 hover:border-cyan-200 hover:shadow-sm hover:translate-y-[-1px] transition-all cursor-pointer">
                  <Target className="w-5 h-5 text-cyan-600 mb-1 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-bold text-neutral-700">专项突破</span>
                </div>
              </KnowledgePointSelector>
              <Link href="/practice?mode=exam" className="group">
                <div className="h-full flex flex-col items-center justify-center p-3 rounded-2xl bg-white border border-neutral-100 hover:border-blue-200 hover:shadow-sm hover:translate-y-[-1px] transition-all cursor-pointer">
                  <FileCheck className="w-5 h-5 text-blue-600 mb-1 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-bold text-neutral-700">模拟考试</span>
                </div>
              </Link>
              <Link href="/practice?mode=random" className="group col-span-2">
                <div className="h-full flex flex-row items-center justify-center gap-2 p-3 rounded-2xl bg-white border border-neutral-100 hover:border-purple-200 hover:shadow-sm hover:translate-y-[-1px] transition-all cursor-pointer">
                  <Shuffle className="w-5 h-5 text-purple-600 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-bold text-neutral-700">随机挑战 (摸鱼模式)</span>
                </div>
              </Link>
            </CardContent>
          </Card>

          {/* Card 3: Weak Points */}
          <Card className="border border-white/60 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300 rounded-3xl h-[280px] flex flex-col relative overflow-hidden">
            <CardHeader className="pb-4 z-10">
              <CardTitle className="text-base font-bold text-neutral-600 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-emerald-600" />
                知识薄弱点
              </CardTitle>
            </CardHeader>
            <CardContent className="z-10 h-full">
              {stats.weakPoints.length > 0 ? (
                <div className="flex flex-wrap gap-2 content-start">
                  {stats.weakPoints.slice(0, 6).map((p, i) => (
                    <Link key={p.tag} href={`/practice?mode=focus&limit=15&tags=${encodeURIComponent(p.tag)}`}>
                      <Badge
                        variant="secondary"
                        className={`px-3 py-1.5 cursor-pointer transition-all hover:scale-105 border border-transparent 
                                            ${i === 0 ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200/50 shadow-lg" :
                            i === 1 ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200" :
                              "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                          }`}
                      >
                        {p.tag}
                      </Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-neutral-400 space-y-2 pb-8">
                  <CheckCircle2 className="w-8 h-8 opacity-20" />
                  <span className="text-sm">知识点掌握良好</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Lower Section: Modules List (Minimalist) */}
        <div className="pt-6">
          <h2 className="text-lg font-bold text-neutral-800 mb-4 px-2 tracking-tight">
            学习工具
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { name: '教材库', desc: '学习资料导入', href: '/textbooks', icon: Book },
              { name: 'AI 助教', desc: '智能答疑解惑', href: '/chat', icon: Brain },
              { name: '知识卡片', desc: '碎片化记忆', href: '/knowledge', icon: GraduationCap },
              { name: '知识图谱', desc: '全局思维导图', href: '/knowledge-graph', icon: BarChart3 },
            ].map((item) => (
              <Link key={item.name} href={item.href} className="group">
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-neutral-100 hover:border-emerald-200 hover:shadow-sm transition-all">
                  <div className="w-10 h-10 rounded-full bg-neutral-50 flex items-center justify-center text-neutral-500 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-neutral-700 text-sm group-hover:text-emerald-700 transition-colors">{item.name}</div>
                    <div className="text-xs text-neutral-400">{item.desc}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}