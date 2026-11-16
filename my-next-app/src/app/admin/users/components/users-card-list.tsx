"use client";

import React from "react";
import { LogOut, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserRole } from "@/types";
import type { UserWithSubscription } from "../types";
import { UserRoleControl } from "./user-role-control";
import { UserSubscriptionInfo } from "./user-subscription-info";

interface UsersCardListProps {
  users: UserWithSubscription[];
  onRoleChange: (id: number, role: UserRole) => void;
  onRevokeSession: (id: number) => void;
  onDelete: (id: number) => void;
  onOpenSubscription: (user: UserWithSubscription) => void;
  onOpenReset: (user: UserWithSubscription, trigger: HTMLButtonElement) => void;
}

/**
 * 移动/平板（< lg）卡片投影：字段 = 用户名+角色 / 套餐+到期+状态，操作在卡底
 */
export function UsersCardList({
  users,
  onRoleChange,
  onRevokeSession,
  onDelete,
  onOpenSubscription,
  onOpenReset,
}: UsersCardListProps) {
  return (
    <ul className="space-y-2 lg:hidden" data-testid="admin-users-cards">
      {users.map((user) => (
        <li key={user.id} className="rounded-lg border bg-card p-4">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.username}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                ID {user.id} · 注册于{" "}
                {new Date(user.created_at).toLocaleDateString("zh-CN")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <UserRoleControl
                user={user}
                touchFriendly
                onRoleChange={onRoleChange}
              />
              <Button
                variant="ghost"
                size="sm"
                title="强制下线"
                aria-label={`强制下线 ${user.username}`}
                className="h-11 w-11 text-orange-500 hover:bg-orange-50 hover:text-orange-600"
                onClick={() => onRevokeSession(user.id)}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <UserSubscriptionInfo
              user={user}
              touchFriendly
              onOpenSubscription={onOpenSubscription}
            />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-11 flex-1"
              onClick={() => onOpenSubscription(user)}
            >
              订阅
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-11 flex-1"
              onClick={(e) => onOpenReset(user, e.currentTarget)}
            >
              重置密码
            </Button>
            {!user.is_admin && (
              <Button
                variant="ghost"
                size="sm"
                className="h-11 w-11 shrink-0 text-destructive hover:bg-destructive/10"
                title="删除用户"
                aria-label={`删除用户 ${user.username}`}
                onClick={() => onDelete(user.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
