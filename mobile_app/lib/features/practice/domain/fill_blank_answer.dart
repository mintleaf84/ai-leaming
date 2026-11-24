import 'dart:math' as math;

import '../../../shared/domain/question.dart';

/// 填空题（`type == 'fill_blank'`）的空数推导、提交串组装、逐空判分与逐空展示。
///
/// **唯一分隔符是中文 `；`**（见 [kFillBlankSeparator]）。原因是判分方只认它：
/// - 服务端 `my-next-app/src/lib/services/answer-check.ts` 的 `checkAnswerCorrectness`
///   在 `fill_blank` 分支里 `userAnswer.split("；")` / `correctAnswer.split("；")`；
/// - 本地离线判分 [fillBlanksMatch] 逐字镜像上面那段。
///
/// 所以**渲染和展示必须按同一个分隔符切**：判分方怎么切，界面就怎么切。半角 `;`
/// 一律视为**空内的文本**而不是空位分隔——若这里多切一刀（例如按 `[；;]` 切），
/// 端上会渲染 N+1 个输入框而判分只认 N 段，用户照界面填必然被判错（CodeRabbit major）。
/// 网页端 `PracticeCard.tsx` 现在仍是 `answer.split(/[；;]/)`，同型的口子另开一条 PR 收。
///
/// 其余判分细节（同样以服务端为准）：每空接受 `|` 分隔的多个可接受答案；某一空为空、
/// 或两方空数不一致 → 判错（逐字比较，不折叠大小写）。提交串是各空文本 `join('；')`。
///
/// 数据事实（2026-11-24 核线上）：现网 fill_blank 共 24 题，**全部单空且答案不含任何
/// 分号**，题干里连 `___` 都没有（例：「学校教育的基本要素有：教育者、、教育影响。」）；
/// 教综 1680 题里填空题数为 0。所以上面那条混用分号的坑现网没有实例，属未来防御。
///
/// 为什么不复用 `exam/domain/exam_generate_rules.dart` 的分隔工具：那条按
/// `[,，、;；\n]` 切并且去重（标签输入框的口径），会把「A,B」这种含逗号的空答案切断，
/// 也不会保留空位的位置。

/// 提交串、空数推导、逐空比较与逐空展示的分隔符：**只能是中文分号**。
///
/// 服务端只按 `；` 切 userAnswer 与 correctAnswer，用 `;` 拼或用别的分隔符切都会让
/// 多空题整体对不上（判成错）。
const String kFillBlankSeparator = '；';

/// 题干里画出来的空位：三个及以上下划线（与网页端 `/(_____+)/g` 同形）。
final RegExp _stemPlaceholderPattern = RegExp(r'_{3,}');

/// 按正确答案里的 `；` 严格推导空数，至少 1。
///
/// 分隔符与 [fillBlanksMatch] 完全一致（只按中文分号），这样「渲染几个框」与
/// 「判分认几段」不可能分叉。
///
/// 与网页端 `Math.max(1, answer.split(/[；;]/).filter(Boolean).length)` 的两处差别：
/// 分隔符收窄到 `；`（见文件头），以及连纯空白段一起滤（`甲； ；丙` 这种脏数据不该
/// 多渲染一个填不出答案的框）。判分仍由服务端按原始串逐空比对，所以这里只影响
/// 输入框个数，不影响对错。
int fillBlankCountFromAnswer(String? answer) {
  final filled = (answer ?? '')
      .split(kFillBlankSeparator)
      .where((part) => part.trim().isNotEmpty)
      .length;
  return math.max(1, filled);
}

/// 这道题应当渲染几个输入框。优先级：有答案 → 按 `；` 严格计数；无答案 → 题干里
/// 画出的空位；都没有 → 1。
///
/// 首选正确答案（与判分同源）。但**练习出题接口不带答案**：
/// `POST /api/practice/session` 只回 `id/content/options/type/material*`（防作弊），
/// 所以在线作答时这里拿不到答案，退到「题干里画出来的空位」——用户看到几条下划线
/// 就该有几个输入框；两者都没有就是一个空。离线续练的题面来自本地缓存（带答案），
/// 走第一条。
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

/// 把答案串拆回逐空（展示用）：只按 `；` 切，逐项去空白。
///
/// 与判分同源，所以「界面上显示几空」与「服务端判几空」永远一致；答案里合法的
/// 半角分号（例如 `cat; dog`）会原样留在同一空的文本里。
List<String> decodeFillBlanks(String raw) => raw
    .split(kFillBlankSeparator)
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
