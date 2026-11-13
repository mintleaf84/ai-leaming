import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 填空卡的题干：把 `【　】` 占位符渲染成带序号的空位。
 *
 * 为什么要拆开渲染：一张填空卡可能有 3 个空，作答是一个 Textarea，用户必须知道
 * 「现在填的是第几个空」。序号直接压在题干空位上，输入框的顺序就能对得上；
 * 重测模式下只给本次呈现的空位编号（`presented` 是卡内下标，顺序即输入顺序），
 * 其余空位显示 `·` 并压暗，避免用户去填一个不会被判分的空。
 */
const BLANK_PATTERN = /【[^】]*】/;

export function ClozePrompt({
  prompt,
  presented,
}: {
  prompt: string;
  /** 本次呈现的空位（卡内下标，数组顺序 = 输入顺序） */
  presented: number[];
}) {
  const parts = prompt.split(/(【[^】]*】)/g);
  const nodes: ReactNode[] = [];
  let blankIndex = -1;

  parts.forEach((part, partIndex) => {
    if (!BLANK_PATTERN.test(part)) {
      nodes.push(<span key={`text-${partIndex}`}>{part}</span>);
      return;
    }

    blankIndex += 1;
    const order = presented.indexOf(blankIndex);
    const active = order >= 0;
    nodes.push(
      <span
        key={`blank-${partIndex}`}
        aria-label={active ? `第 ${order + 1} 空` : "本次不填"}
        className={cn(
          "mx-0.5 inline-flex h-7 min-w-7 items-center justify-center rounded border px-1 align-baseline text-sm font-medium tabular-nums",
          active
            ? "border-primary/40 bg-primary/10 text-foreground"
            : "border-border bg-muted text-muted-foreground",
        )}
      >
        {active ? order + 1 : "·"}
      </span>,
    );
  });

  return (
    <p className="whitespace-pre-wrap text-lg leading-relaxed text-foreground md:text-xl md:leading-relaxed">
      {nodes}
    </p>
  );
}
