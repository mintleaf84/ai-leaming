/**
 * 判分匹配器（规格 §2.1）——**纯函数、无 IO、可单测**。
 *
 * 列举卡：条目判「已写」= `keywords` 任一命中（归一化后、再去全部空白做子串包含）。
 * 填空卡：每空与 `answers` 任一项归一化后**精确或双向包含**匹配。
 *
 * 三条刻意的边界：
 * - `keywords` 为空的条目退化用「条目文本本身」做包含判断——入库校验要求 ≥1 个关键词，
 *   但库里可能有手改过的历史行，判分不能因为一行脏数据就整卡判错；
 * - 归一化后变成空串的关键词（例如只有一个「、」）**跳过**，否则 `includes("")`
 *   恒真，一张卡会整体蒙对；
 * - 包含匹配要求输入长度 ≥2，避免「安」「全」这种单字蒙对（规格的误杀率目标
 *   靠"宁可漏判、可一键改判"来兜，不是放松到单字）。
 * - 关键词比对时两侧额外**去掉全部空白**：关键词是内容侧手写的、可能带空格
 *   （「倒 U 形」），用户不会照着空格打。`normalizeText` 的公共语义（保留单个空格）
 *   不变，只在这一条路径上多压一次。
 */
import { normalizeText } from "./normalize";
import type {
  RecallBlank,
  RecallClozeCard,
  RecallItemVerdict,
  RecallListItem,
  RecallListCard,
} from "./types";

/** 填空包含匹配的最短输入长度（小于 2 个字符时只认精确匹配） */
export const RECALL_CLOZE_MIN_CONTAIN_LENGTH = 2;

/** 列举卡判分结果 */
export interface RecallListGradeResult {
  /** 与 `itemIndexes` 一一对应：ok = 判已写，miss = 判未写 */
  verdicts: RecallItemVerdict[];
  /** 每个 verdict 对应的**卡内**条目下标（重测时要和 pendingItems 对得上） */
  itemIndexes: number[];
  /** 判为「已写」的条目数（写入日志，用于事后评估规则松紧） */
  keywordHits: number;
  /** 本次判分的条目总数（写入日志） */
  keywordTotal: number;
  /** 判为「已写」的条目在卡内的下标 */
  matchedItems: number[];
}

export interface GradeListOptions {
  /**
   * 只判这些卡内下标。重测时传 `pendingItems`，因为 UI 只呈现这些条目；
   * 不传 = 判全部条目。
   */
  itemIndexes?: number[];
}

/**
 * 关键词比对专用：去掉**全部**空白（不是折叠成一个）。
 *
 * 关键词是内容侧手写的，可能带空格（如「倒 U 形」）；用户不会照着空格打。
 * `normalizeText` 刻意保留单个空格（填空卡、哈希、去重都依赖这个语义），
 * 所以这里只在关键词匹配路径上再压一次，两侧都压，用户文本的空白语义不受影响。
 */
function compactForMatch(text: string): string {
  return text.replace(/\s+/g, "");
}

/** 单个列举条目是否被判「已写」 */
function isItemWritten(item: RecallListItem, normalizedTyped: string): boolean {
  if (!normalizedTyped) return false;

  const compactTyped = compactForMatch(normalizedTyped);
  const keywords = item.keywords
    .map((keyword) => compactForMatch(normalizeText(keyword)))
    // 空串关键词必须剔除："" 是任何字符串的子串
    .filter((keyword) => keyword.length > 0);

  if (keywords.length === 0) {
    // 退化：没有可用关键词时，用条目文本本身当唯一关键词
    const fallback = compactForMatch(normalizeText(item.text));
    return fallback.length > 0 && compactTyped.includes(fallback);
  }

  return keywords.some((keyword) => compactTyped.includes(keyword));
}

/** 列举卡判分 */
export function gradeList(
  card: RecallListCard,
  typed: string,
  options: GradeListOptions = {},
): RecallListGradeResult {
  const itemIndexes =
    options.itemIndexes && options.itemIndexes.length > 0
      ? options.itemIndexes
      : card.items.map((_, index) => index);

  const normalizedTyped = normalizeText(typed);
  const verdicts: RecallItemVerdict[] = [];
  const matchedItems: number[] = [];

  for (const index of itemIndexes) {
    const item = card.items[index];
    if (!item) {
      // 越界的下标只可能来自坏掉的 pendingItems，宁可显式报错也不要静默跳过
      // （跳过会让一张卡"少判一条"从而被判成 Good）
      throw new Error(
        `列举卡 ${card.cardId} 不存在条目下标 ${index}（共 ${card.items.length} 条）`,
      );
    }
    if (isItemWritten(item, normalizedTyped)) {
      verdicts.push("ok");
      matchedItems.push(index);
    } else {
      verdicts.push("miss");
    }
  }

  return {
    verdicts,
    itemIndexes: [...itemIndexes],
    keywordHits: matchedItems.length,
    keywordTotal: itemIndexes.length,
    matchedItems,
  };
}

/**
 * 把填空卡的作答切成若干段。
 *
 * 分隔符优先级（越靠前越不容易切坏答案）：
 * 1. `|` —— 用户显式分隔，最高优先级；
 * 2. 换行；
 * 3. 空白 / 分号。
 *
 * **不按顿号、逗号切**：`危及人身安全、健康` 这种答案本身就带顿号，按标点切会把
 * 正确答案切成两个错答案。段数多于空数时只取前 n 段（多打的当作噪声）；
 * 段数不足由调用方把缺的空判 miss。
 */
export function splitClozeSegments(typed: string, expected: number): string[] {
  const raw = typed ?? "";
  let segments: string[];

  if (raw.includes("|")) {
    segments = raw.split("|");
  } else if (/[\r\n]/.test(raw)) {
    segments = raw.split(/\r?\n/);
  } else {
    segments = raw.split(/[\s;；]+/);
  }

  const cleaned = segments.map((segment) => segment.trim());
  // 用户多打的分隔符会产出尾部空段，去掉它们避免占掉真实的空
  while (cleaned.length > 0 && cleaned[cleaned.length - 1] === "") {
    cleaned.pop();
  }

  return expected >= 0 ? cleaned.slice(0, expected) : cleaned;
}

/** 单个空的判定：精确匹配，或（输入 ≥2 字符时）双向包含匹配 */
function isBlankFilled(input: string, answers: string[]): boolean {
  const typed = normalizeText(input);
  if (!typed) return false;

  return answers.some((answer) => {
    const target = normalizeText(answer);
    if (!target) return false;
    if (typed === target) return true;
    if (typed.length < RECALL_CLOZE_MIN_CONTAIN_LENGTH) return false;
    return target.includes(typed) || typed.includes(target);
  });
}

export interface RecallClozeGradeResult {
  verdicts: RecallItemVerdict[];
}

/** 填空卡判分（全自动，无确认步骤） */
export function gradeCloze(
  card: RecallClozeCard,
  typed: string,
): RecallClozeGradeResult {
  const segments = splitClozeSegments(typed, card.blanks.length);

  const verdicts = card.blanks.map((blank: RecallBlank, index: number) =>
    isBlankFilled(segments[index] ?? "", blank.answers) ? "ok" : "miss",
  );

  return { verdicts };
}
