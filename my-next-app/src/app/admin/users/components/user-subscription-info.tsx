"use client";

import React from "react";
import { CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/utils";
import type { UserWithSubscription } from "../types";
import { formatBeijingDate } from "@/lib/utils/datetime";

// 获取套餐徽章颜色
function getPlanBadgeVariant(planId: string) {
  switch (planId) {
    case "pro":
      return "default";
    case "basic":
      return "secondary";
    default:
      return "outline";
  }
}

// 订阅状态 → 徽章文案/样式（表格与卡片共用同一份映射）
// 注意：库里 status 只是冗余字段，到期后可能仍是 "active"（没有定时任务改它），
// 所以判定以 expires_at 为准：已过期一律显示「已过期」，expires_at 为空视为永久。
function getSubscriptionBadge(
  status?: string | null,
  expiresAt?: string | null,
) {
  if (status !== "active" && status !== "expired" && status !== "cancelled") {
    return null;
  }
  if (
    status !== "cancelled" &&
    expiresAt &&
    new Date(expiresAt).getTime() < Date.now()
  ) {
    return { label: "已过期", variant: "warning" as const };
  }
  switch (status) {
    case "active":
      return { label: "有效", variant: "success" as const };
    case "expired":
      return { label: "已过期", variant: "warning" as const };
    default:
      return { label: "已取消", variant: "outline" as const };
  }
}

// 到期时间文案（表格与卡片共用）
function formatExpiresAt(expiresAt?: string | null) {
  return expiresAt ? `到期 ${formatBeijingDate(expiresAt)}` : "永久";
}

interface UserSubscriptionInfoProps {
  user: UserWithSubscription;
  /** 移动档把可点击徽章撑到 ≥44px */
  touchFriendly?: boolean;
  onOpenSubscription: (user: UserWithSubscription) => void;
}

/**
 * 订阅信息（套餐徽章 + 到期时间 + 状态徽章）：表格与卡片口径完全一致。
 * 套餐徽章点击即打开订阅对话框（两套投影共用）。
 */
export function UserSubscriptionInfo({
  user,
  touchFriendly = false,
  onOpenSubscription,
}: UserSubscriptionInfoProps) {
  const badge = getSubscriptionBadge(user.subscription_status, user.expires_at);
  return (
    <>
      {/* 可点击元素在移动档必须 ≥ 44px（ui-system.md §6.2），Badge 默认只有 ~22px。 */}
      <Badge
        variant={getPlanBadgeVariant(user.plan_id || "free")}
        className={cn(
          "cursor-pointer hover:opacity-80",
          touchFriendly && "inline-flex min-h-11 items-center px-3",
        )}
        onClick={() => onOpenSubscription(user)}
      >
        <CreditCard className="h-3 w-3 mr-1" />
        {user.plan_name || "免费版"}
      </Badge>
      <span className="text-xs text-muted-foreground">
        {formatExpiresAt(user.expires_at)}
      </span>
      {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
    </>
  );
}
