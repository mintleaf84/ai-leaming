"use client";

import { useState } from "react";
import {
  createApiKeyAction,
  deleteApiKeyAction,
  toggleApiKeyAction,
} from "@/server/actions/api-keys";
import type { ApiKeyScope } from "@/types/api-key";
import { toast } from "sonner";
import type { UseApiKeysDataResult } from "./use-api-keys-data";

/** 新建成功后要展示一次的明文密钥快照（连创建时的作用域与归属一起记住） */
export interface CreatedKey {
  key: string;
  scope: ApiKeyScope;
  userId: number | null;
}

/**
 * API Key 管理页的动作层：创建对话框状态机 + 启用/停用 + 删除 + 剪贴板/可见性。
 *
 * 一次性明文（`createdKey`）只在这里落地，来源只有 create 的返回值：
 * 列表接口只返回打码后的 key_string，所以刷新列表不会、也不该把明文再变出来。
 * 清空明文只有两条路径——关闭提示条，或重新打开创建对话框。
 */
export function useApiKeysActions(data: UseApiKeysDataResult) {
  const { reload } = data;

  // 创建对话框
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<ApiKeyScope>("read");
  // 绑定用户：留空 = 全局 key
  const [ownerId, setOwnerId] = useState("");

  // 新建完成后的密钥（只显示一次）
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);

  // 每行密钥的可见性 / 复制态
  const [visibleKeys, setVisibleKeys] = useState<Set<number>>(new Set());
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiedCurlId, setCopiedCurlId] = useState<number | null>(null);

  const trimmedOwner = ownerId.trim();
  const parsedOwnerId = /^\d+$/.test(trimmedOwner)
    ? Number(trimmedOwner)
    : null;
  // 空 = 全局；填了就必须是正整数
  const ownerValid = trimmedOwner === "" || (parsedOwnerId ?? 0) > 0;
  const effectiveOwnerId =
    scope === "admin" ? null : ownerValid ? parsedOwnerId : null;

  const resetForm = () => {
    setDescription("");
    setScope("read");
    setOwnerId("");
    setCreateError(null);
  };

  const openCreateDialog = () => {
    setCreatedKey(null);
    setCreateError(null);
    setCreateOpen(true);
  };

  const closeCreateDialog = () => {
    setCreateOpen(false);
    resetForm();
  };

  const handleCreate = async () => {
    if (creating || !description.trim() || !ownerValid) return;
    setCreating(true);
    setCreateError(null);
    const result = await createApiKeyAction({
      description: description.trim(),
      scopes: scope,
      userId: effectiveOwnerId,
    });
    setCreating(false);
    if (result.serverError || !result.data?.success || !result.data.key) {
      // 失败留在对话框里，不把已有列表换成错误态
      setCreateError(result.serverError ?? "密钥生成失败，请稍后重试");
      return;
    }
    setCreatedKey({
      key: result.data.key,
      scope,
      userId: effectiveOwnerId,
    });
    // 列表可能很长：对话框关掉后用户不一定看得到页首的密钥条，再给一次提示
    toast.success("密钥已生成，只显示这一次，请立即复制");
    setCreateOpen(false);
    resetForm();
    await reload();
  };

  const handleToggle = async (id: number, currentState: number) => {
    await toggleApiKeyAction({ id, isActive: !currentState });
    await reload();
  };

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "确定要永久删除这个 API Key 吗？删除后使用此密钥的外部服务将立即失效。",
      )
    )
      return;
    await deleteApiKeyAction(id);
    await reload();
  };

  const handleCopy = async (key: string, id: number) => {
    await navigator.clipboard.writeText(key);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyCurl = async (key: string, id: number) => {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const curlCommand = `curl -H "Authorization: Bearer ${key}" "${baseUrl}/api/external/questions?page=1&limit=5"`;
    await navigator.clipboard.writeText(curlCommand);
    setCopiedCurlId(id);
    setTimeout(() => setCopiedCurlId(null), 2000);
  };

  /** 切换某一行的密钥明文可见性（只影响该行，不改数据） */
  const toggleVisibility = (id: number) => {
    const next = new Set(visibleKeys);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setVisibleKeys(next);
  };

  return {
    // 创建对话框
    createOpen,
    setCreateOpen,
    creating,
    createError,
    description,
    setDescription,
    scope,
    setScope,
    ownerId,
    setOwnerId,
    trimmedOwner,
    parsedOwnerId,
    ownerValid,
    effectiveOwnerId,
    createdKey,
    clearCreatedKey: () => setCreatedKey(null),
    openCreateDialog,
    closeCreateDialog,
    handleCreate,
    // 行操作
    handleToggle,
    handleDelete,
    handleCopy,
    handleCopyCurl,
    toggleVisibility,
    // 行视图态
    visibleKeys,
    copiedId,
    copiedCurlId,
  };
}

export type UseApiKeysActionsResult = ReturnType<typeof useApiKeysActions>;
