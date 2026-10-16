"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface DemoModePanelProps {
  demoMode: boolean;
  onToggleDemoMode: () => void;
  onRefresh: () => void;
}

export function DemoModePanel({
  demoMode,
  onToggleDemoMode,
  onRefresh,
}: DemoModePanelProps) {
  const resetDemoSession = async () => {
    if (
      !confirm(
        "确定要重置全站的演示会话数据吗？下次进入练习时将自动重新生成新剧本。",
      )
    )
      return;
    try {
      const res = await fetch("/api/admin/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_demo_session" }),
      });
      if (res.ok) {
        toast.success("演示会话数据已成功重置");
        onRefresh();
      }
    } catch {
      toast.error("重置失败");
    }
  };

  return (
    <Card className="md:col-span-7 border-blue-200 shadow-sm">
      <CardHeader className="bg-blue-50/50">
        <CardTitle className="flex items-center gap-2 text-blue-700">
          <AlertCircle className="w-5 h-5" />
          系统演示模式 (Demo Mode)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
          <div>
            <h4 className="font-semibold mb-1">启用演示保护网关</h4>
            <p className="text-sm text-muted-foreground max-w-3xl">
              开启后，无论前台学员点击何种类型练习，系统均会锁定并派发其专有的首个&ldquo;固定出题剧本&rdquo;。多次退出重进会自动清理进度并原样复现，彻底掐断现场网络波动风险。
            </p>
          </div>
          <Button
            variant={demoMode ? "destructive" : "default"}
            onClick={onToggleDemoMode}
            className="min-w-[140px]"
          >
            {demoMode ? "停用演示模式" : "启用演示模式"}
          </Button>
        </div>
        <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
          <div>
            <h4 className="font-semibold mb-1">重置演示库数据</h4>
            <p className="text-sm text-muted-foreground max-w-3xl">
              强制剔除数据库中已派配的路演会话
              (is_demo=1)。如果想为下一场路演换另外一批题目进行彩排，请点击此按钮。
            </p>
          </div>
          <Button variant="outline" onClick={resetDemoSession}>
            重置并重新生成套题
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
