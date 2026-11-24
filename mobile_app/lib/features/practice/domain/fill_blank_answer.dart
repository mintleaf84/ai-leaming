import 'dart:math' as math;

import '../../../shared/domain/question.dart';

/// 填空题（`type == 'fill_blank'`）的空数推导、提交串组装、逐空判分与逐空展示。
///
/// 口径的三方必须一致，动手前先读它们：
/// - **判分**：`my-next-app/src/lib/services/answer-check.ts` 的 `fill_blank` 分支——
///   userAnswer 与 correctAnswer **都按中文 `；`** 切分逐空比较；每空接受 `|` 分隔的
///   多个可接受答案；某一空为空、或两方空数不一致 → 判错（逐字比较，不折叠大小写）。
/// - **空数推导**：网页端 `my-next-app/src/components/practice/PracticeCard.tsx` 的
///   `Math.max(1, answer.split(/[；;]/).filter(Boolean).length)`——**中英文分号都算分隔符**。
/// - **提交串**：网页端同样是各空文本 `join('；')`（只用中文分号）。
///
/// 为什么不复用 `exam/domain/exam_generate_rules.dart` 的分隔工具：那条按
/// `[,，、;；\n]` 切并且去重（标签输入框的口径），会把「A,B」这种含逗号的空答案切断，
/// 也不会保留空位的位置。

/// 提交串与逐空比较的分隔符：**只能是中文分号**。
///
/// 服务端只按 `；` 切 userAnswer，用 `;` 拼会让多空题整体对不上（判成错）。
const String kFillBlankSeparator = '；';

/// 推导空数/展示时承认的分隔符：中英文分号都算（与网页端 `[；;]` 同形）。
final RegExp _countSeparatorPattern = RegExp('[；;]');

/// 题干里画出来的空位：三个及以上下划线（与网页端 `/(_____+)/g` 同形）。
final RegExp _stemPlaceholderPattern = RegExp(r'_{3,}');

/// 按正确答案里的分号推导空数，至少 1（与网页端同口径）。
///
/// 与网页端唯一的差别：那边 `filter(Boolean)` 只滤掉空串，这里连纯空白段一起滤
/// （`甲； ；丙` 这种脏数据不该多渲染一个填不出答案的框）。判分仍然由服务端按
/// 原始串逐空比对，所以这里只影响输入框个数，不影响对错。
int fillBlankCountFromAnswer(String? answer) {
  final filled = (answer ?? '')
      .split(_countSeparatorPattern)
      .where((part) => part.trim().isNotEmpty)
      .length;
  return math.max(1, filled);
}

/// 这道题应当渲染几个输入框。
///
/// 首选正确答案（网页端的口径）。但**练习出题接口不带答案**：
/// `POST /api/practice/session` 只回 `id/content/options/type/material*`（防作弊），
/// 所以在线作答时这里拿不到答案，退到「题干里画出来的空位」——用户看到几条下划线
/// 就该有几个输入框；两者都没有就是一个空。离线续练的题面来自本地缓存（带答案），
/// 走第一条，与网页端完全一致。
int fillBlankSlotsFor(Question question) {
  final answer = question.answer;
  if (answer != null && answer.trim().isNotEmpty) {
    return fillBlankCountFromAnswer(answer);
  }
  final placeholders = _stemPlaceholderPattern
      .allMatches(question.content)
      .length;
  return math.max(1, placeholders);
}

/// 把逐空文本拼成提交串（各空按中文 `；` join）。
String encodeFillBlanks(List<String> blanks) =>
    blanks.join(kFillBlankSeparator);

/// 每一空都填了非空白文本才算填完；空列表不算填完（等于没作答）。
bool fillBlanksComplete(List<String> blanks) =>
    blanks.isNotEmpty && blanks.every((blank) => blank.trim().isNotEmpty);

/// 把答案串拆回逐空（展示用）：中英文分号都算分隔符，逐项去空白。
List<String> decodeFillBlanks(String raw) => raw
    .split(_countSeparatorPattern)
    .map((part) => part.trim())
    .toList(growable: false);

/// 逐空文本的展示形式：多空是「空 1：甲⏎空 2：乙」，单空只留文本本身。
String formatFillBlankBlanks(List<String> blanks) {
  if (blanks.isEmpty) return '';
  if (blanks.length == 1) return blanks.first;
  final buffer = StringBuffer();
  for (var index = 0; index < blanks.length; index++) {
    if (index > 0) buffer.writeln();
    buffer.write('空 ${index + 1}：${blanks[index]}');
  }
  return buffer.toString();
}

/// 答案串的逐空展示（正确答案是单串，界面按空序显示）。
String formatFillBlankAnswer(String raw) =>
    formatFillBlankBlanks(decodeFillBlanks(raw));

/// 逐空判分（镜像服务端 `answer-check.ts` 的 `fill_blank` 分支）。
///
/// 离线判分用它，是为了不让本地比服务端更宽松：`|` 多答案、空数不一致这些规则
/// 在服务端都存在，本地自创一套「去噪声后整串相等」会把用户在线判错的题在离线
/// 判对，补交后同一道题出现两个结论。
bool fillBlanksMatch(String userAnswer, String correctAnswer) {
  final user = userAnswer
      .split(kFillBlankSeparator)
      .map((part) => part.trim())
      .toList(growable: false);
  final correct = correctAnswer
      .split(kFillBlankSeparator)
      .map((part) => part.trim())
      .toList(growable: false);
  if (user.length != correct.length) return false;
  for (var index = 0; index < user.length; index++) {
    if (user[index].isEmpty) return false;
    final accepted = correct[index]
        .split('|')
        .map((part) => part.trim())
        .where((part) => part.isNotEmpty);
    if (!accepted.contains(user[index])) return false;
  }
  return true;
}
