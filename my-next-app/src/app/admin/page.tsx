import { Card, CardContent, _CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, BookOpen, Activity, Cpu } from "lucide-react";
import { getAdminStatsAction } from "@/server/actions/admin";

export const revalidate = 60;

export default async function AdminDashboardPage() {
    const stats = await getAdminStatsAction();

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
