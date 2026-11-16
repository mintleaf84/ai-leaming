"use client";

import { useRef, useState } from "react";
import {
  deleteUserAction,
  resetUserPasswordAction,
  updateUserRoleAction,
  revokeUserSessionAction,
} from "@/server/actions/admin";
import { setUserSubscriptionAction } from "@/server/actions/subscription";
import { UserRole } from "@/types";
import { toast } from "sonner";
import type { UseUsersDataResult } from "./use-users-data";
import type { UserWithSubscription } from "../types";

/**
 * 用户管理页的动作层 + 两个弹窗的状态机。
 *
 * 写操作成功后一律走 `refreshInBackground`（不动 loading / 不把列表换成错误态），
 * 订阅保存额外做一次本地乐观更新；刷新次数与拆分前完全一致（每次成功操作恰好一次）。
 */
export function useUsersActions(data: UseUsersDataResult) {
  const { plans, refreshInBackground, patchUser } = data;

  // ---- 重置密码对话框 ----
  const [resetId, setResetId] = useState<number | null>(null);
  // 目标用户快照：列表刷新/翻页后对话框仍要显示用户名，不能从当前页数据现查
  const [resetTarget, setResetTarget] = useState<UserWithSubscription | null>(
    null,
  );
  // 打开对话框的触发按钮：页面级 Dialog 没有 DialogTrigger，关闭时手动归还焦点
  const resetTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [newPass, setNewPass] = useState("");

  // ---- 订阅对话框 ----
  const [subDialogOpen, setSubDialogOpen] = useState(false);
  const [subUserId, setSubUserId] = useState<number | null>(null);
  const [subUserName, setSubUserName] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("free");
  const [subDuration, setSubDuration] = useState("0"); // 0 表示永久
  const [savingSub, setSavingSub] = useState(false);

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        `确定要删除用户 ID:${id} 吗？此操作将清除该用户所有数据且不可恢复！`,
      )
    )
      return;
    const result = await deleteUserAction(id);
    if (result.serverError) {
      toast.error(result.serverError || "删除失败");
    } else if (result.data?.success) {
      toast.success("用户已删除");
      // 删除已成功：刷新失败不应把列表替换成错误态
      refreshInBackground();
    }
  };

  // 打开重置密码对话框：记住触发按钮，关闭后把焦点还回去
  const openResetDialog = (
    user: UserWithSubscription,
    trigger: HTMLButtonElement | null,
  ) => {
    resetTriggerRef.current = trigger;
    setResetTarget(user);
    setResetId(user.id);
  };

  const closeResetDialog = () => {
    setResetId(null);
    setResetTarget(null);
  };

  const handleResetPassword = async () => {
    if (!resetId || !newPass) return;
    const result = await resetUserPasswordAction({
      id: resetId,
      newPassword: newPass,
    });
    if (result.serverError) {
      toast.error(result.serverError || "重置失败");
    } else if (result.data?.success) {
      toast.success("密码已重置");
      closeResetDialog();
      setNewPass("");
    }
  };

  const handleRoleChange = async (id: number, role: UserRole) => {
    const result = await updateUserRoleAction({ id, role });
    if (result.serverError) {
      toast.error(result.serverError || "更新失败");
    } else if (result.data?.success) {
      toast.success("角色已更新");
      // 角色已改成功：刷新失败不应把列表替换成错误态
      refreshInBackground();
    }
  };

  const handleRevokeSession = async (id: number) => {
    if (
      !confirm(
        `确定要强制下线用户 ID:${id} 的所有活动会话吗？用户需要重新登录。`,
      )
    )
      return;
    const result = await revokeUserSessionAction(id);
    if (result.serverError) {
      toast.error(result.serverError || "操作失败");
    } else if (result.data?.success) {
      toast.success("用户已强制下线");
    }
  };

  // 打开订阅对话框
  const openSubDialog = (user: UserWithSubscription) => {
    setSubUserId(user.id);
    setSubUserName(user.username);
    setSelectedPlanId(user.plan_id || "free");
    setSubDuration("0");
    setSubDialogOpen(true);
  };

  // 保存订阅
  const handleSaveSubscription = async () => {
    if (!subUserId) return;
    setSavingSub(true);
    try {
      const duration = parseInt(subDuration);
      const result = await setUserSubscriptionAction({
        userId: subUserId,
        planId: selectedPlanId,
        durationMonths: duration || undefined,
      });
      if (result.data?.success) {
        toast.success("订阅已更新");
        setSubDialogOpen(false);
        // action 只回 { success }，不含订阅详情：先按本次请求的入参做本地乐观更新
        // （套餐 + 状态 + 到期），再用后台刷新对齐服务端的真实 status/expires_at，
        // 否则卡片/表格会一直显示改之前的套餐与到期时间
        const planName =
          plans.find((p) => p.id === selectedPlanId)?.name || selectedPlanId;
        const expiresAt = (() => {
          if (!duration || duration <= 0) return null;
          const expireDate = new Date();
          expireDate.setMonth(expireDate.getMonth() + duration);
          return expireDate.toISOString();
        })();
        patchUser(subUserId, {
          plan_id: selectedPlanId,
          plan_name: planName,
          subscription_status: "active",
          expires_at: expiresAt,
        });
        // 后台刷新失败只提示一次并保留上面的乐观值（loadUsers 内部处理）
        refreshInBackground();
      } else {
        toast.error(
          `操作失败：${result.serverError || "服务端未确认订阅变更"}`,
        );
        return;
      }
    } catch (error) {
      console.error("更新用户订阅失败", error);
      toast.error(
        `操作失败：${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    } finally {
      setSavingSub(false);
    }
  };

  return {
    // 行内/卡片操作
    handleDelete,
    handleRoleChange,
    handleRevokeSession,
    // 重置密码对话框
    resetId,
    resetTarget,
    resetTriggerRef,
    newPass,
    setNewPass,
    openResetDialog,
    closeResetDialog,
    handleResetPassword,
    // 订阅对话框
    subDialogOpen,
    setSubDialogOpen,
    subUserName,
    selectedPlanId,
    setSelectedPlanId,
    subDuration,
    setSubDuration,
    savingSub,
    openSubDialog,
    handleSaveSubscription,
  };
}

export type UseUsersActionsResult = ReturnType<typeof useUsersActions>;
