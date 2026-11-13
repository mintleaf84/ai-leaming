"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import {
  actionErrorMessage,
  importRecallDeck,
  type RecallImportView,
} from "../lib/actions";

/** 冲突清单在界面上最多展示这么多条，其余只报数量 */
const MAX_CONFLICT_ROWS = 10;

/**
 * 导入卡组文件（规格 §1.1：导入幂等，内容冲突由人来定）。
 *
 * 冲突不自动决定：`cardId` 相同但题干/答案不同，说明两边都改过。默认保留库里的
 * （`onConflict` 缺省 = keep），只有用户明确点「采用新文件」才用 `accept` 重试。
 * 无论选哪边，`recall_card_states` 都不动——复习进度不属于文件内容。
 */
export function ImportDeckDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (deckKey: string) => void;
}) {
  const [json, setJson] = useState("");
  const [result, setResult] = useState<RecallImportView | null>(null);
  const [pendingConflicts, setPendingConflicts] = useState<
    RecallImportView["conflicts"]
  >([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // 在途请求的序号：每次发起导入 +1；关闭对话框也会 +1，让在途响应作废。
  // 只靠 busy 挡不住"请求已发出 → 用户关掉 → 又打开 → 旧响应回来覆盖新结果"。
  const requestIdRef = useRef(0);

  const runImport = async (onConflict?: "keep" | "accept") => {
    if (!json.trim()) {
      toast.error("先选一个 .json 文件，或把卡组内容粘贴进来");
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setBusy(true);
    try {
      const imported = await importRecallDeck(json, onConflict);
      // 旧请求的结果一律丢弃：它可能属于上一份 JSON，或用户已经关掉了对话框
      if (requestId !== requestIdRef.current) return;
      setResult(imported);
      // accept 之后再回传的 conflicts 只是回执，不需要再问一次
      setPendingConflicts(onConflict === "accept" ? [] : imported.conflicts);
      onImported(imported.deckKey);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      // 导入失败（JSON 不合法 / schema 不过）：对话框与已粘贴的内容都保留
      console.error("[recall] 导入卡组失败", error);
      toast.error(`导入失败：${actionErrorMessage(error)}`);
      return;
    } finally {
      // 只有仍是"当前请求"才能清 busy：否则旧请求的 finally 会把新请求的忙碌态清掉
      if (requestId === requestIdRef.current) setBusy(false);
    }
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 选同一个文件两次也要能触发 change
    event.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      setJson(text);
      setResult(null);
      setPendingConflicts([]);
      // 换了内容：上一份内容的在途响应没有意义了
      requestIdRef.current += 1;
    } catch (error) {
      console.error("[recall] 读取卡组文件失败", error);
      toast.error(`读不了这个文件：${actionErrorMessage(error)}`);
      return;
    }
  };

  const close = () => {
    // 提交中不允许关闭：请求已经发出，关掉后结果无处安放，用户会以为没生效
    if (busy) return;
    // 让在途请求作废（正常路径下 busy 已经挡住，这里是留给竞态的兜底）
    requestIdRef.current += 1;
    onOpenChange(false);
    setJson("");
    setResult(null);
    setPendingConflicts([]);
  };

  const step =
    pendingConflicts.length > 0 ? "conflict" : result ? "done" : "input";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>导入卡组</DialogTitle>
          <DialogDescription>
            同一个卡组重复导入是安全的：已有的复习进度不会被重置。
          </DialogDescription>
        </DialogHeader>

        {step === "input" && (
          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              <FileUp className="mr-2 h-4 w-4" aria-hidden />
              选择 .json 文件
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFile}
            />
            <div>
              <p className="mb-1 text-xs text-muted-foreground">
                或者直接粘贴：
              </p>
              <Textarea
                value={json}
                onChange={(event) => setJson(event.target.value)}
                rows={8}
                spellCheck={false}
                placeholder={
                  '{\n  "schema": 1,\n  "deckId": "my-deck",\n  "title": "我的卡组",\n  "cards": [ ... ]\n}'
                }
                className="font-mono text-xs leading-5"
              />
            </div>
          </div>
        )}

        {step === "conflict" && (
          <div className="space-y-3">
            <p className="text-sm leading-6 text-foreground">
              有 {pendingConflicts.length}{" "}
              张卡和库里的内容不一样。要保留哪一份？
              <span className="mt-1 block text-xs text-muted-foreground">
                两种选择都不会动复习进度。
              </span>
            </p>
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/40 p-3">
              {pendingConflicts.slice(0, MAX_CONFLICT_ROWS).map((conflict) => (
                <li
                  key={conflict.cardId}
                  className="truncate font-mono text-xs text-muted-foreground"
                >
                  {conflict.cardId}
                </li>
              ))}
              {pendingConflicts.length > MAX_CONFLICT_ROWS && (
                <li className="pt-1 text-xs text-muted-foreground tabular-nums">
                  另有 {pendingConflicts.length - MAX_CONFLICT_ROWS} 张
                </li>
              )}
            </ul>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                className="h-11 flex-1"
                disabled={busy}
                onClick={() => setPendingConflicts([])}
              >
                保留我的
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1"
                disabled={busy}
                onClick={() => void runImport("accept")}
              >
                采用新文件
              </Button>
            </div>
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-3">
            <div className="rounded-lg border border-success/30 bg-success-muted px-4 py-3">
              <p className="text-sm font-medium text-foreground">导入完成</p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                新增 {result.createdCards} 张 · 更新 {result.updatedCards} 张 ·
                跳过 {result.skippedCards} 张
              </p>
            </div>
            {result.missingInFile.length > 0 && (
              <p className="text-xs text-muted-foreground">
                文件里没有这 {result.missingInFile.length} 张卡，已保留在库中。
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "input" && (
            <>
              <Button
                type="button"
                variant="ghost"
                className="h-11"
                onClick={close}
                disabled={busy}
              >
                取消
              </Button>
              <Button
                type="button"
                className="h-11"
                onClick={() => void runImport()}
                disabled={busy}
              >
                {busy ? "导入中…" : "导入"}
              </Button>
            </>
          )}
          {step === "done" && (
            <Button type="button" className="h-11" onClick={close}>
              完成
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
