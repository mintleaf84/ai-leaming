import Link from "next/link";
import {
  ArrowRight, Brain, BarChart3, Target, Zap, AlertCircle,
  RotateCcw, FileCheck, Shuffle, Flame, Eye, BookOpen,
  CheckCircle2
} from "lucide-react";
import { redirect } from "next/navigation";
import { getUserStatsAction } from "@/server/actions/stats";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

// 练习模式配置
const PRACTICE_MODES = [
  { id: 'smart', name: '智能刷题', icon: Brain, color: 'from-blue-500 to-indigo-600', desc: '40/40/20 算法' },
  { id: 'review', name: '错题强化', icon: RotateCcw, color: 'from-amber-500 to-orange-600', desc: '只练错题' },
  { id: 'focus', name: '专项突破', icon: Target, color: 'from-green-500 to-emerald-600', desc: '按知识点' },
  { id: 'exam', name: '模拟考试', icon: FileCheck, color: 'from-purple-500 to-violet-600', desc: '定时作答' },
  { id: 'random', name: '随机挑战', icon: Shuffle, color: 'from-pink-500 to-rose-600', desc: '完全随机' },
];

const QUESTION_COUNTS = [15, 25, 50];

export default async function Home() {
  let stats;
  try {
    stats = await getUserStatsAction();
  } catch (error) {
    // If not authenticated, redirect to login
    redirect('/login');
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* 顶部问候 + 连续学习天数 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">你好，备考人</h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-2">
              {stats.streakDays > 0 ? (
                <>
                  <Flame className="h-4 w-4 text-orange-500" />
                  连续学习 <span className="font-bold text-orange-500">{stats.streakDays}</span> 天，继续保持！
                </>
              ) : (
                '今天开始新的学习之旅！'
              )}
            </p>
          </div>
          {/* 今日进度 */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm text-muted-foreground">今日目标</div>
              <div className="font-bold">{stats.todayPracticed} / {stats.dailyGoal} 题</div>
            </div>
            <div className="w-32">
              <Progress value={stats.dailyProgress} className="h-3" />
            </div>
          </div>
        </div>

        {/* 待办提醒区 */}
        {(stats.pendingReviewCount > 0 || stats.observationZoneCount > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stats.pendingReviewCount > 0 && (
              <Link href="/practice?mode=review&limit=20" className="block">
                <Card className="border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50 transition-colors cursor-pointer">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-500/20 rounded-lg">
                        <RotateCcw className="h-5 w-5 text-amber-600" />
                      </div>
                      <div>
                        <div className="font-medium">待复习错题</div>
                        <div className="text-sm text-muted-foreground">最近 7 天的错误题目</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-amber-500/20 text-amber-700">
                        {stats.pendingReviewCount} 题
                      </Badge>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}

            {stats.observationZoneCount > 0 && (
              <Link href="/dashboard" className="block">
                <Card className="border-red-500/30 bg-red-500/5 hover:border-red-500/50 transition-colors cursor-pointer">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-red-500/20 rounded-lg">
                        <Eye className="h-5 w-5 text-red-600" />
                      </div>
                      <div>
                        <div className="font-medium">观察区知识点</div>
                        <div className="text-sm text-muted-foreground">需要重点关注</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-red-500/20 text-red-700">
                        {stats.observationZoneCount} 个
                      </Badge>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}
          </div>
        )}

        {/* 练习模式快速选择器 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              快速开始练习
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              {PRACTICE_MODES.map((mode) => (
                <Link
                  key={mode.id}
                  href={`/practice?mode=${mode.id}&limit=25`}
                  className="group"
                >
                  <div className="p-4 rounded-xl border border-border bg-card hover:border-primary/50 transition-all text-center">
                    <div className={`w-10 h-10 mx-auto rounded-lg bg-gradient-to-br ${mode.color} flex items-center justify-center text-white mb-2 group-hover:scale-110 transition-transform`}>
                      <mode.icon className="h-5 w-5" />
                    </div>
                    <div className="font-medium text-sm">{mode.name}</div>
                    <div className="text-xs text-muted-foreground">{mode.desc}</div>
                  </div>
                </Link>
              ))}
            </div>
            <div className="flex items-center justify-between pt-3 border-t">
              <span className="text-sm text-muted-foreground">或前往配置更多选项</span>
              <Link href="/practice/setup">
                <Button variant="outline" size="sm">
                  高级配置 <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* 数据统计 + 薄弱考点 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 统计卡片 */}
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                  <Target className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">今日完成</div>
                  <div className="text-2xl font-bold">{stats.todayPracticed} <span className="text-sm font-normal text-muted-foreground">题</span></div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-2 bg-green-500/10 rounded-lg text-green-600">
                  <Brain className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">平均掌握度</div>
                  <div className="text-2xl font-bold">{stats.averageMastery}<span className="text-sm font-normal text-muted-foreground">%</span></div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-2 bg-purple-500/10 rounded-lg text-purple-600">
                  <BarChart3 className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">累计练习</div>
                  <div className="text-2xl font-bold">{stats.totalPracticed} <span className="text-sm font-normal text-muted-foreground">题</span></div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 薄弱考点 */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertCircle className="text-destructive h-5 w-5" />
                重点关注考点
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.weakPoints.length > 0 ? (
                <div className="space-y-3">
                  {stats.weakPoints.map((point) => (
                    <div key={point.tag} className="flex items-center justify-between p-3 bg-destructive/5 rounded-lg border border-destructive/10">
                      <span className="font-medium">{point.tag}</span>
                      <div className="flex items-center gap-3">
                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-destructive transition-all"
                            style={{ width: `${point.score}%` }}
                          />
                        </div>
                        <span className="text-sm font-bold text-destructive w-12 text-right">{point.score}%</span>
                        <Link href={`/practice?mode=focus&limit=15&tags=${encodeURIComponent(point.tag)}`}>
                          <Button variant="ghost" size="sm" className="h-7 text-xs">
                            突破
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground flex flex-col items-center gap-2">
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                  暂无薄弱考点，继续保持！
                </div>
              )}
              <Link href="/dashboard" className="inline-block mt-4 text-primary text-sm font-medium hover:underline">
                查看完整知识图谱 →
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* 快捷入口 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stats.lastSessionId && (
            <Link href={`/history/${stats.lastSessionId}`} className="group">
              <Card className="h-full hover:border-primary/50 transition-colors">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium group-hover:text-primary transition-colors">回顾最近练习</div>
                    <div className="text-sm text-muted-foreground">查看错因与 AI 解析</div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </CardContent>
              </Card>
            </Link>
          )}

          <Link href="/chat" className="group">
            <Card className="h-full hover:border-primary/50 transition-colors">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium group-hover:text-primary transition-colors">AI 学习助手</div>
                  <div className="text-sm text-muted-foreground">智能答疑与考点解析</div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </CardContent>
            </Card>
          </Link>

          <Link href="/knowledge" className="group">
            <Card className="h-full hover:border-primary/50 transition-colors">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium group-hover:text-primary transition-colors">知识卡片</div>
                  <div className="text-sm text-muted-foreground">记忆与概念复习</div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}