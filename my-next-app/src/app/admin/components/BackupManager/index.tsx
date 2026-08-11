"use client";

import React, { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Download,
  Upload,
  ShieldAlert,
  Database,
  FileUp,
  Loader2,
  RefreshCw,
  Clock,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

interface BackupHistoryItem {
  id: number;
  action: string;
  username: string;
  filename: string | null;
  backupCreated: string | null;
  created_at: string | null;
}

const HISTORY_KEY = "admin-backup-history";

export function BackupManager() {
  const [isRestoring, setIsRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const {
    data: history = [],
    isLoading: loadingHistory,
    refetch: fetchHistory,
  } = useQuery({
    queryKey: [HISTORY_KEY],
    queryFn: async () => {
      const res = await fetch("/api/admin/backup-history");
      if (!res.ok) throw new Error("获取备份历史失败");
      const data = await res.json();
      return (data.history ?? []) as BackupHistoryItem[];
    },
  });

  const handleBackup = async () => {
    try {
      const toastId = toast.loading("正在生成全量快照...");

      const response = await fetch("/api/admin/backup");
      if (!response.ok) throw new Error("备份请求失败");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = `ai-learning-backup-${Date.now()}.db`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }
      a.download = filename;

      if (document.body) {
        requestAnimationFrame(() => {
          try {
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          } catch {
            a.click();
          }
        });
      } else {
        a.click();
      }

      window.URL.revokeObjectURL(url);

      toast.success("备份已下载", { id: toastId });
      queryClient.invalidateQueries({ queryKey: [HISTORY_KEY] });
    } catch (error) {
      console.error(error);
      toast.error("备份失败，请查看控制台日志");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      if (
        !confirm(
          `文件大小为 ${(file.size / 1024 / 1024).toFixed(2)}MB，确定要继续吗？`,
        )
      ) {
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }

    handleRestore(file);
  };

  const handleRestore = async (file: File) => {
    if (
      !confirm(
        `⚠️ 高危操作警告 ⚠️\n\n即将使用文件 "${file.name}" 覆盖当前数据库。\n\n- 当前所有数据将被替换\n- 此操作不可撤销（系统会尝试自动备份当前数据，但不保证 100% 成功）\n\n确定要继续吗？`,
      )
    ) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsRestoring(true);
    const toastId = toast.loading("正在恢复数据库... 请勿关闭页面");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/admin/restore", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "恢复失败");
      }

      toast.success("数据库恢复成功！页面即将刷新...", { id: toastId });

      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (error: unknown) {
      console.error(error);
      toast.error(
        `恢复失败: ${error instanceof Error ? error.message : String(error)}`,
        { id: toastId },
      );
      setIsRestoring(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* 顶部警告栏 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Database className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-800">
          <p className="font-bold mb-1">数据安全中心</p>
          <p className="opacity-90">
            建议定期下载全量快照。系统底层采用 SQLite
            数据库，备份文件包含了所有题目、聊天记录及 AI 向量索引。
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        {/* 备份卡片 */}
        <div className="bg-card p-6 rounded-xl border border-border shadow-sm flex flex-col items-center text-center space-y-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
            <Download className="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">全量备份</h3>
            <p className="text-sm text-muted-foreground mt-1">
              下载当前数据库 (.db) 到本地
            </p>
          </div>
          <Button
            onClick={handleBackup}
            className="w-full max-w-[200px] mt-4 bg-green-600 hover:bg-green-700 text-white"
          >
            <Download className="w-4 h-4 mr-2" />
            立即下载备份
          </Button>
        </div>

        {/* 恢复卡片 */}
        <div className="bg-card p-6 rounded-xl border border-border shadow-sm flex flex-col items-center text-center space-y-4 hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
            <Upload className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">数据恢复</h3>
            <p className="text-sm text-muted-foreground mt-1">
              上传 .db 文件覆盖当前系统
            </p>
          </div>

          <div className="w-full max-w-[200px] mt-4 relative">
            <input
              ref={fileInputRef}
              type="file"
              accept=".db,.sqlite,.sqlite3"
              onChange={handleFileSelect}
              className="hidden"
              disabled={isRestoring}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="w-full border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
              disabled={isRestoring}
            >
              {isRestoring ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  恢复中...
                </>
              ) : (
                <>
                  <FileUp className="w-4 h-4 mr-2" />
                  选择备份文件
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* 备份历史 */}
      <div className="bg-card rounded-xl border border-border shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-foreground">备份历史</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchHistory}
            disabled={loadingHistory}
          >
            <RefreshCw
              className={`w-4 h-4 ${loadingHistory ? "animate-spin" : ""}`}
            />
          </Button>
        </div>

        {history.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-muted-foreground">
            {loadingHistory ? "加载中..." : "暂无备份记录"}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {history.map((item) => (
              <div key={item.id} className="px-6 py-3 flex items-center gap-4">
                {item.action === "BACKUP_DATABASE" ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                ) : (
                  <RotateCcw className="w-4 h-4 text-amber-500 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        item.action === "BACKUP_DATABASE"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      }`}
                    >
                      {item.action === "BACKUP_DATABASE" ? "备份" : "恢复"}
                    </span>
                    <span className="text-sm text-foreground truncate">
                      {item.action === "BACKUP_DATABASE"
                        ? item.filename || "数据库备份"
                        : item.filename || "数据库恢复"}
                    </span>
                  </div>
                  {item.backupCreated && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      自动备份: {item.backupCreated}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {item.username}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {item.created_at
                      ? new Date(item.created_at).toLocaleString("zh-CN")
                      : "-"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部提示 */}
      <div className="text-center">
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
          <ShieldAlert className="w-3 h-3" />
          恢复操作将通过原子替换方式进行，并尝试自动备份原数据以防止意外。
        </p>
      </div>
    </div>
  );
}
