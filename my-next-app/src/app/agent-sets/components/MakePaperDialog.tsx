"use client";

import { useState } from "react";
import { FileCheck2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPaperFromSet } from "../lib/api";
import {
  DEFAULT_DURATION_MINUTES,
  buildPaperRequest,
  defaultPaperTitle,
} from "../lib/paper-request";
import type { AgentSetSummary } from "../lib/types";

interface MakePaperDialogProps {
  set: AgentSetSummary;
  /** 这批里还能成卷的题数（不含已做、已反馈） */
  availableCount: number;
  onClose: () => void;
  onCreated: (paperId: number) => void;
}

/**
 * 一键成卷：把题集里还能做的题拼成一张试卷（契约 §4.2 `POST /agent-sets/{id}/paper`）。
 *
 * 与服务端约定「至少一题」，所以题集空了就把按钮禁用掉，不把必然失败的请求发出去。
 * 标题与是否限时是用户唯一能改的两项；抽题、判分、成绩单全部复用试卷那一套。
 */
export function MakePaperDialog({
  set,
  availableCount,
  onClose,
  onCreated,
}: MakePaperDialogProps) {
  const [title, setTitle] = useState(() => defaultPaperTitle(set));
  const [timed, setTimed] = useState(false);
  const [duration, setDuration] = useState(String(DEFAULT_DURATION_MINUTES));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const paperId = await createPaperFromSet(
        set.id,
        buildPaperRequest({
          setTitle: set.title,
          title,
          timed,
          durationMinutes: Number(duration),
        }),
      );
      onCreated(paperId);
    } catch (caught) {
      // 失败必须留在弹窗里可见：关掉弹窗再 toast，用户会以为"已经生成过了"
      console.error("[agent-sets] 成卷失败", {
        setId: set.id,
        err: caught,
      });
      setError(
        caught instanceof Error ? caught.message : "成卷失败，请稍后重试",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-w-md gap-0 rounded-2xl border-border bg-card p-0 shadow-xl sm:rounded-2xl"
        hideClose={busy}
      >
        <div className="border-b border-border/70 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <FileCheck2 className="h-4 w-4 text-primary" aria-hidden />
            把这批题做成一张试卷
          </DialogTitle>
          <DialogDescription className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            会用还没做的 {availableCount} 道题组卷。生成后照常作答、自动判分，成绩
            记在这份试卷下。
          </DialogDescription>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="space-y-2">
            <Label htmlFor="paper-title" className="text-sm font-semibold">
              试卷标题
            </Label>
            <Input
              id="paper-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={80}
              placeholder="给这份试卷起个名字"
            />
          </div>

          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
              <Checkbox
                checked={timed}
                onCheckedChange={(checked) => setTimed(checked === true)}
              />
              限时作答
            </label>
            {timed ? (
              <div className="flex items-center gap-2 pl-6">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={5}
                  max={180}
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                  aria-label="限时分钟数"
                  className="h-9 w-24"
                />
                <span className="text-sm text-muted-foreground">
                  分钟（5~180）
                </span>
              </div>
            ) : (
              <p className="pl-6 text-xs text-muted-foreground">
                不限时：按自己的节奏做完即可。
              </p>
            )}
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 border-t border-border/70 px-5 py-3 sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            onClick={() => void handleCreate()}
            disabled={busy || availableCount === 0}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {busy ? "正在生成…" : "生成试卷"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
