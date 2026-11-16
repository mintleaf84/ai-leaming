"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Copy, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import type { ApiKeyView } from "@/types/api-key";
import { cn } from "@/lib/utils/utils";
import { ScopeBadge, OwnerBadge } from "./scope-badges";
import { formatDate, formatDateTime, maskKey } from "./format";

interface ApiKeysCardListProps {
  keys: ApiKeyView[];
  /** 刚复制过的行 id（2 秒后清空） */
  copiedId: number | null;
  onCopy: (key: string, id: number) => void;
  onToggleActive: (id: number, currentState: number) => void;
  onDelete: (id: number) => void;
}

/**
 * 手机 / 平板（< lg）卡片投影，字段 3 个（描述 / 作用域+归属 / 最近使用）。
 * 卡片里的密钥恒为打码态：小屏没有展开明文的入口，避免误触把整把 key 摊在屏幕上。
 */
export function ApiKeysCardList({
  keys,
  copiedId,
  onCopy,
  onToggleActive,
  onDelete,
}: ApiKeysCardListProps) {
  return (
    <ul className="space-y-2 lg:hidden" data-testid="admin-api-keys-cards">
      {keys.map((apiKey) => (
        <li
          key={apiKey.id}
          className={cn(
            "rounded-lg border bg-card p-4",
            !apiKey.is_active && "opacity-60",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-2 text-sm font-medium leading-6">
              {apiKey.description || "未命名密钥"}
            </p>
            <span className="shrink-0">
              {apiKey.is_active ? (
                <Badge variant="success">激活</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  已停用
                </Badge>
              )}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <ScopeBadge scope={apiKey.scopes} />
            <OwnerBadge userId={apiKey.user_id} />
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            最近使用 {formatDateTime(apiKey.last_used_at)} · 创建于{" "}
            {formatDate(apiKey.created_at)}
          </p>

          <div className="mt-2 flex items-center gap-1 rounded-lg bg-muted/60 px-3">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
              {maskKey(apiKey.key_string)}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label="复制密钥"
              onClick={() => onCopy(apiKey.key_string, apiKey.id)}
            >
              {copiedId === apiKey.id ? (
                <Check className="text-success" />
              ) : (
                <Copy />
              )}
            </Button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button
              variant="outline"
              className="h-11 flex-1"
              onClick={() => onToggleActive(apiKey.id, apiKey.is_active)}
            >
              {apiKey.is_active ? (
                <ShieldOff aria-hidden />
              ) : (
                <ShieldCheck aria-hidden />
              )}
              {apiKey.is_active ? "停用" : "启用"}
            </Button>
            <Button
              variant="ghost"
              className="h-11 w-11 shrink-0 text-destructive hover:text-destructive"
              aria-label="删除该密钥"
              onClick={() => onDelete(apiKey.id)}
            >
              <Trash2 />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
