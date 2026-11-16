"use client";

import React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useUsersData } from "./hooks/use-users-data";
import { useUsersActions } from "./hooks/use-users-actions";
import { UsersTable } from "./components/users-table";
import { UsersCardList } from "./components/users-card-list";
import { UsersPagination } from "./components/users-pagination";
import { UsersLoadingSkeleton } from "./components/users-loading-skeleton";
import { ResetPasswordDialog } from "./components/reset-password-dialog";
import { SubscriptionDialog } from "./components/subscription-dialog";

/**
 * 用户管理页：只做编排（取数的三态 → 布局 → 传回调），
 * 数据与分页在 useUsersData，写操作与两个弹窗的状态在 useUsersActions，
 * 表格/卡片/分页/弹窗各自成组件。
 */
export default function UsersPage() {
  const data = useUsersData();
  const actions = useUsersActions(data);

  // Server-side filtering is now in place
  const filteredUsers = data.users;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 md:px-6 lg:py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            用户管理
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            管理系统注册用户及订阅状态
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索用户名"
            className="pl-8"
            value={data.search}
            onChange={(e) => data.setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>用户列表</CardTitle>
          <CardDescription>共 {data.users.length} 位注册用户</CardDescription>
        </CardHeader>
        <CardContent>
          {data.loading ? (
            <UsersLoadingSkeleton />
          ) : data.loadError ? (
            <ErrorState
              title="用户列表加载失败"
              description={data.loadError}
              onRetry={data.reload}
            />
          ) : filteredUsers.length === 0 ? (
            <EmptyState title="没有找到用户" description="换个关键词再试试" />
          ) : (
            <>
              {/* 桌面（lg 起）：6 列宽表格；md 档仍用卡片（见 UsersTable 注释） */}
              <UsersTable
                users={filteredUsers}
                onRoleChange={actions.handleRoleChange}
                onRevokeSession={actions.handleRevokeSession}
                onDelete={actions.handleDelete}
                onOpenSubscription={actions.openSubDialog}
                onOpenReset={actions.openResetDialog}
              />
              {/* 移动/平板（< lg）：卡片投影 */}
              <UsersCardList
                users={filteredUsers}
                onRoleChange={actions.handleRoleChange}
                onRevokeSession={actions.handleRevokeSession}
                onDelete={actions.handleDelete}
                onOpenSubscription={actions.openSubDialog}
                onOpenReset={actions.openResetDialog}
              />
            </>
          )}
        </CardContent>
        <UsersPagination
          page={data.page}
          limit={data.limit}
          total={data.total}
          shownCount={data.users.length}
          loading={data.loading}
          onPrev={() => data.setPage((p) => Math.max(1, p - 1))}
          onNext={() => data.setPage((p) => p + 1)}
        />
      </Card>

      {/* 重置密码对话框：只渲染一份，避免桌面/移动两套投影各弹一个 */}
      <ResetPasswordDialog
        open={actions.resetId !== null}
        username={actions.resetTarget?.username ?? ""}
        newPass={actions.newPass}
        onNewPassChange={actions.setNewPass}
        onCancel={actions.closeResetDialog}
        onConfirm={actions.handleResetPassword}
        triggerRef={actions.resetTriggerRef}
      />

      {/* 订阅对话框 */}
      <SubscriptionDialog
        open={actions.subDialogOpen}
        onOpenChange={actions.setSubDialogOpen}
        username={actions.subUserName}
        plans={data.plans}
        selectedPlanId={actions.selectedPlanId}
        onPlanChange={actions.setSelectedPlanId}
        duration={actions.subDuration}
        onDurationChange={actions.setSubDuration}
        saving={actions.savingSub}
        onCancel={() => actions.setSubDialogOpen(false)}
        onConfirm={actions.handleSaveSubscription}
      />
    </div>
  );
}
