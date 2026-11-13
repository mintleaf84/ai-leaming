/**
 * 评分推导（规格 §2.2）：用户永远看不到评分按钮，只有三个结果。
 *
 * - 点了「全没想起」→ `Again`；
 * - 呈现的条目全对 → `Good`；
 * - 其余（有错但没点全没想起）→ `Hard`。
 *
 * `Easy` 在本模块**不可能**被产生：判分只输出三档，scheduler 的评分映射里也没有
 * Easy 分支。这条约束由单测钉死——一旦有人"顺手加一档"，测试会红。
 */
import type { RecallDerivedRating, RecallItemVerdict } from "./types";

export function deriveRating(
  verdicts: RecallItemVerdict[],
  allBlank: boolean = false,
): RecallDerivedRating {
  if (allBlank) return "again";

  // 没有任何可判条目 = 没有任何回忆证据，不能给 Good（vacuous truth 会把
  // "空卡/坏 pendingItems" 判成满分，从而把间隔越拉越长）
  if (verdicts.length === 0) return "again";

  return verdicts.every((verdict) => verdict === "ok") ? "good" : "hard";
}
