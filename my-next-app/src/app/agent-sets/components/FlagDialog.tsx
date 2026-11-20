"use client";

import { useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const PRESETS = [
  "题干或选项有误",
  "答案对不上",
  "和别的题重复",
  "超出考试范围",
];

interface FlagDialogProps {
  /** 第几题，只用于文案 */
  position: number;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (reason: string | undefined) => void;
}

/**
 * 「这题有问题」的二次确认。
 *
 * 原因**可选**（契约 §4.2 的 `{reason?}`）：用户只想赶紧跳过这道题时，不该被
 * 一个必填输入框拦住；但原因能显著提高 Agent 修题的成功率，所以给了四个常见
 * 选项 + 自由补充。
 *
 * 组件按挂载即打开使用（父组件条件渲染），因此不需要在 effect 里重置状态。
 */
export function FlagDialog({
  position,
  busy = false,
  error,
  onCancel,
  onConfirm,
}: FlagDialogProps) {
  const [preset, setPreset] = useState<string | null>(null);
  const [detail, setDetail] = useState("");

  const reason =
    [preset, detail.trim()].filter(Boolean).join("；") || undefined;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <DialogContent
        className="max-w-md gap-0 rounded-2xl border-border bg-card p-0 shadow-xl sm:rounded-2xl"
        hideClose={busy}
      >
        <div className="border-b border-border/70 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Flag className="h-4 w-4" aria-hidden />
            </span>
            第 {position} 题有问题？
          </DialogTitle>
          <DialogDescription className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            反馈后这道题会从本批移走，也不会算进你的成绩。Agent 会据此修正，之后
            重新推一批新的题。
          </DialogDescription>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground">
              哪里有问题（可不选）
            </Label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((item) => {
                const active = preset === item;
                return (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPreset(active ? null : item)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      active
                        ? "border-destructive/50 bg-destructive/10 text-destructive"
                        : "border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                    )}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="flag-reason-detail"
              className="text-xs font-semibold text-muted-foreground"
            >
              补充说明（可选）
            </Label>
            <Textarea
              id="flag-reason-detail"
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              maxLength={300}
              rows={3}
              placeholder="例如：选项 C 的表述和教材不一致"
              className="resize-none text-sm"
            />
          </div>

          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 border-t border-border/70 px-5 py-3 sm:justify-end">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            先不做
          </Button>
          <Button
            onClick={() => onConfirm(reason)}
            disabled={busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {busy ? "正在反馈…" : "反馈给 Agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
