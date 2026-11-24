import 'question.dart';

/// 当前 App 版本能在练习屏呈现作答交互的题型集合。
///
/// 这是「我们能对用户诚实」的范围，刻意比服务端契约**更窄**：
/// `fill_blank` 是契约里的合法取值，但练习屏还没有作答控件——把它算进来
/// 只会重演「按单选渲染、没有选项可点、静默判错」。所以未在此集合的题型
/// 一律走「不可作答 + 提示更新 App」（口径见 2026-11 产品决策）。
///
/// 练习 UI 真正支持 `fill_blank` 那天：把它加进这里即可，其它文件不用动。
const Set<String> kPracticableQuestionTypes = {'single', 'multi', 'truefalse'};

extension QuestionPracticability on Question {
  /// 当前 App 能否呈现这道题的作答交互。
  bool get isPracticable => kPracticableQuestionTypes.contains(type);
}
