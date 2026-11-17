"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, ShieldAlert } from "lucide-react";
import type { ApiKeyScope } from "@/types/api-key";
import { ScopeOption } from "./scope-option";
import { SCOPE_META, SCOPE_ORDER } from "./scope-meta";
import { isImeComposing } from "@/lib/utils/ime";

interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creating: boolean;
  createError: string | null;
  description: string;
  onDescriptionChange: (value: string) => void;
  scope: ApiKeyScope;
  onScopeChange: (scope: ApiKeyScope) => void;
  ownerId: string;
  onOwnerIdChange: (value: string) => void;
  /** 绑定用户输入的派生值（trim 后 / 解析后 / 是否合法 / 实际提交的归属） */
  trimmedOwner: string;
  parsedOwnerId: number | null;
  ownerValid: boolean;
  effectiveOwnerId: number | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * 生成新密钥对话框：用途说明 + 三档作用域单选卡 + 可选的绑定用户。
 * 全权（admin）固定为全局 key —— 后端也这么约束，前端在这里先拦住。
 */
export function CreateApiKeyDialog({
  open,
  onOpenChange,
  creating,
  createError,
  description,
  onDescriptionChange,
  scope,
  onScopeChange,
  ownerId,
  onOwnerIdChange,
  trimmedOwner,
  parsedOwnerId,
  ownerValid,
  effectiveOwnerId,
  onCancel,
  onConfirm,
}: CreateApiKeyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>生成新密钥</DialogTitle>
          <DialogDescription>
            密钥创建后只显示一次。作用域决定它能调用哪些接口，归属决定它以谁的身份执行。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="api-key-description">用途说明</Label>
            <Input
              id="api-key-description"
              placeholder="例如：Coze 智能体接入"
              value={description}
              maxLength={60}
              onChange={(e) => onDescriptionChange(e.target.value)}
              onKeyDown={(e) => {
                // 组合态 Enter 是确认候选词，不能当"确认创建 API Key"
                if (isImeComposing(e)) return;
                if (e.key === "Enter") onConfirm();
              }}
            />
            <p className="text-xs text-muted-foreground">
              写清给谁用、做什么，以后才知道哪把 key 该停用。
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">作用域</legend>
            <div className="space-y-2">
              {SCOPE_ORDER.map((item) => (
                <ScopeOption
                  key={item}
                  scope={item}
                  checked={scope === item}
                  onSelect={onScopeChange}
                />
              ))}
            </div>

            {scope === "admin" && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <ShieldAlert
                  className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                  aria-hidden
                />
                <p className="text-xs leading-5 text-foreground">
                  全权 key 能改题、删数据、改用户，
                  <span className="font-medium">只给自己用</span>
                  ，不要贴进任何第三方平台的配置里。泄漏一把，等于交出后台密码。
                </p>
              </div>
            )}
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="api-key-owner">绑定用户（可选）</Label>
            <Input
              id="api-key-owner"
              inputMode="numeric"
              placeholder="留空 = 全局 key（站长身份）"
              value={scope === "admin" ? "" : ownerId}
              disabled={scope === "admin"}
              onChange={(e) => onOwnerIdChange(e.target.value)}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              {scope === "admin"
                ? "全权 key 不能绑定到普通用户，已固定为全局 key。"
                : trimmedOwner === ""
                  ? "全局 key 以站长身份执行请求，不要分发给他人。"
                  : ownerValid
                    ? `该 key 的读写都记在用户 #${parsedOwnerId} 名下，用它只能看到这个用户自己的数据。`
                    : "用户 ID 只能是正整数，可到「用户管理」里查。"}
            </p>
          </div>

          <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            将创建：
            <span className="font-medium text-foreground">
              {scope} · {SCOPE_META[scope].label}
            </span>
            <span aria-hidden> · </span>
            <span className="font-medium text-foreground">
              {effectiveOwnerId === null
                ? "全局 key"
                : `用户 #${effectiveOwnerId} 的专属 key`}
            </span>
          </div>

          {createError && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-5 text-foreground">
              {createError}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="h-11 sm:h-10" onClick={onCancel}>
            取消
          </Button>
          <Button
            className="h-11 sm:h-10"
            onClick={onConfirm}
            disabled={creating || !description.trim() || !ownerValid}
          >
            {creating && <Loader2 className="animate-spin" aria-hidden />}
            生成密钥
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
