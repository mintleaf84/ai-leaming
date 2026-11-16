"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Check, Copy, Terminal, X } from "lucide-react";
import type { CreatedKey } from "../hooks/use-api-keys-actions";
import { SCOPE_META } from "./scope-meta";

interface CreatedKeyPanelProps {
  /** 明文快照；null 时整块不渲染 */
  createdKey: CreatedKey | null;
  /** 明文已复制（原实现里这条用 id = -1 标记） */
  copied: boolean;
  /** cURL 命令已复制 */
  copiedCurl: boolean;
  onClose: () => void;
  onCopy: () => void;
  onCopyCurl: () => void;
}

/**
 * 新建成功的明文提示条：这是全站唯一能看到 key 明文的地方。
 * 只在 create 返回后出现一次，关闭或重新打开创建对话框即清空，刷新列表不会复原。
 */
export function CreatedKeyPanel({
  createdKey,
  copied,
  copiedCurl,
  onClose,
  onCopy,
  onCopyCurl,
}: CreatedKeyPanelProps) {
  if (!createdKey) return null;

  return (
    <section className="mb-4 rounded-lg border border-success/30 bg-success-muted p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <CheckCircle2
            className="mt-0.5 h-4 w-4 shrink-0 text-success"
            aria-hidden
          />
          <div>
            <p className="text-sm font-medium text-foreground">
              密钥已生成，只显示这一次
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{SCOPE_META[createdKey.scope].label}档</span>
              <span aria-hidden>·</span>
              <span>
                {createdKey.userId === null
                  ? "全局 key（站长身份，不要分发）"
                  : `绑定用户 #${createdKey.userId}`}
              </span>
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label="关闭提示"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs break-all">
          {createdKey.key}
        </code>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="h-11 flex-1 sm:h-10 sm:flex-none"
            onClick={onCopy}
          >
            {copied ? (
              <Check className="text-success" aria-hidden />
            ) : (
              <Copy aria-hidden />
            )}
            复制密钥
          </Button>
          <Button
            variant="outline"
            className="h-11 flex-1 sm:h-10 sm:flex-none"
            onClick={onCopyCurl}
          >
            {copiedCurl ? (
              <Check className="text-success" aria-hidden />
            ) : (
              <Terminal aria-hidden />
            )}
            cURL
          </Button>
        </div>
      </div>
    </section>
  );
}
