"use client";

import React from "react";
import { KeyRound, LogOut, CreditCard, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserRole } from "@/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { UserWithSubscription } from "../types";
import { UserRoleControl } from "./user-role-control";
import { UserSubscriptionInfo } from "./user-subscription-info";
import { formatBeijingDateTime } from "@/lib/utils/datetime";

interface UsersTableProps {
  users: UserWithSubscription[];
  onRoleChange: (id: number, role: UserRole) => void;
  onRevokeSession: (id: number) => void;
  onDelete: (id: number) => void;
  onOpenSubscription: (user: UserWithSubscription) => void;
  onOpenReset: (user: UserWithSubscription, trigger: HTMLButtonElement) => void;
}

/**
 * 桌面（lg 起）6 列用户表格。
 *
 * lg 起而非 md 起：768 视口减去侧边栏 16rem 只剩约 512px，列会被压出横向溢出。
 * ui-system.md §4 的「表格从 md 起允许」在这里按实测放宽到 lg：md 档仍用卡片。
 */
export function UsersTable({
  users,
  onRoleChange,
  onRevokeSession,
  onDelete,
  onOpenSubscription,
  onOpenReset,
}: UsersTableProps) {
  return (
    <div
      className="hidden rounded-lg border lg:block"
      data-testid="admin-users-table"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">ID</TableHead>
            <TableHead>用户名</TableHead>
            <TableHead>注册时间</TableHead>
            <TableHead className="w-28">角色</TableHead>
            <TableHead className="w-40">订阅</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-mono">{user.id}</TableCell>
              <TableCell className="font-medium">{user.username}</TableCell>
              <TableCell className="text-muted-foreground">
                {formatBeijingDateTime(user.created_at)}
              </TableCell>
              <TableCell>
                <UserRoleControl user={user} onRoleChange={onRoleChange} />
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  <UserSubscriptionInfo
                    user={user}
                    onOpenSubscription={onOpenSubscription}
                  />
                </div>
              </TableCell>
              <TableCell className="space-x-2 text-right">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenSubscription(user)}
                >
                  <CreditCard className="h-4 w-4 mr-1" />
                  订阅
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => onOpenReset(user, e.currentTarget)}
                >
                  <KeyRound className="h-4 w-4 mr-1" />
                  重置密码
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  title="强制下线"
                  aria-label={`强制下线 ${user.username}`}
                  className="text-orange-500 hover:bg-orange-50 hover:text-orange-600"
                  onClick={() => onRevokeSession(user.id)}
                >
                  <LogOut className="h-4 w-4" />
                </Button>

                {!user.is_admin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`删除用户 ${user.username}`}
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => onDelete(user.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
