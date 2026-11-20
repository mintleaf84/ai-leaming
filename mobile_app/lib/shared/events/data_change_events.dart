/// 跨 feature 的「数据变了」信号。
///
/// 为什么需要这一层：某些变更的**产生方**与**消费方**分属两个 feature
/// （题库编辑在 questions、题库列表在 practice；练习结束在 practice、
/// 历史在 history）。让产生方直接 `ref.read(对方的 provider)` 会把两个
/// feature 焊死：改其中一个的 provider 位置，另一个跟着编译失败。
///
/// 所以产生方只做一件事——把版本号 +1；需要感知变化的一方自己
/// `ref.listen` / `watch`，在自己的层里决定怎么刷新（重拉第一页、清空缓存…）。
/// 版本号是 `int` 而不是 void：`Notifier` 写入相同值不会通知监听者，
/// 连续两次「+1」必须都能被看到。
///
/// 这与 `core/auth/auth_epoch.dart` 是同一套模式：那里是「登录态变了」，
/// 这里是「某块业务数据变了」。放在 `shared/events/` 而不是任何单个 feature 下，
/// 是为了让两边都只依赖 shared。
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// 版本号 Notifier：每次 [bump] +1。
abstract class EpochNotifier extends Notifier<int> {
  @override
  int build() => 0;

  /// 数据发生一次实质变更时调用。
  void bump() => state = state + 1;
}

/// 题库数据（题目被新建/修改）版本号。
///
/// 产生方：`features/questions/presentation/question_form_screen.dart`（保存成功后）。
/// 消费方：`features/practice/presentation/question_list_screen.dart`（重新拉第一页）。
final questionBankEpochProvider =
    NotifierProvider<QuestionBankEpoch, int>(QuestionBankEpoch.new);

class QuestionBankEpoch extends EpochNotifier {}

/// 练习历史版本号。
///
/// 产生方：`features/practice/presentation/practice_provider.dart`（一场练习结束后）。
/// 消费方：`HistoryController`（重新拉第一页，首页「最近练习」跟着更新）。
final historyEpochProvider =
    NotifierProvider<HistoryEpoch, int>(HistoryEpoch.new);

class HistoryEpoch extends EpochNotifier {}
