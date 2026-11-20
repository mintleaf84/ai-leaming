"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAppQuery } from "@/hooks/useAppQuery";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface DedupeStatus {
  duplicateGroups: number;
  fallbackQuestions: number;
  fallbackWithCopy: number;
  unhashedQuestions: number;
  needsCleanup: boolean;
}

interface DedupeReport {
  dryRun: boolean;
  hashesBackfilled: number;
  duplicateGroups: number;
  fallbackPairs: number;
  orphanFallbacks: number;
  logsMoved: number;
  srsMoved: number;
  srsMerged: number;
  feedbackMoved: number;
  folderItemsMoved: number;
  deletedQuestions: number;
  markedFallback: number;
  remainingDuplicateGroups: number;
}

const STATUS_KEY = ["admin-maintenance-dedupe"];

export function MaintenancePanel() {
  const queryClient = useQueryClient();
  const [report, setReport] = useState<DedupeReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const { data: status, isError } = useAppQuery({
    queryKey: STATUS_KEY,
    queryFn: async () => {
      const res = await fetch("/api/admin/maintenance/dedupe");
      if (!res.ok) throw new Error("获取数据维护状态失败");
      return (await res.json()) as DedupeStatus;
    },
  });

  const run = async (apply: boolean) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/maintenance/dedupe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "操作失败");
      if (apply) {
        toast.success("数据清理已完成");
        setConfirming(false);
        setReport(null);
      } else {
        setReport(data.report as DedupeReport);
        toast.success("预检完成，未修改数据");
      }
      await queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    } catch (error) {
      // 客户端三形态：记录后以 toast 降级（与 BackupManager 一致）
      console.error("数据维护操作失败", error);
      toast.error(error instanceof Error ? error.message : "操作失败");
      return;
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          数据维护：重复题清理
          {status ? (
            status.needsCleanup ? (
              <Badge variant="destructive">待处理</Badge>
            ) : (
              <Badge variant="secondary">无待处理项</Badge>
            )
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          兜底题与真实题同题干时会重复入库（历史上多选答案还会被截断）。清理会：
          回填去重指纹、把日志/反馈/文件夹迁移到真实题、按复习充分度合并 SRS
          卡、 删除兜底副本。执行前服务端会自动 VACUUM INTO 备份。
        </p>

        {isError && (
          <p className="text-sm text-destructive">
            状态获取失败：请刷新重试；不确定时不要执行清理。
          </p>
        )}
        {!status && !isError && (
          <p className="text-sm text-muted-foreground">加载状态中…</p>
        )}
        {status && (
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge
              variant={status.duplicateGroups > 0 ? "destructive" : "outline"}
            >
              重复组 {status.duplicateGroups}
            </Badge>
            <Badge
              variant={status.fallbackWithCopy > 0 ? "destructive" : "outline"}
            >
              兜底副本 {status.fallbackWithCopy}
            </Badge>
            <Badge
              variant={status.unhashedQuestions > 0 ? "destructive" : "outline"}
            >
              未回填指纹 {status.unhashedQuestions}
            </Badge>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => run(false)}>
            {busy ? "处理中…" : "预检（不改数据）"}
          </Button>
          <Button
            variant="destructive"
            disabled={busy || !report}
            onClick={() => setConfirming(true)}
          >
            执行清理
          </Button>
        </div>

        {report && (
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <p className="font-medium mb-2">预检报告（未修改数据）</p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
              <Row k="兜底副本组" v={report.fallbackPairs} />
              <Row k="将迁移日志" v={report.logsMoved} />
              <Row k="SRS 迁移" v={report.srsMoved} />
              <Row k="SRS 合并" v={report.srsMerged} />
              <Row k="将删除题目" v={report.deletedQuestions} />
              <Row k="孤本打标" v={report.markedFallback} />
              <Row k="回填指纹" v={report.hashesBackfilled} />
              <Row k="剩余重复组" v={report.remainingDuplicateGroups} />
            </dl>
          </div>
        )}

        {confirming && (
          <div
            role="alertdialog"
            aria-label="确认执行数据清理"
            className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3"
          >
            <p className="text-sm font-medium text-destructive">
              将按上面的预检报告实际写库（删除兜底副本、迁移记录）。服务端会先备份，但
              请确认报告数字符合预期。
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => run(true)}
              >
                {busy ? "执行中…" : "确认执行"}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                取消
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium tabular-nums">{v}</dd>
    </div>
  );
}
