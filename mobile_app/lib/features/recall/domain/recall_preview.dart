/// 回忆自测的「本地预判」纯函数——web 端口径的 Dart 移植。
///
/// 判分屏要在用户**确认之前**显示绿/黄，而且改判必须随那唯一一次提交落库
/// （规格 §1.4：每次作答只写一条日志）。所以客户端必须能独立算出与服务端
/// 完全一致的判分，否则「屏上 ok、落库 miss」这种漂移会静默污染复习日志。
///
/// 对齐的事实来源（改这里之前先读它们）：
/// - `my-next-app/src/lib/recall/normalize.ts` —— 归一化三步（全角→半角、去 `\p{P}`、
///   折叠空白）+ 小写；
/// - `my-next-app/src/lib/recall/matcher.ts` —— `gradeList` / `gradeCloze` /
///   `splitClozeSegments`（判分的**唯一**事实来源）；
/// - `my-next-app/src/app/recall/lib/preview.ts` —— `presentedIndexes` /
///   `previewVerdicts` 的呈现集合语义；
/// - 服务端对照：`my-next-app/src/lib/services/recall.ts` 的 `gradeCard`（同样只判
///   呈现出来的条目）。
///
/// 纯函数：无 IO、无 `print`、无 `DateTime.now()`、无随机数——测试可以直接断言。
library;

import 'recall_answer_alignment.dart';
import 'recall_card.dart';
import 'recall_review.dart';

/// 填空包含匹配的最短输入长度（小于 2 个字符时只认精确匹配）。
///
/// 与 `matcher.ts` 的 `RECALL_CLOZE_MIN_CONTAIN_LENGTH` 同值：不放宽到单字，
/// 否则「安」「全」这种输入会把整张卡蒙对。
const int recallClozeMinContainLength = 2;

/// 全角 ASCII 区段与偏移（`normalize.ts` 的同名常量）。
const int _fullwidthAsciiStart = 0xff01;
const int _fullwidthAsciiEnd = 0xff5e;
const int _fullwidthAsciiOffset = 0xfee0;
const int _ideographicSpace = 0x3000;

/// 全角 ASCII 转半角（含全角空格转普通空格）。
///
/// 按**码点**遍历（`input.runes`）而不是 `codeUnitAt`：代理对字符被拆成孤立半代理
/// 后输出会损坏，`normalize.ts` 里为同一原因用了 `for…of`。
String toHalfWidth(String input) {
  if (input.isEmpty) return '';
  final buffer = StringBuffer();
  for (final rune in input.runes) {
    if (rune == _ideographicSpace) {
      buffer.writeCharCode(0x20);
      continue;
    }
    if (rune >= _fullwidthAsciiStart && rune <= _fullwidthAsciiEnd) {
      buffer.writeCharCode(rune - _fullwidthAsciiOffset);
      continue;
    }
    buffer.writeCharCode(rune);
  }
  return buffer.toString();
}

/// 去标点：只删 Unicode `\p{P}`，不删 `\p{S}`。
///
/// `+ - = ° %` 这类符号在部分学科内容里是语义的一部分，一起删会把「A+B」和「AB」
/// 判成同一个答案（`normalize.ts` 的同一条注释）。
final RegExp _punctuation = RegExp(r'\p{P}', unicode: true);

/// 连续空白（与 `normalize.ts` 的 `/\s+/g` 对应）。
final RegExp _whitespaceRun = RegExp(r'\s+', unicode: true);

String stripPunctuation(String input) {
  if (input.isEmpty) return '';
  return input.replaceAll(_punctuation, '');
}

/// 判分统一入口：全角转半角 → 去标点 → 折叠空白 → 小写。
///
/// 顺序不可调换：先去标点会把「，」变成空、再折叠空白才能把「安全 ，制度」收成
/// 「安全 制度」；反过来先折叠则会留下逗号分隔的两个空格。
String normalizeText(String input) {
  if (input.isEmpty) return '';
  return stripPunctuation(
    toHalfWidth(input),
  ).replaceAll(_whitespaceRun, ' ').trim().toLowerCase();
}

/// 关键词比对专用：去掉**全部**空白（不是折叠成一个）。
///
/// 关键词是内容侧手写的、可能带空格（「倒 U 形」），用户不会照着空格打。
/// `normalizeText` 刻意保留单个空格（填空判分依赖这个语义），所以只在这条路径上
/// 两侧各多压一次——与 `matcher.ts` 的 `compactForMatch` 逐字对应。
String _compactForMatch(String text) => text.replaceAll(_whitespaceRun, '');

/// 单个列举条目是否被判「已写」。
///
/// 口径（照搬 `matcher.ts` 的 `isItemWritten`）：
/// 1. 归一化后为空的作答直接 miss；
/// 2. 关键词逐个归一化 + 去全部空白，归一化后为空的（如只有一个「、」）**剔除**
///    ——否则 `contains("")` 恒真，整张卡会蒙对；
/// 3. 关键词全被剔除（含 `keywords` 为空/缺失）时**退化为条目文本本身**；
/// 4. 命中判定是**单向**的：`作答.contains(关键词)`。作答比关键词短 → miss
///    （与填空卡的双向包含刻意不同）。
bool _isItemWritten(RecallListItem item, String normalizedTyped) {
  if (normalizedTyped.isEmpty) return false;

  final compactTyped = _compactForMatch(normalizedTyped);
  final keywords = item.keywords
      .map((keyword) => _compactForMatch(normalizeText(keyword)))
      .where((keyword) => keyword.isNotEmpty)
      .toList(growable: false);

  if (keywords.isEmpty) {
    final fallback = _compactForMatch(normalizeText(item.text));
    return fallback.isNotEmpty && compactTyped.contains(fallback);
  }

  return keywords.any(compactTyped.contains);
}

/// 单个空的判定：精确匹配，或（输入 ≥2 字符时）**双向**包含匹配。
bool _isBlankFilled(String input, List<String> answers) {
  final typed = normalizeText(input);
  if (typed.isEmpty) return false;

  for (final answer in answers) {
    final target = normalizeText(answer);
    if (target.isEmpty) continue;
    if (typed == target) return true;
    // 单字输入只认精确匹配，避免「安」蒙中「安全」
    if (typed.length < recallClozeMinContainLength) continue;
    if (target.contains(typed) || typed.contains(target)) return true;
  }
  return false;
}

/// 列举卡判分：只判 [itemIndexes] 指定的卡内下标（顺序即输出顺序）。
///
/// 越界下标照 `matcher.ts` 显式抛错而不是静默跳过——跳过会让一张卡「少判一条」
/// 从而被判成 ok。调用方是 [previewVerdicts]，它只传 [RecallCard.presentedIndexes]
/// 已经校验过的下标，所以这里正常不会触发。
List<RecallVerdict> _gradeList(
  List<RecallListItem> items,
  String typed,
  List<int> itemIndexes,
) {
  final normalizedTyped = normalizeText(typed);
  final verdicts = <RecallVerdict>[];

  for (final index in itemIndexes) {
    if (index < 0 || index >= items.length) {
      throw ArgumentError('列举卡不存在条目下标 $index（共 ${items.length} 条）');
    }
    verdicts.add(
      _isItemWritten(items[index], normalizedTyped)
          ? RecallVerdict.ok
          : RecallVerdict.miss,
    );
  }

  return List<RecallVerdict>.unmodifiable(verdicts);
}

/// 填空卡判分：[blanks] 必须**已经**是本轮呈现的子集（调用方按 `presented` 取好）。
///
/// 段数按 [blanks] 的长度截断/补齐——这正是 `gradeCloze` 里
/// `segments[index] ?? ""` + `splitClozeSegments(typed, card.blanks.length)` 的效果。
///
/// 复用 [segmentAnswer] 而不是重写一遍 `splitClozeSegments`：两者唯一的差别是
/// `matcher.ts` 还支持 `expected < 0`（不截断），而判分路径上 `expected` 恒等于
/// 空位数（≥0），所以这一分支不可达；[segmentAnswer] 在此之上补空串，
/// 与 `?? ""` 的判分结果完全一致。保留单一实现，避免切段口径两处漂移。
List<RecallVerdict> _gradeCloze(List<RecallBlank> blanks, String typed) {
  final segments = segmentAnswer(typed, blanks.length);
  final verdicts = <RecallVerdict>[];
  for (var index = 0; index < blanks.length; index++) {
    verdicts.add(
      _isBlankFilled(segments[index], blanks[index].answers)
          ? RecallVerdict.ok
          : RecallVerdict.miss,
    );
  }
  return List<RecallVerdict>.unmodifiable(verdicts);
}

/// 一次预判的结果。
class RecallPreview {
  /// 本次呈现的**卡内**条目下标（与 `pendingItems` 同一坐标系，顺序即输入顺序）。
  final List<int> presented;

  /// 与 [presented] 一一对应的判分。
  final List<RecallVerdict> verdicts;

  const RecallPreview({required this.presented, required this.verdicts});
}

/// 本次要呈现（和判分）哪些卡内下标。
///
/// 语义直接复用 [RecallCard.presentedIndexes]（已与 `preview.ts` 的
/// `resolvePresented` 逐条对齐）：
/// - 非 `retest` 或 `pendingItems == null`：全部 `0..n-1`；
/// - `retest`：只保留合法的 `pendingItems`，过滤后为空则退回全部。
///
/// 与 web 端唯一的差别是「非整数」这一档：Dart 的 `List<int>` 在类型层面就不可能
/// 出现非整数下标，`Number.isInteger` 检查在这里不可达，故省略。
List<int> presentedIndexes(RecallCard card) => card.presentedIndexes;

/// 作答屏 → 判分屏的预判：与服务端 `gradeCard` 同一套规则。
///
/// 列举卡把 `keywords` 缺失的条目补成 `[item.text]`（`preview.ts` 的同一条退化），
/// 填空卡先按 `presented` 取子集再判分——**段数按子集长度截断**，这样重测时
/// 「第 0 段」对的是屏上第 0 个空，而不是卡内第 0 个空。
///
/// `verbatim`（逐字）在预判里恒按非逐字处理：web 端 `preview.ts` 的
/// `gradeList({..., verbatim: false})` 是写死的，且 `matcher.ts` 的判分根本不读
/// 这个字段（逐字/拼音容错划到 v2，见 `types.ts` 头注释）。这里保持同一口径，
/// 不引入客户端独有的「更严格」行为——否则同一次作答会在屏上与落库后判得不一样。
RecallPreview previewVerdicts(RecallCard card, String typed) {
  final presented = presentedIndexes(card);

  if (card.kind.isCloze) {
    final blanks = card.blanks ?? const <RecallBlank>[];
    final subset = <RecallBlank>[
      for (final index in presented)
        if (index >= 0 && index < blanks.length) blanks[index],
    ];
    return RecallPreview(
      presented: presented,
      verdicts: _gradeCloze(subset, typed),
    );
  }

  final items = card.items ?? const <RecallListItem>[];
  final previewItems = [
    for (final item in items)
      RecallListItem(
        text: item.text,
        // 关键词缺失时退化为整条文本（与 matcher 的退化分支同一思路）
        keywords: item.keywords.isNotEmpty ? item.keywords : [item.text],
      ),
  ];

  return RecallPreview(
    presented: presented,
    verdicts: _gradeList(previewItems, typed, presented),
  );
}
