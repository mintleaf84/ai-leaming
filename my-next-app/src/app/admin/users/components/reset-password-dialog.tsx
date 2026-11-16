"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ResetPasswordDialogProps {
  /** 对话框是否打开（原实现以 resetId !== null 判定） */
  open: boolean;
  /** 目标用户快照里的用户名 */
  username: string;
  newPass: string;
  onNewPassChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  /** 打开对话框的触发按钮：关闭时把焦点还回去 */
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

/**
 * 重置密码对话框：只渲染一份，避免桌面/移动两套投影各弹一个。
 * 状态与提交动作在动作层，这里只做展示。
 */
export function ResetPasswordDialog({
  open,
  username,
  newPass,
  onNewPassChange,
  onCancel,
  onConfirm,
  triggerRef,
}: ResetPasswordDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel();
      }}
    >
      <DialogContent
        // 页面级 Dialog 没有 DialogTrigger：Radix 找不到触发器会把焦点丢到 body，
        // 这里显式还回打开它的那个按钮（列表刷新 / 翻页后该按钮可能已卸载，故用可选链）
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>重置密码 - {username}</DialogTitle>
          <DialogDescription>请输入新的登录密码。</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input
            type="text"
            placeholder="新密码"
            value={newPass}
            onChange={(e) => onNewPassChange(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button onClick={onConfirm}>确认重置</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
