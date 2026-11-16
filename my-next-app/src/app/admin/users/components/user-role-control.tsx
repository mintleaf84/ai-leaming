"use client";

import React from "react";
import { Shield } from "lucide-react";
import { UserRole } from "@/types";
import { cn } from "@/lib/utils/utils";
import type { UserWithSubscription } from "../types";

interface UserRoleControlProps {
  user: UserWithSubscription;
  /** 移动档把触控尺寸放大到 44px（ui-system.md §6.2） */
  touchFriendly?: boolean;
  onRoleChange: (id: number, role: UserRole) => void;
}

/**
 * 角色控件：桌面表格与移动卡片共用（只切换尺寸，不复制业务回调）
 */
export function UserRoleControl({
  user,
  touchFriendly = false,
  onRoleChange,
}: UserRoleControlProps) {
  return user.is_admin ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
      <Shield className="h-3 w-3" />
      管理员
    </span>
  ) : (
    <select
      aria-label={`修改 ${user.username} 的角色`}
      value={user.role || "student"}
      onChange={(e) => onRoleChange(user.id, e.target.value as UserRole)}
      className={cn(
        "rounded-lg border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary",
        touchFriendly ? "h-11" : "py-1",
      )}
    >
      <option value="student">学生</option>
      <option value="admin">管理员</option>
    </select>
  );
}
