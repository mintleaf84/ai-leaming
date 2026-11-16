"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  ShieldCheck,
  ShieldOff,
  Terminal,
  Trash2,
} from "lucide-react";
import type { ApiKeyView } from "@/types/api-key";
import { cn } from "@/lib/utils/utils";
import { ScopeBadge, OwnerBadge } from "./scope-badges";
import { formatDate, formatDateTime, maskKey } from "./format";

interface ApiKeysTableProps {
  keys: ApiKeyView[];
  /** 当前展开明文的行 id 集合 */
  visibleKeys: Set<number>;
  /** 刚复制过的行 id（密钥 / cURL 各自一条，2 秒后清空） */
  copiedId: number | null;
  copiedCurlId: number | null;
  onToggleVisibility: (id: number) => void;
  onCopy: (key: string, id: number) => void;
  onCopyCurl: (key: string, id: number) => void;
  onToggleActive: (id: number, currentState: number) => void;
  onDelete: (id: number) => void;
}

/**
 * 桌面（lg 起）五列密钥表格：密钥 / 作用域 / 归属 / 最近使用 / 操作。
 * 停用的行整体压暗但不隐藏——停用状态本身就是要被看见的信息。
 */
export function ApiKeysTable({
  keys,
  visibleKeys,
  copiedId,
  copiedCurlId,
  onToggleVisibility,
  onCopy,
  onCopyCurl,
  onToggleActive,
  onDelete,
}: ApiKeysTableProps) {
  return (
    <div
      className="hidden rounded-lg border lg:block"
      data-testid="admin-api-keys-table"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-0">密钥</TableHead>
            <TableHead className="w-28">作用域</TableHead>
            <TableHead className="w-24">归属</TableHead>
            <TableHead className="w-32">最近使用</TableHead>
            <TableHead className="w-24 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.map((apiKey) => {
            const isVisible = visibleKeys.has(apiKey.id);
            return (
              <TableRow
                key={apiKey.id}
                className={cn(!apiKey.is_active && "opacity-60")}
              >
                <TableCell className="max-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">
                      {apiKey.description || "未命名密钥"}
                    </span>
                    {apiKey.is_active ? (
                      <Badge variant="success" className="shrink-0">
                        激活
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="shrink-0 text-muted-foreground"
                      >
                        已停用
                      </Badge>
                    )}
                  </div>

                  <div className="mt-1 flex min-w-0 items-center gap-1">
                    <code className="truncate font-mono text-xs text-muted-foreground">
                      {isVisible
                        ? apiKey.key_string
                        : maskKey(apiKey.key_string)}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      aria-label={isVisible ? "隐藏密钥" : "显示密钥"}
                      onClick={() => onToggleVisibility(apiKey.id)}
                    >
                      {isVisible ? <EyeOff /> : <Eye />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      aria-label="复制密钥"
                      onClick={() => onCopy(apiKey.key_string, apiKey.id)}
                    >
                      {copiedId === apiKey.id ? (
                        <Check className="text-success" />
                      ) : (
                        <Copy />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      aria-label="复制 cURL 测试命令"
                      onClick={() => onCopyCurl(apiKey.key_string, apiKey.id)}
                    >
                      {copiedCurlId === apiKey.id ? (
                        <Check className="text-success" />
                      ) : (
                        <Terminal />
                      )}
                    </Button>
                  </div>

                  <p className="mt-1 text-xs text-muted-foreground">
                    创建于 {formatDate(apiKey.created_at)}
                  </p>
                </TableCell>

                <TableCell>
                  <ScopeBadge scope={apiKey.scopes} />
                </TableCell>
                <TableCell>
                  <OwnerBadge userId={apiKey.user_id} />
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {formatDateTime(apiKey.last_used_at)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={
                        apiKey.is_active ? "停用该密钥" : "启用该密钥"
                      }
                      title={apiKey.is_active ? "停用" : "启用"}
                      onClick={() =>
                        onToggleActive(apiKey.id, apiKey.is_active)
                      }
                    >
                      {apiKey.is_active ? (
                        <ShieldCheck className="text-success" />
                      ) : (
                        <ShieldOff className="text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="删除该密钥"
                      title="删除"
                      className="text-destructive hover:text-destructive"
                      onClick={() => onDelete(apiKey.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
