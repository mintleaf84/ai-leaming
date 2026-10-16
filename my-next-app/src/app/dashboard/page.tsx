import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowRight,
  Brain,
  BarChart3,
  Target,
  Zap,
  RotateCcw,
  FileCheck,
  Shuffle,
  Flame,
  CheckCircle2,
  Book,
  GraduationCap,
  PlayCircle,
  History,
  Sparkles,
  ScanLine,
  Network,
  FileText,
  BookX,
} from "lucide-react";
import { redirect } from "next/navigation";
import { getUserStatsAction } from "@/server/actions/stats";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { KnowledgePointSelector } from "@/components/dashboard/KnowledgePointSelector";
import { getBeijingHour } from "@/lib/utils/datetime";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { getGlobalFeatureFlag } from "@/server/actions/feature-flags";

/** 骨架屏：3 个卡片占位 */
function StatsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="border border-border bg-card/80 rounded-3xl h-[280px] animate-pulse"
        />
      ))}
    </div>
  );
}

/** 需要数据的 3 张核心卡片（独立 async 组件，支持流式渲染） */
async function DashboardStatsCards() {
  const result = await getUserStatsAction();

  if (result.serverError || !result.data) {
    redirect("/login");
  }

  const stats = result.data;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      {/* Card 1: Daily Focus (Stats) */}
      <Card className="border border-border bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300 rounded-3xl h-[280px] flex flex-col justify-between overflow-hidden relative">
        <CardHeader className="pb-0 z-10">
          <CardTitle className="text-base font-bold text-muted-foreground flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            今日专注
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 z-10">
          <div>
            <div className="flex items-end justify-between mb-2">
              <div className="flex items-end gap-2">
                <span className="text-4xl font-serif font-bold text-foreground">
                  <AnimatedNumber value={stats.dailyProgress} suffix="%" />
                </span>
                <span className="text-sm text-muted-foreground mb-1">
                  完成度
                </span>
              </div>
              <div className="text-right">
                <div className="text-2xl font-serif font-bold text-primary">
                  <AnimatedNumber value={stats.averageMastery} />
                  <span className="text-xs text-primary/70 ml-1">%</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  平均掌握率
                </div>
              </div>
            </div>
            <Progress
              value={stats.dailyProgress}
              className="h-2.5 bg-primary/20 [&>div]:bg-primary rounded-full"
            />
            <div className="flex justify-between items-center mt-2 text-xs text-muted-foreground font-medium">
              <span>
                已练{" "}
                <AnimatedNumber value={stats.todayPracticed} duration={1} /> /{" "}
                {stats.dailyGoal} 题
              </span>
              <span>
                累计{" "}
                <AnimatedNumber value={stats.totalPracticed} duration={1} /> 题
              </span>
            </div>

            {stats.lastSessionId && (
              <Link
                href={`/history/${stats.lastSessionId}`}
                className="mt-4 block"
              >
                <Button
                  variant="outline"
                  className="w-full h-8 text-xs text-primary border-primary/30 hover:bg-primary/10 hover:text-primary"
                >
                  继续上次练习 <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            )}
          </div>

          <div className="flex items-center gap-2 bg-amber-500/10 dark:bg-amber-500/20 rounded-xl px-4 py-3 border border-amber-500/20">
            <Flame className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
              已连续修习 <span className="font-bold">{stats.streakDays}</span>{" "}
              天，保持热忱！
            </span>
          </div>
        </CardContent>
        {/* Decoration */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-[40px] -translate-y-1/2 translate-x-1/2 -z-0 opacity-60"></div>
      </Card>

      {/* Card 2: Quick Actions */}
      <Card className="border border-border bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300 rounded-3xl h-[280px] flex flex-col relative overflow-hidden">
        <CardHeader className="pb-4 z-10">
          <CardTitle className="text-base font-bold text-muted-foreground flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              快速操作
            </div>
            <Link href="/practice/setup" title="高级配置">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-primary"
              >
                <div className="relative">
                  <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-muted-foreground/50 rounded-full"></div>
                  <div className="w-3 h-3 border-[1.5px] border-current rounded-sm"></div>
                </div>
              </Button>
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 h-full z-10 content-start pb-4 overflow-y-auto pr-1 custom-scrollbar">
          <Link href="/practice?mode=smart&limit=25" className="group">
            <div className="h-full flex flex-col items-center justify-center p-3 rounded-2xl bg-card border border-border hover:border-primary/50 hover:shadow-sm hover:translate-y-[-1px] transition-all cursor-pointer">
              <PlayCircle className="w-5 h-5 text-primary mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold text-foreground">
                智能刷题
              </span>
            </div>
          </Link>
          <Link href="/practice?mode=review" className="group">
            <div className="h-full flex flex-col items-center justify-center p-3 rounded-2xl bg-card border border-border hover:border-orange-500/50 hover:shadow-sm hover:translate-y-[-1px] transition-all cursor-pointer">
              <RotateCcw className="w-5 h-5 text-orange-600 dark:text-orange-500 mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold text-foreground">
                错题强化
              </span>
              {stats.pendingReviewCount > 0 && (
                <span className="bg-orange-500/20 text-orange-700 dark:text-orange-400 text-[10px] px-1.5 rounded-full mt-1">
                  {stats.pendingReviewCount}
                </span>
              )}
            </div>
          </Link>
          <KnowledgePointSelector>
            <button className="group h-full flex flex-col items-center justify-center p-3 rounded-2xl bg-card border border-border hover:border-cyan-500/50 hover:shadow-sm hover:translate-y-[-1px] transition-all cursor-pointer">
              <Target className="w-5 h-5 text-cyan-600 dark:text-cyan-500 mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold text-foreground">
                专项突破
              </span>
            </button>
          </KnowledgePointSelector>
          <Link href="/practice?mode=exam" className="group">
            <div className="h-full flex flex-col items-center justify-center p-3 rounded-2xl bg-card border border-border hover:border-blue-500/50 hover:shadow-sm hover:translate-y-[-1px] transition-all cursor-pointer">
              <FileCheck className="w-5 h-5 text-blue-600 dark:text-blue-500 mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold text-foreground">
                模拟考试
              </span>
            </div>
          </Link>
          <Link href="/practice?mode=random" className="group col-span-2">
            <div className="h-full flex flex-row items-center justify-center gap-2 p-3 rounded-2xl bg-card border border-border hover:border-purple-500/50 hover:shadow-sm hover:translate-y-[-1px] transition-all cursor-pointer">
              <Shuffle className="w-5 h-5 text-purple-600 dark:text-purple-500 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold text-foreground">
                随机挑战 (摸鱼模式)
              </span>
            </div>
          </Link>
        </CardContent>
      </Card>

      {/* Card 3: Weak Points */}
      <Card className="border border-border bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300 rounded-3xl h-[280px] flex flex-col relative overflow-hidden">
        <CardHeader className="pb-4 z-10">
          <CardTitle className="text-base font-bold text-muted-foreground flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            知识薄弱点
          </CardTitle>
        </CardHeader>
        <CardContent className="z-10 h-full">
          {stats.weakPoints.length > 0 ? (
            <div className="flex flex-wrap gap-2 content-start">
              {stats.weakPoints.slice(0, 6).map((p, i) => (
                <Link
                  key={p.tag}
                  href={`/practice?mode=focus&limit=15&tags=${encodeURIComponent(p.tag)}`}
                >
                  <Badge
                    variant="secondary"
                    className={`px-3 py-1.5 cursor-pointer transition-all hover:scale-105 border border-transparent 
                                        ${
                                          i === 0
                                            ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/30 shadow-lg"
                                            : i === 1
                                              ? "bg-primary/20 text-primary hover:bg-primary/30"
                                              : "bg-muted text-muted-foreground hover:bg-accent"
                                        }`}
                  >
                    {p.tag}
                  </Badge>
                </Link>
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-2 pb-8">
              <CheckCircle2 className="w-8 h-8 opacity-20" />
              <span className="text-sm">知识点掌握良好</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default async function Home() {
  // 获取特性开关状态
  const isCultivationEnabled = await getGlobalFeatureFlag(
    "ENABLE_CULTIVATION",
    false,
  );
  const isTextbookEnabled = await getGlobalFeatureFlag("ENABLE_TEXTBOOK", true);
  const isNotesEnabled = await getGlobalFeatureFlag("ENABLE_NOTES", true);

  // 问候语直接根据服务器时间计算，无需等待数据库
  const hour = getBeijingHour();
  let greeting = "早安";
  if (hour >= 11 && hour < 14) greeting = "午安";
  else if (hour >= 14 && hour < 19) greeting = "下午好";
  else if (hour >= 19) greeting = "晚上好";

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background p-6 md:p-12 font-sans selection:bg-primary/20">
      <div className="max-w-6xl mx-auto space-y-10">
        {/* Header：即时渲染，无需等待数据 */}
        <div className="flex items-end justify-between">
          <h1 className="text-4xl font-serif font-medium text-foreground tracking-tight">
            {greeting}，修习者
          </h1>
          <div className="text-sm text-muted-foreground font-medium">
            今天也要精进每一分
          </div>
        </div>

        {/* 核心数据卡片：Suspense 包裹，实现流式渲染 */}
        <Suspense fallback={<StatsSkeleton />}>
          <DashboardStatsCards />
        </Suspense>

        {/* Lower Section: Modules List (Minimalist) */}
        <div className="pt-6">
          <h2 className="text-lg font-bold text-foreground mb-4 px-2 tracking-tight">
            学习工具
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              {
                name: "记忆分析",
                desc: "FSRS 算法深度报告",
                href: "/dashboard/srs",
                icon: Brain,
              },
              {
                name: "练习记录",
                desc: "查看历史成绩",
                href: "/history",
                icon: History,
              },
              {
                name: "错题本",
                desc: "查看并管理错题",
                href: "/wrong-book",
                icon: BookX,
              },
              {
                name: "教材库",
                desc: "学习资料导入",
                href: "/textbooks",
                icon: Book,
                enabled: isTextbookEnabled,
              },
              {
                name: "智能笔记",
                desc: "记录灵感与知识",
                href: "/notes",
                icon: FileText,
                enabled: isNotesEnabled,
              },
              {
                name: "AI 助教",
                desc: "智能答疑解惑",
                href: "/chat",
                icon: Brain,
              },
              {
                name: "知识卡片",
                desc: "碎片化记忆",
                href: "/knowledge",
                icon: GraduationCap,
              },
              {
                name: "知识图谱",
                desc: "全局思维导图",
                href: "/knowledge-graph",
                icon: BarChart3,
              },
              {
                name: "文字识别",
                desc: "图片/PDF 转文字",
                href: "/ocr",
                icon: ScanLine,
              },
              {
                name: "思维导图",
                desc: "生成结构化脑图",
                href: "/mindmap",
                icon: Network,
              },
            ]
              .filter((item) => item.enabled !== false)
              .map((item) => (
                <Link key={item.name} href={item.href} className="group">
                  <div className="flex items-center gap-4 p-4 rounded-2xl bg-card border border-border hover:border-primary/50 hover:shadow-sm transition-all">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                      <item.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-foreground text-sm group-hover:text-primary transition-colors">
                        {item.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.desc}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
          </div>
        </div>

        {/* Cultivation Entry (Final Section) - 受特性开关控制 */}
        {isCultivationEnabled && (
          <div className="pt-8 pb-12">
            <Link href="/cultivation">
              <div className="group relative overflow-hidden rounded-[32px] bg-zinc-950 border border-emerald-500/20 p-8 flex flex-col md:flex-row items-center justify-between gap-6 cursor-pointer hover:border-emerald-500/40 transition-all shadow-lg hover:shadow-emerald-500/10">
                {/* Background Glow */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.08)_0%,transparent_100%)] opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="flex items-center gap-6 relative z-10">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <div className="text-center md:text-left">
                    <h3 className="text-xl font-serif font-bold text-emerald-500 tracking-tight mb-1">
                      进入修仙世界
                    </h3>
                    <p className="text-zinc-500 text-sm italic">
                      “炼魂塑玉，证道成仙。查看您的修习境界。”
                    </p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="relative z-10 rounded-full border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400 px-8 group-hover:px-10 transition-all"
                >
                  开启修行 <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
