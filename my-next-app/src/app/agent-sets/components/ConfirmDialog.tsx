"use client";

import { Loader2 } from "lucide-react";
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

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 题集页的二次确认（转正入库、中途退出练习）。
 *
 * 与试卷页的 ExamConfirmDialog 同构，但没有放一个跨 feature 的 import：
 * 试卷那个带「破坏性动作红色按钮 / 焦点归还」两个只服务于交卷的细节，
 * 这里只需要一个能显示 busy 的确认框。
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  busyLabel = "处理中…",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AlertDialog
      open
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <AlertDialogContent className="max-w-sm gap-0 rounded-2xl border-border bg-card p-5 shadow-xl">
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle className="text-base font-semibold text-foreground">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-5 gap-2 sm:justify-end">
          <AlertDialogCancel onClick={onCancel} disabled={busy}>
            取消
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {busy ? busyLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
