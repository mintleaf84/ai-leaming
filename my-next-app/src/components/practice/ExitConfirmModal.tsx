"use client";

import React, { useRef } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ExitConfirmModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * 退出练习确认框。
 *
 * 用 AlertDialog 而不是自建 fixed 浮层：`role="alertdialog"` + 焦点移入/陷阱 +
 * Esc 关闭都由 Radix 提供，且遮罩/标题/描述/按钮的语义是现成的。
 * 关闭方式保持不变：只能点「取消」「退出练习」（Esc 是新增的，原来按了没反应）。
 */
export function ExitConfirmModal({
  isOpen,
  onCancel,
  onConfirm,
}: ExitConfirmModalProps) {
  // Radix 关闭时默认把焦点还给 AlertDialogTrigger；本组件由外部 isOpen 驱动、
  // 没有 Trigger，不兜底焦点会落在 body 上（读屏回到页首）。
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  // 点「退出练习」后 AlertDialogAction 会自动关闭浮层并回调 onOpenChange(false)，
  // 不区分就会在确认之后又执行一次「取消」。
  const confirmedRef = useRef(false);

  const handleOpenChange = (open: boolean) => {
    if (open) return;
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
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        aria-modal="true"
        overlayClassName="bg-black/50 backdrop-blur-sm"
        className="max-w-sm gap-0 rounded-2xl border-border bg-card shadow-xl sm:rounded-2xl"
        onOpenAutoFocus={() => {
          // 必须在 Radix 把焦点移进浮层之前记下触发元素（此时 activeElement 还是它）
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
          // 触发元素已卸载（例如练习页整体切走）：退到主滚动区，别把焦点丢给 body
          const main = document.querySelector<HTMLElement>("main");
          if (main) {
            main.setAttribute("tabindex", "-1");
            main.focus();
          }
        }}
      >
        <AlertDialogHeader className="space-y-0">
          <AlertDialogTitle className="text-xl font-bold leading-7 text-foreground mb-2">
            确定要退出吗？
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base text-muted-foreground mb-6">
            当前的练习进度已自动保存，但未完成的题目将不会计入本次统计。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex gap-3">
          {/* 取消由 AlertDialogCancel 的关闭语义触发，走 handleOpenChange → onCancel */}
          <AlertDialogCancel className="mt-0 flex-1">取消</AlertDialogCancel>
          <AlertDialogAction
            className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={handleConfirm}
          >
            退出练习
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
