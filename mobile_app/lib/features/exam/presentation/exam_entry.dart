import '../../../core/compat/contract_compat.dart';

/// 首页「试卷」入口是否显示（能力协商的唯一判定点）。
///
/// 与 `recallEntryAvailable` 同一套口径：
/// - 服务端能力清单里没有 `exam` 时**隐藏**入口（不是灰显后点出一个 404）；
/// - 协商还没结果（null）或服务端不可达时按「支持」处理——断网是移动端常态，
///   不能因为一次 `/meta` 失败就把入口藏起来。
bool examEntryAvailable(ContractDecision? decision) {
  if (decision == null) return true;
  if (decision.status == ContractCompat.serverUnreachable) return true;
  return decision.supports('exam');
}
