import 'question.dart';

/// 当前 App 版本能在练习屏呈现作答交互的题型集合。
///
/// 这是「我们能对用户诚实」的范围，刻意比服务端契约**更窄**：
/// 未在此集合的题型一律走「不可作答 + 提示更新 App」（口径见 2026-11 产品决策），
/// 而不是按单选渲染、没有选项可点、静默判错。
///
/// `fill_blank` 于 2026-11-24 加入：练习屏已有逐空作答控件
/// （`features/practice/presentation/widgets/fill_blank_answer_fields.dart`，
/// 空数/提交串/判分口径见 `features/practice/domain/fill_blank_answer.dart`）。
const Set<String> kPracticableQuestionTypes = {
  'single',
  'multi',
  'truefalse',
  'fill_blank',
};

extension QuestionPracticability on Question {
  /// 当前 App 能否呈现这道题的作答交互。
  bool get isPracticable => kPracticableQuestionTypes.contains(type);

  /// 填空题（逐空作答的题型）。
  ///
  /// 放在这里而不是各屏自己比字符串：题型取值只在这一处出现，改名时不会漏一处。
  bool get isFillBlank => type == 'fill_blank';
}
