"use client";

import React, { useRef } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  exportUserDataAction,
  importUserDataAction,
} from "@/server/actions/data";
import { getBeijingDateString } from "@/lib/utils/datetime";

interface DataManagementSectionProps {
  onDataChange: () => void;
}

export function DataManagementSection({
  onDataChange,
}: DataManagementSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    const result = await exportUserDataAction();
    if (result.serverError) {
      toast.error(result.serverError || "导出失败");
      return;
    }

    if (result.data) {
      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ai-learning-backup-${getBeijingDateString()}.json`;

      if (typeof window !== "undefined" && document.body) {
        requestAnimationFrame(() => {
          try {
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          } catch {
            // audit-allow: 下载锚点的挂载/移除失败不影响备份内容，退化为直接点击
            console.warn("[DataManagement] 下载锚点挂载失败，改为直接点击", {
              fileName: a.download,
            });
            a.click();
          }
        });
      } else {
        a.click();
      }

      URL.revokeObjectURL(url);
      toast.success("进度备份导出成功");
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      let backupData: Parameters<typeof importUserDataAction>[0];
      try {
        backupData = JSON.parse(content) as Parameters<
          typeof importUserDataAction
        >[0];
      } catch (error) {
        // 只把"文件本身不是 JSON"报成格式错误；
        // 以前服务端失败也落进同一个 catch，用户会去反复检查一个其实没问题的文件
        toast.error("无效的 JSON 备份文件");
        console.error(error);
        return;
      }

      try {
        const result = await importUserDataAction(backupData);

        if (result.serverError) {
          toast.error(result.serverError || "导入失败");
        } else if (result.data?.success) {
          toast.success(result.data.message);
          onDataChange();
          // Reset file input
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      } catch (error) {
        toast.error("导入失败，请稍后重试");
        console.error(error);
        return;
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
      <h2 className="text-lg font-bold mb-4 text-foreground flex items-center gap-2">
        <span className="w-1 h-4 bg-primary rounded-full" />
        数据管理
      </h2>
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={handleExport}
          className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/20 shadow-md transition-all"
        >
          导出进度备份
        </Button>
        <Button
          variant="outline"
          onClick={handleImportClick}
          className="border-primary/30 text-primary hover:bg-primary/10"
        >
          导入进度备份
        </Button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".json"
          className="hidden"
        />
      </div>
      <p className="mt-4 text-xs text-muted-foreground leading-relaxed bg-muted p-3 rounded-lg border border-border">
        您可以将当前的掌握度数据导出为 JSON 文件，或从之前的备份中恢复。
        <br />
        <span className="text-destructive font-medium">
          ⚠️ 警告：导入操作将覆盖当前的进度数据，请谨慎操作。
        </span>
      </p>
    </div>
  );
}
