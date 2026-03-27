import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, BookOpen, Activity, Cpu } from "lucide-react";
import db from "@/lib/db";

export const revalidate = 60;

async function getAdminStats() {
    'use server';
    // 尝试从数据库获取统计信息，如果表不存在（初始生命周期）则返回默认值
    try {
        const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
        const questionCount = db.prepare('SELECT COUNT(*) as count FROM questions').get() as { count: number };
        const practiceCount = db.prepare('SELECT COUNT(*) as count FROM practice_logs').get() as { count: number };
        const aiConfigCount = db.prepare('SELECT COUNT(*) as count FROM ai_configs WHERE is_active = 1').get() as { count: number };

        return {
            users: userCount.count,
            questions: questionCount.count,
            practices: practiceCount.count,
            activeAi: aiConfigCount.count
        };
    } catch (error) {
        console.error("无法获取后台统计信息", error);
        return { users: 0, questions: 0, practices: 0, activeAi: 0 };
    }
}

export default async function AdminDashboardPage() {
    const stats = await getAdminStats();

    return (
        <div className="p-4 md:p-8 space-y-8">
            <div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight">概览</h2>
                <p className="text-muted-foreground mt-2">
                    系统运行状态与关键指标监控
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            总用户数
                        </CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.users}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            注册用户总数
                        </p>
                    </CardContent>
                </Card>
                <Card className="hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            题库规模
                        </CardTitle>
                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.questions}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            当前可用试题
                        </p>
                    </CardContent>
                </Card>
                <Card className="hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            总刷题量
                        </CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.practices}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            全站累计练习记录
                        </p>
                    </CardContent>
                </Card>
                <Card className="hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            AI 引擎
                        </CardTitle>
                        <Cpu className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.activeAi > 0 ? '运行中' : '未配置'}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            LLM 服务状态
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
