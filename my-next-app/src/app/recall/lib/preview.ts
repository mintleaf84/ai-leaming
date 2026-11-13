/**
 * 作答屏 → 判分屏的**预判**（本地、纯函数、与服务端同一套规则）。
 *
 * 为什么预判必须在客户端跑：判分屏要在「确认结果」**之前**显示绿/黄，用户改判要
 * 作为 `overrides` 随这唯一一次提交一起落库（规格 §1.4：每次作答只写一条日志）。
 * 如果先提交一次拿结果、改判后再提交一次，同一张卡会写两条日志、FSRS 也会被
 * 推进两次——那属于静默的数据损坏，比"多点一次"严重得多。
 *
 * 所以这里直接复用 `@/lib/recall/matcher`（纯函数，无 IO，可进客户端 bundle），
 * 保证与服务端 `services/recall.ts` 的判分口径逐字一致。唯一会漂移的情形是
 * `getRecallCardAction` 没带 `keywords`：那时预览拿整条文本当关键词，判分**偏严**
 * （宁可漏判），用户一次点击即可改判，且这个偏差本身会被 `userOverrides` 记录下来。
 */

import {
  gradeCloze,
  gradeList,
  splitClozeSegments,
} from "@/lib/recall/matcher";
import type { RecallCardView, RecallVerdict } from "./actions";

export interface RecallPreview {
  /** 本次呈现的**卡内**条目下标（与 pendingItems 同一坐标系） */
  presented: number[];
  /** 与 presented 一一对应 */
  verdicts: RecallVerdict[];
}

/** 本次实际呈现哪些条目：重测只呈现上次错的，下标越界的（脏 pendingItems）剔除 */
function resolvePresented(card: RecallCardView): number[] {
  const total =
    card.kind === "list"
      ? (card.items ?? []).length
      : (card.blanks ?? []).length;
  const all = Array.from({ length: total }, (_, index) => index);
  if (card.mode !== "retest" || !card.pendingItems) return all;

  const valid = card.pendingItems.filter(
    (index) => Number.isInteger(index) && index >= 0 && index < total,
  );
  return valid.length > 0 ? valid : all;
}

/** 作答屏/判分屏共用：这次要呈现（和判分）哪些卡内下标 */
export function presentedIndexes(card: RecallCardView): number[] {
  return resolvePresented(card);
}

export function previewVerdicts(
  card: RecallCardView,
  typed: string,
): RecallPreview {
  if (card.kind === "list") {
    const items = (card.items ?? []).map((item) => ({
      text: item.text,
      // 关键词缺失时退化为整条文本（与 matcher 的退化分支同一思路）
      keywords:
        item.keywords && item.keywords.length > 0 ? item.keywords : [item.text],
    }));
    const presented = resolvePresented(card);
    const { verdicts } = gradeList(
      {
        cardId: String(card.cardId),
        kind: "list",
        prompt: card.prompt,
        items,
        verbatim: false,
      },
      typed,
      { itemIndexes: presented },
    );
    return { presented, verdicts };
  }

  const blanks = card.blanks ?? [];
  const presented = resolvePresented(card);
  const subset = presented
    .map((index) => blanks[index])
    .filter((blank): blank is { answers: string[] } => Boolean(blank));
  const { verdicts } = gradeCloze(
    {
      cardId: String(card.cardId),
      kind: "cloze",
      prompt: card.prompt,
      blanks: subset,
    },
    typed,
  );
  return { presented, verdicts };
}

/** 用户改判 → 服务端要求的 `overrides`（只提交真正变了的条目） */
export function buildOverrides(
  presented: number[],
  algoVerdicts: RecallVerdict[],
  finalVerdicts: RecallVerdict[],
): { index: number; to: RecallVerdict }[] {
  const overrides: { index: number; to: RecallVerdict }[] = [];
  presented.forEach((cardIndex, position) => {
    const algo = algoVerdicts[position];
    const final = finalVerdicts[position];
    if (final && algo && final !== algo) {
      overrides.push({ index: cardIndex, to: final });
    }
  });
  return overrides;
}

/** 填空卡：把作答按空切开，用于判分屏逐空对照（与判分用的切法同一个函数） */
export function splitClozeAnswers(typed: string, count: number): string[] {
  if (count <= 0) return [];
  const segments = splitClozeSegments(typed, count);
  return Array.from({ length: count }, (_, index) => segments[index] ?? "");
}
