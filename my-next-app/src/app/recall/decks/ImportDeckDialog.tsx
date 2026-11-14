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
import { safeParseJson } from "@/lib/utils/json";

import {
  actionErrorMessage,
  importRecallDeck,
  type RecallImportView,
} from "../lib/actions";

/** 冲突清单在界面上最多展示这么多条，其余只报数量 */
const MAX_CONFLICT_ROWS = 10;

/**
 * 完成态的卡组名：从**刚导入的那份文件**里读 `title`。
 *
 * 为什么不在返回值里加 `deckTitle`：那要动 `importDeck` 的契约，而文件的 title
 * 本来就由服务层写进 `recall_decks.title`（改名的导入也会同步更新），两者同源。
 * 读不到（理论上不可能：JSON 已通过服务端校验）就退回 `deckKey`——虽然不好看，
 * 至少能让用户确认"导的是哪个卡组"，不会是空标题。
 *
 * 解析走 `safeParseJson`：它的契约就是"解析失败返回默认值"，不需要在这里
 * 再写一个 catch（catch 门禁零容忍，多一个就是一次审计失败）。
 */
function readDeckTitle(json: string, deckKey: string): string {
  const parsed = safeParseJson<{ title?: unknown } | null>(json, null);
  const title =
    parsed && typeof parsed === "object"
      ? (parsed as { title?: unknown }).title
      : undefined;
  return typeof title === "string" && title.trim() ? title.trim() : deckKey;
}

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
  /** 完成态标题用的卡组名（导入成功时从文件里取，见 readDeckTitle） */
  const [deckTitle, setDeckTitle] = useState("");
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
      setDeckTitle(readDeckTitle(json, imported.deckKey));
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
      setDeckTitle("");
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
    setDeckTitle("");
    setPendingConflicts([]);
  };

  const step =
    pendingConflicts.length > 0 ? "conflict" : result ? "done" : "input";

  /**
   * 完成态的数字账：`keep` 的冲突卡**既不算新增、也不算更新、也不算跳过**
   * （服务层只戳了 updated_at，没动内容）。不单独列出来时
   * 「新增 + 更新 + 跳过」会永远小于文件卡数 —— 导入 104 张、1 张冲突并保留，
   * 用户看到的就是 0 + 0 + 103，于是会问「第 104 张去哪了」。
   */
  const keptCards = result
    ? result.conflicts.filter((conflict) => conflict.action === "keep").length
    : 0;
  /** 文件卡数 = 各项之和（created + updated + skipped + kept 恰好覆盖每一张） */
  const fileCards = result
    ? result.createdCards +
      result.updatedCards +
      result.skippedCards +
      keptCards
    : 0;

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
              <p className="text-sm font-medium text-foreground">
                导入完成{deckTitle ? ` · ${deckTitle}` : ""}
              </p>
              <p
                className="mt-1 text-xs text-muted-foreground tabular-nums"
                data-testid="import-summary-counts"
              >
                {[
                  `新增 ${result.createdCards} 张`,
                  `更新 ${result.updatedCards} 张`,
                  `跳过 ${result.skippedCards} 张`,
                  // 保留 0 张时不显示：多一个 0 只会干扰「对账」
                  ...(keptCards > 0 ? [`保留 ${keptCards} 张`] : []),
                ].join(" · ")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                共 {fileCards} 张
                {keptCards > 0
                  ? `：其中 ${keptCards} 张按你的选择保留了库里的内容，复习进度没动。`
                  : "。"}
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
