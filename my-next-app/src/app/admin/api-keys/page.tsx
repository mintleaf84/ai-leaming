"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Key, Plus, ShieldAlert } from "lucide-react";
import { useApiKeysData } from "./hooks/use-api-keys-data";
import { useApiKeysActions } from "./hooks/use-api-keys-actions";
import { ApiKeysTable } from "./components/api-keys-table";
import { ApiKeysCardList } from "./components/api-keys-card-list";
import { ApiKeysLoadingSkeleton } from "./components/api-keys-loading-skeleton";
import { CreatedKeyPanel } from "./components/created-key-panel";
import { CreateApiKeyDialog } from "./components/create-api-key-dialog";

/**
 * API Key 管理页：只做编排（取数三态 → 布局 → 传回调）。
 * 列表与三态在 useApiKeysData，创建对话框/一次性明文/行操作在 useApiKeysActions，
 * 表格、卡片、骨架、明文提示条、创建对话框各自成组件。
 */
export default function ApiKeysPage() {
  const data = useApiKeysData();
  const actions = useApiKeysActions(data);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 lg:py-10">
      {/* 1 PageHeader */}
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight md:text-3xl">
            <Key className="h-6 w-6 shrink-0 text-primary" aria-hidden />
            API Key 管理
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            外部服务用它调用开放接口。当前 {data.activeCount} 个激活，共{" "}
            {data.keys.length} 个（其中 {data.globalCount} 个全局 key）
          </p>
        </div>
        <Button
          className="hidden sm:inline-flex"
          onClick={actions.openCreateDialog}
        >
          <Plus aria-hidden />
          生成新密钥
        </Button>
      </header>

      {/* 全局 key 的语义必须写在页面上，而不是只藏在说明里 */}
      <div className="mb-6 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-muted p-3">
        <ShieldAlert
          className="mt-0.5 h-4 w-4 shrink-0 text-warning"
          aria-hidden
        />
        <p className="text-xs leading-5 text-foreground">
          全局 key 等价站长身份：它以站长账号执行请求，只受作用域限制。
          <span className="font-medium">不要把全局 key 分发给他人</span>
          ；给第三方平台用，请选 read 作用域，或绑定到某个普通用户。
        </p>
      </div>

      {/* 新建成功的密钥（只显示一次） */}
      <CreatedKeyPanel
        createdKey={actions.createdKey}
        copied={actions.copiedId === -1}
        copiedCurl={actions.copiedCurlId === -1}
        onClose={actions.clearCreatedKey}
        onCopy={() => {
          if (actions.createdKey) {
            actions.handleCopy(actions.createdKey.key, -1);
          }
        }}
        onCopyCurl={() => {
          if (actions.createdKey) {
            actions.handleCopyCurl(actions.createdKey.key, -1);
          }
        }}
      />

      {/* 3 Content：加载 → 骨架 / 失败 → ErrorState / 空 → EmptyState / 就绪 → 表格+卡片 */}
      {data.loading ? (
        <ApiKeysLoadingSkeleton />
      ) : data.loadError ? (
        <ErrorState
          title="密钥列表加载失败"
          description={data.loadError}
          onRetry={() => data.reload()}
        />
      ) : data.keys.length === 0 ? (
        <EmptyState
          icon={<Key className="h-12 w-12" aria-hidden />}
          title="还没有 API Key"
          description="生成一把密钥，外部服务就能读取练习数据、导入答题记录。"
          action={
            <Button size="lg" onClick={actions.openCreateDialog}>
              <Plus aria-hidden />
              生成新密钥
            </Button>
          }
        />
      ) : (
        <>
          {/* 桌面（lg 起）：五列 —— 密钥 / 作用域 / 归属 / 最近使用 / 操作 */}
          <ApiKeysTable
            keys={data.keys}
            visibleKeys={actions.visibleKeys}
            copiedId={actions.copiedId}
            copiedCurlId={actions.copiedCurlId}
            onToggleVisibility={actions.toggleVisibility}
            onCopy={actions.handleCopy}
            onCopyCurl={actions.handleCopyCurl}
            onToggleActive={actions.handleToggle}
            onDelete={actions.handleDelete}
          />

          {/* 手机 / 平板（< lg）：卡片投影，字段 3 个（描述 / 作用域+归属 / 最近使用） */}
          <ApiKeysCardList
            keys={data.keys}
            copiedId={actions.copiedId}
            onCopy={actions.handleCopy}
            onToggleActive={actions.handleToggle}
            onDelete={actions.handleDelete}
          />
        </>
      )}

      {/* 手机端主操作放在内容流末尾（拇指区），桌面用页头那颗 */}
      {!data.loading && !data.loadError && data.keys.length > 0 && (
        <Button
          size="lg"
          className="mt-4 w-full sm:hidden"
          onClick={actions.openCreateDialog}
        >
          <Plus aria-hidden />
          生成新密钥
        </Button>
      )}

      {/* 创建对话框 */}
      <CreateApiKeyDialog
        open={actions.createOpen}
        onOpenChange={(open) => {
          if (open) {
            actions.setCreateOpen(true);
          } else {
            actions.closeCreateDialog();
          }
        }}
        creating={actions.creating}
        createError={actions.createError}
        description={actions.description}
        onDescriptionChange={actions.setDescription}
        scope={actions.scope}
        onScopeChange={actions.setScope}
        ownerId={actions.ownerId}
        onOwnerIdChange={actions.setOwnerId}
        trimmedOwner={actions.trimmedOwner}
        parsedOwnerId={actions.parsedOwnerId}
        ownerValid={actions.ownerValid}
        effectiveOwnerId={actions.effectiveOwnerId}
        onCancel={actions.closeCreateDialog}
        onConfirm={actions.handleCreate}
      />
    </div>
  );
}
