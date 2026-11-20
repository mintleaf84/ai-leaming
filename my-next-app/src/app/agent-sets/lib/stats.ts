/**
 * 题集的计数派生与「报错后列表更新」（纯函数）。
 *
 * 为什么单独抽出来：未做数在页面里被三处用到（卡片角标、详情统计、成卷按钮的
 * 可用性），flag 成功后又要同时改「未做」与「已反馈」。散在组件里各算一遍，
 * 迟早出现「卡片说还剩 3 题，点进去只有 2 题」。
 */
import type { AgentSetItem, AgentSetSummary } from "./types";

function clampCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

/**
 * 未做数 = 总量 − 已做 − 已反馈。
 *
 * 服务端明确给了 `pendingCount` 就以它为准（它可能还排除了归档/失效题）；
 * 只有没给的时候才本地减——本地减法在「只做了 1 题但服务端已把该题标为 done」
 * 这类中间态下会更准，所以两者不叠加。
 */
export function derivePendingCount(input: {
  totalQuestions: number;
  doneCount: number;
  flaggedCount: number;
  serverPending?: number | null;
}): number {
  const total = clampCount(input.totalQuestions);
  if (
    typeof input.serverPending === "number" &&
    Number.isFinite(input.serverPending)
  ) {
    return Math.min(clampCount(input.serverPending), total);
  }
  return Math.max(
    0,
    total - clampCount(input.doneCount) - clampCount(input.flaggedCount),
  );
}

/** 待做列表：已做的题按契约不再出现（历史与错题本里仍可回看） */
export function selectPendingItems(items: AgentSetItem[]): AgentSetItem[] {
  return items.filter((item) => !item.answered);
}

export interface FlagResult {
  summary: AgentSetSummary;
  items: AgentSetItem[];
  /** 这次是否真的移除了题（重复点击/已经被移走时是 false） */
  removed: boolean;
  /** 移除后还剩多少可做题 */
  remaining: number;
}

/**
 * 报错成功后的本地更新：该题从列表消失，未做 −1、已反馈 +1。
 *
 * 总题量不变——它记的是"这个批次推了几道题"，是历史事实，不随反馈缩水。
 * 找不到该题时原样返回（服务端可能已经先一步移除了，页面不必报错）。
 */
export function applyFlag(
  summary: AgentSetSummary,
  items: AgentSetItem[],
  questionId: number,
): FlagResult {
  const exists = items.some((item) => item.question.id === questionId);
  if (!exists) {
    return {
      summary,
      items,
      removed: false,
      remaining: summary.pendingCount,
    };
  }

  const nextItems = items.filter((item) => item.question.id !== questionId);
  const pendingCount = Math.max(0, summary.pendingCount - 1);
  return {
    summary: {
      ...summary,
      pendingCount,
      flaggedCount: clampCount(summary.flaggedCount) + 1,
    },
    items: nextItems,
    removed: true,
    remaining: pendingCount,
  };
}

/** 进度百分比（0~100），总题量为 0 时按 0 处理，避免 NaN 宽度 */
export function progressPercent(done: number, total: number): number {
  const safeTotal = clampCount(total);
  if (safeTotal === 0) return 0;
  const ratio = clampCount(done) / safeTotal;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}
