"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Link2Off,
  Loader2,
  RefreshCw,
  ScanLine,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { formatBeijingDateTime } from "@/lib/utils/datetime";
import {
  useFenbiSync,
  type FenbiFailedItem,
  type FenbiSyncResult,
} from "@/lib/hooks/useFenbiSync";

import { FenbiBindDialog, type FenbiBindMode } from "./FenbiBindDialog";

/** 全站唯一一处「限制说明」文案，卡片底部与页面说明共用 */
export const FENBI_LIMITATION_TEXT =
  "试卷/模考记录暂不支持（粉笔还没有开放这类记录的读取），目前只同步知识点练习。";

/**
 * 粉笔同步卡片。
 *
 * 状态机：
 * - 未绑定 → 「扫码绑定」/「用手机号密码绑定」两个入口
 * - 已绑定 → 掩码手机号、上次同步时间、上次结果、立即同步、解绑
 *
 * 四态渲染顺序固定（docs/fenbi-sync-design.md §5 / useAppQuery 约定）：
 * 加载中 → 失败可重试 → 已绑定/未绑定。
 */
export function FenbiSyncCard() {
  const {
    status,
    isLoading,
    isError,
    error,
    retry,
    refetch,
    isSyncing,
    isUnlinking,
    actionError,
    runSync,
    unlink,
    clearActionError,
  } = useFenbiSync();

  const [bindOpen, setBindOpen] = React.useState(false);
  const [bindMode, setBindMode] = React.useState<FenbiBindMode>("qrcode");
  const [freshResult, setFreshResult] = React.useState<FenbiSyncResult | null>(
    null,
  );
  const [unlinkOpen, setUnlinkOpen] = React.useState(false);

  const openBind = React.useCallback((mode: FenbiBindMode) => {
    setBindMode(mode);
    setBindOpen(true);
  }, []);

  const handleLinked = React.useCallback(() => {
    setFreshResult(null);
    void refetch();
  }, [refetch]);

  const handleSync = React.useCallback(async () => {
    const outcome = await runSync();
    if (outcome.ok) {
      setFreshResult({
        ...outcome.result,
        finishedAt: outcome.result.finishedAt ?? new Date().toISOString(),
      });
      const { imported, skipped, newQuestions } = outcome.result;
      toast.success(
        imported > 0
          ? `同步完成：导入 ${imported} 条练习，新增 ${newQuestions} 道题`
          : `同步完成：没有新练习需要导入（跳过 ${skipped} 条已同步记录）`,
      );
      return;
    }
    toast.error(outcome.message);
  }, [runSync]);

  const handleUnlink = React.useCallback(async () => {
    const outcome = await unlink();
    setUnlinkOpen(false);
    if (outcome.ok) {
      setFreshResult(null);
      toast.success("已解绑粉笔账号，同步过来的练习记录仍然保留");
      return;
    }
    toast.error(outcome.message);
  }, [unlink]);

  const linked = status?.linked ?? false;
  const result = freshResult ?? status?.lastResult ?? null;
  const lastSyncLabel = freshResult?.finishedAt
    ? formatBeijingDateTime(freshResult.finishedAt)
    : status?.lastSyncAt
      ? formatBeijingDateTime(status.lastSyncAt)
      : null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">粉笔同步</CardTitle>
          <CardDescription>
            绑定粉笔账号后，练习记录会自动同步成练习历史与错题本。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="space-y-3"
            aria-busy="true"
            aria-live="polite"
            aria-label="正在读取粉笔账号状态"
          >
            <div className="h-11 animate-pulse rounded-lg bg-muted" />
            <div className="h-11 animate-pulse rounded-lg bg-muted" />
            <span className="sr-only">正在读取粉笔账号状态…</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="pt-6">
          <ErrorState
            title="没有取到粉笔账号状态"
            description={
              error?.message ||
              "请求没有成功，可能是网络问题，也可能是服务正在升级。"
            }
            onRetry={retry}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base font-medium">粉笔同步</CardTitle>
            <Badge variant={linked ? "success" : "secondary"}>
              {linked ? "已绑定" : "未绑定"}
            </Badge>
          </div>
          <CardDescription>
            绑定粉笔账号后，知识点练习记录会自动同步成练习历史与错题本，不需要手动导出。
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {!linked ? (
            <div className="space-y-4">
              <p className="text-sm leading-6 text-muted-foreground">
                还没有绑定粉笔账号。推荐用粉笔 App
                扫码，几秒就能完成；也可以直接用手机号和密码绑定。
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  size="lg"
                  className="sm:flex-1"
                  onClick={() => openBind("qrcode")}
                >
                  <ScanLine className="mr-2 h-4 w-4" aria-hidden />
                  扫码绑定
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="sm:flex-1"
                  onClick={() => openBind("password")}
                >
                  用手机号密码绑定
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <dl className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-sm text-muted-foreground">已绑定账号</dt>
                  <dd className="text-sm font-medium text-foreground">
                    {status?.phoneMasked ?? "粉笔账号"}
                  </dd>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-sm text-muted-foreground">上次同步</dt>
                  <dd className="text-sm text-foreground">
                    {lastSyncLabel ?? "还没有同步过"}
                  </dd>
                </div>
              </dl>

              {result ? (
                <SyncResultSummary
                  result={result}
                  justNow={freshResult !== null}
                />
              ) : (
                <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                  绑定成功，还没有同步过练习记录。点下面的「立即同步」开始。
                </p>
              )}

              {actionError ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                >
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden
                  />
                  <p className="flex-1">{actionError}</p>
                  <button
                    type="button"
                    onClick={clearActionError}
                    className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md px-2 text-xs text-destructive/80 underline-offset-4 hover:underline"
                  >
                    知道了
                  </button>
                </div>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  size="lg"
                  className="sm:flex-1"
                  onClick={handleSync}
                  disabled={isSyncing || isUnlinking}
                >
                  {isSyncing ? (
                    <>
                      <Loader2
                        className="mr-2 h-4 w-4 animate-spin"
                        aria-hidden
                      />
                      正在同步…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
                      立即同步
                    </>
                  )}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="sm:w-auto"
                  onClick={() => setUnlinkOpen(true)}
                  disabled={isSyncing || isUnlinking}
                >
                  <Link2Off className="mr-2 h-4 w-4" aria-hidden />
                  {isUnlinking ? "正在解绑…" : "解绑"}
                </Button>
              </div>
            </div>
          )}

          <p className="text-xs leading-5 text-muted-foreground">
            {FENBI_LIMITATION_TEXT}
          </p>
        </CardContent>
      </Card>

      <FenbiBindDialog
        open={bindOpen}
        onOpenChange={setBindOpen}
        defaultMode={bindMode}
        onLinked={handleLinked}
      />

      <AlertDialog open={unlinkOpen} onOpenChange={setUnlinkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>解绑粉笔账号？</AlertDialogTitle>
            <AlertDialogDescription>
              解绑后会清除保存的登录凭证，之后不再自动同步。已经同步过来的练习记录和错题不会被删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">先不解绑</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              onClick={(event) => {
                event.preventDefault();
                void handleUnlink();
              }}
            >
              确认解绑
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SyncResultSummary({
  result,
  justNow = false,
}: {
  result: FenbiSyncResult;
  justNow?: boolean;
}) {
  const failed = result.failed ?? [];

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
        {justNow ? "刚刚同步的结果" : "上次同步结果"}
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <SummaryStat label="导入练习" value={result.imported} />
        <SummaryStat label="跳过已同步" value={result.skipped} />
        <SummaryStat label="新增题目" value={result.newQuestions} />
      </dl>

      {failed.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            有 {failed.length} 条记录没有同步成功
          </p>
          <ul className="space-y-2">
            {failed.map((item, index) => (
              <FailedRow
                key={`${item.exerciseId ?? "item"}-${index}`}
                item={item}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  // dt 必须在 dd 前面（dl 的语义顺序），用 flex-col-reverse 把数字显示在上方
  return (
    <div className="flex flex-col-reverse">
      <dt className="mt-1 text-xs text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}

function FailedRow({ item }: { item: FenbiFailedItem }) {
  // type === 1 是粉笔的「试卷/模考」记录：接口没开放，必须说清楚，别让用户以为是自己操作错了
  const isPaperRecord = item.type === 1;

  return (
    <li className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
      <p className="font-medium text-foreground">
        {isPaperRecord
          ? "试卷/模考记录暂不支持"
          : item.title || "这条记录没有同步成功"}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {isPaperRecord
          ? "粉笔还没有开放试卷与模考记录的读取，只能同步知识点练习。"
          : item.reason || "稍后点「立即同步」会再试一次。"}
      </p>
    </li>
  );
}

export default FenbiSyncCard;
