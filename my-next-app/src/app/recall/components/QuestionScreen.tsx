import { Archive } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import type { RecallCardView } from "../lib/actions";
import { ClozePrompt } from "./ClozePrompt";

/**
 * 作答屏：题干 + 输入框 + 归档入口。
 *
 * 组装卡（`kind === "list"`）直接铺 `prompt`；填空卡把空位渲染成带序号的占位
 * （`ClozePrompt`），序号顺序 = 输入顺序（重测时只给本次呈现的空位编号）。
 */
export function QuestionScreen({
  card,
  typed,
  onTypedChange,
  clozeIndexes,
  retestCount,
  busy,
  onArchive,
}: {
  card: RecallCardView;
  typed: string;
  onTypedChange: (value: string) => void;
  /** 本次呈现的填空下标（卡内下标，数组顺序 = 输入顺序） */
  clozeIndexes: number[];
  /** 重测模式下本次要重测的条目数；首答为 0（不显示提示行） */
  retestCount: number;
  /** 归档/取卡进行中：只禁用作答相关的按钮 */
  busy: boolean;
  onArchive: () => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {card.deckTitle}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 text-muted-foreground"
          onClick={onArchive}
          disabled={busy}
          aria-label="归档这张卡"
          title="归档这张卡"
        >
          <Archive className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      {retestCount > 0 && (
        <p className="mb-2 text-xs text-muted-foreground">
          只重测上次没想起来的 {retestCount} 条
        </p>
      )}

      {card.kind === "cloze" ? (
        <ClozePrompt prompt={card.prompt} presented={clozeIndexes} />
      ) : (
        <p className="whitespace-pre-wrap text-lg leading-relaxed text-foreground md:text-xl md:leading-relaxed">
          {card.prompt}
        </p>
      )}

      <Textarea
        value={typed}
        onChange={(event) => onTypedChange(event.target.value)}
        autoFocus={false}
        rows={6}
        placeholder={
          card.kind === "cloze"
            ? clozeIndexes.length > 1
              ? "按空位序号一行写一个空，只写关键词也可以"
              : "写你记得的答案，只写关键词也可以"
            : "写下你记得的要点，关键词也可以"
        }
        className="mt-4 min-h-36 resize-y text-base leading-relaxed md:text-base"
      />
    </section>
  );
}
