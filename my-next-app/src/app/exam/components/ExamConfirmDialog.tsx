"use client";

import { useRef } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ExamConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** 破坏性动作（离开、放弃）用红色按钮 */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 试卷页的确认框：交卷前"还有 N 题没作答"、以及未交卷时离开页面。
 *
 * 结构与 `components/practice/ExitConfirmModal.tsx` 一致（AlertDialog + 关闭后把
 * 焦点还给触发元素），只是文案与动作由调用方给：练习页只有"退出"，试卷页有
 * 两个不同的确认点，复制两份会逐渐分叉。
 */
export function ExamConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "取消",
  destructive = false,
  onConfirm,
  onCancel,
}: ExamConfirmDialogProps) {
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  // 点确认后 Radix 会再回调 onOpenChange(false)，不区分就会紧接着执行一次"取消"
  const confirmedRef = useRef(false);

  const handleOpenChange = (next: boolean) => {
    if (next) return;
    if (confirmedRef.current) {
      confirmedRef.current = false;
      return;
    }
    onCancel();
  };

  const handleConfirm = () => {
    confirmedRef.current = true;
    onConfirm();
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        aria-modal="true"
        overlayClassName="bg-black/50"
        className="max-w-sm gap-0 rounded-2xl border-border bg-card shadow-xl sm:rounded-2xl"
        onOpenAutoFocus={() => {
          restoreFocusRef.current =
            document.activeElement as HTMLElement | null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = restoreFocusRef.current;
          if (target?.isConnected) {
            target.focus();
            return;
          }
          const main = document.querySelector<HTMLElement>("main");
          if (main) {
            main.setAttribute("tabindex", "-1");
            main.focus();
          }
        }}
      >
        <AlertDialogHeader className="space-y-0">
          <AlertDialogTitle className="mb-2 text-xl font-bold leading-7 text-foreground">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="mb-6 text-base text-muted-foreground">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex gap-3">
          <AlertDialogCancel className="mt-0 flex-1">
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            className={
              destructive
                ? "flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "flex-1"
            }
            onClick={handleConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
