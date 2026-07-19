"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Cloud,
  Save,
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  ShieldCheck,
  History,
} from "lucide-react";
import { toast } from "sonner";

export default function BackupSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [config, setConfig] = useState({
    enabled: false,
    url: "",
    user: "",
    pass: "",
    remotePath: "/backups",
    retentionDays: 365,
  });

  // 加载配置
  useEffect(() => {
    const fetchConfig = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/system/backup");
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setConfig((prev) => ({ ...prev, ...data, pass: "" })); // 密码始终不回显
      } catch (error: unknown) {
        toast.error(
          `加载配置失败: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  // 保存配置
  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/system/backup", {
        method: "POST",
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success("配置已保存");
    } catch (error: unknown) {
      toast.error(
        `保存失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setLoading(false);
    }
  };

  // 测试连接
  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/admin/system/backup", {
        method: "PATCH",
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("连接测试成功！可以通过 WebDAV 正常读写。");
      } else {
        toast.error(`连接测试失败: ${data.error || "无法连接到服务器"}`);
      }
    } catch (error: unknown) {
      toast.error(
        `测试过程中出错: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setTesting(false);
    }
  };

  // 手动备份
  const handleManualBackup = async () => {
    if (!confirm("确认立即执行一次远程备份吗？这可能需要几秒钟。")) return;
    setBackingUp(true);
    try {
      const res = await fetch("/api/admin/system/backup", { method: "PUT" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success(`备份成功: ${data.fileName}`);
    } catch (error: unknown) {
      toast.error(
        `手动备份失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setBackingUp(false);
    }
  };

  if (loading && !config.url) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">数据库备份</h2>
          <p className="text-muted-foreground mt-1">
            通过 WebDAV 协议将您的学习数据安全备份到远程云端。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleManualBackup}
            disabled={backingUp || !config.url}
            className="bg-background/50 backdrop-blur-sm"
          >
            {backingUp ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            立即执行
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            更新设置
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 核心配置 */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Cloud className="h-5 w-5 text-blue-500" />
              WebDAV 连接配置
            </CardTitle>
            <CardDescription>
              配置您的云端存储信息，例如 AList, Nextcloud 或 群晖。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url">服务器地址 (URL)</Label>
              <Input
                id="url"
                placeholder="https://dav.example.com/dav"
                value={config.url}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, url: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="user">用户名</Label>
                <Input
                  id="user"
                  placeholder="admin"
                  value={config.user}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, user: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pass">应用密码</Label>
                <Input
                  id="pass"
                  type="password"
                  placeholder="••••••••••••"
                  value={config.pass}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, pass: e.target.value }))
                  }
                />
                <p className="text-[10px] text-muted-foreground">
                  修改此项将更新存储的加密密码。
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="path">远程备份文件夹</Label>
              <Input
                id="path"
                placeholder="/ai-learning-backups"
                value={config.remotePath}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, remotePath: e.target.value }))
                }
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleTest}
              disabled={testing || !config.url}
              className="mt-2"
            >
              {testing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              测试连接
            </Button>
          </CardContent>
        </Card>

        {/* 策略与安全 */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-500" />
                策略设置
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>自动备份</Label>
                  <p className="text-xs text-muted-foreground">
                    每日凌晨 3:00 执行
                  </p>
                </div>
                <Checkbox
                  checked={config.enabled}
                  onCheckedChange={(val: boolean) =>
                    setConfig((prev) => ({ ...prev, enabled: val }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  保留时间 (天)
                </Label>
                <Input
                  type="number"
                  value={config.retentionDays}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      retentionDays: parseInt(e.target.value),
                    }))
                  }
                />
                <p className="text-[10px] text-muted-foreground">
                  超过此天数的旧备份将被自动清理。
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
            <CardContent className="p-4 flex gap-3">
              <ShieldCheck className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-800 dark:text-amber-400 leading-relaxed">
                <strong>安全性提示：</strong>
                备份文件包含您的所有学习数据。建议在 WebDAV
                提供商侧开启“独立应用密码”以确保主账号安全。
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
