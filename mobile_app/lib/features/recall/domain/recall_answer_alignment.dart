/// 作答屏 → 判分屏的两个纯函数。
///
/// 为什么放在 domain 且必须纯：判分屏要在**提交之前**显示绿/黄，改判又必须随那唯一
/// 一次提交落库（规格 §1.4：每次作答只写一条日志）。所以「屏上位置 ↔ 卡内下标」
/// 的换算和「填空作答怎么切段」这两件事必须能在本地确定性地算出来，
/// 并且与服务端/前端 web 端逐条一致——它们漂移的后果是判错条目而不是报错。
///
/// 对齐的事实来源：
/// - `my-next-app/src/app/recall/lib/preview.ts`（`buildOverrides` / `splitClozeAnswers`）
/// - `my-next-app/src/lib/recall/matcher.ts`（`splitClozeSegments`）
/// - `my-next-app/src/app/recall/components/ClozePrompt.tsx`（空位编号按卡内下标）
library;

import 'recall_review.dart';

/// 把「屏上位置」的改判换算成「卡内下标」的 `overrides`。
///
/// [presentedIndexes] 是本次呈现的条目（**卡内下标**，顺序即输入顺序，
/// 来自 `RecallCard.presentedIndexes`）；[finalVerdicts] 与它一一对应。
///
/// 传了 [algoVerdicts]（本机预判结果）时只输出**真正变了**的条目——与 web 端
/// `preview.ts` 的 `buildOverrides` 同口径，少发噪音；不传则输出所有给定位置的
/// 改判（服务端 `applyOverrides` 是覆盖式赋值，重复项无害但会被日志记下来）。
///
/// 重测（`mode == retest`）时这里下标换算最容易错：屏上第 0 条可能是卡内第 3 条，
/// 直接发 0 会被服务端判成「改判下标 0 不在本次呈现的条目里」→ 400。
List<RecallOverride> buildOverrides(
  List<int> presentedIndexes,
  List<RecallVerdict> finalVerdicts, {
  List<RecallVerdict>? algoVerdicts,
}) {
  final overrides = <RecallOverride>[];

  for (var position = 0; position < presentedIndexes.length; position++) {
    // 判分结果比呈现列表短：说明调用方数据没对齐，后面的位置一律不发，
    // 免得发出一个没有对应判分的下标
    if (position >= finalVerdicts.length) break;

    final cardIndex = presentedIndexes[position];
    // 负下标是脏数据（服务端 schema 要求 nonnegative），宁可丢弃也不要 400
    if (cardIndex < 0) continue;

    if (algoVerdicts != null) {
      final algo = position < algoVerdicts.length
          ? algoVerdicts[position]
          : null;
      // 预判缺失时按「用户显式给了判分」处理：发出去让服务端以用户为准
      if (algo != null && algo == finalVerdicts[position]) continue;
    }

    overrides.add(
      RecallOverride(index: cardIndex, to: finalVerdicts[position]),
    );
  }

  return overrides;
}

/// 填空卡：把作答原文按空切开。
///
/// 与 `matcher.ts` 的 `splitClozeSegments` 逐条对齐：
/// - 有 `|` 按 `|` 切；否则有换行按行切；否则按空白/分号切；
/// - 每段去首尾空白；
/// - 尾部连续空段丢掉（用户多打分隔符不该占掉后面的空）；
/// - 最多取前 [blanksCount] 段（多打的部分丢弃，不并进最后一段）。
///
/// 返回值补齐到 [blanksCount] 段（不足补空串），这样界面可以按下标逐空对照，
/// 与 `preview.ts` 的 `splitClozeAnswers`（`segments[index] ?? ""`）同口径。
List<String> segmentAnswer(String typed, int blanksCount) {
  if (blanksCount <= 0) return const <String>[];

  List<String> parts;
  if (typed.contains('|')) {
    parts = typed.split('|');
  } else if (typed.contains('\n') || typed.contains('\r')) {
    parts = typed.split(RegExp(r'\r?\n'));
  } else {
    parts = typed.split(RegExp(r'[\s;；]+'));
  }

  final cleaned = parts.map((part) => part.trim()).toList();
  while (cleaned.isNotEmpty && cleaned.last.isEmpty) {
    cleaned.removeLast();
  }

  return List<String>.generate(
    blanksCount,
    (index) => index < cleaned.length ? cleaned[index] : '',
    growable: false,
  );
}
