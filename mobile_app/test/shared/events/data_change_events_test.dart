import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/shared/events/data_change_events.dart';

/// 跨 feature 事件版本号的契约：
///
/// 1. 初始值是 0（消费方「没收到过信号」的判断前提）；
/// 2. 每次 [EpochNotifier.bump] 都 +1——**连续两次必须是两个不同的值**，
///    否则 Riverpod 判等后第二次不通知，第二次变更就丢了；
/// 3. 两个信号彼此独立：题库变了不该让历史跟着重拉。
void main() {
  ProviderContainer makeContainer() {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    return container;
  }

  test('初始值为 0', () {
    final container = makeContainer();

    expect(container.read(questionBankEpochProvider), 0);
    expect(container.read(historyEpochProvider), 0);
  });

  test('每次 bump 都通知监听者，且连续两次的值不同', () {
    final container = makeContainer();
    final seen = <int>[];
    final sub = container.listen(
      questionBankEpochProvider,
      (_, next) => seen.add(next),
    );
    addTearDown(sub.close);

    container.read(questionBankEpochProvider.notifier).bump();
    container.read(questionBankEpochProvider.notifier).bump();

    expect(seen, <int>[1, 2], reason: '连点两次保存，第二次也必须通知到列表');
  });

  test('两个信号互不干扰', () {
    final container = makeContainer();

    container.read(historyEpochProvider.notifier).bump();

    expect(container.read(historyEpochProvider), 1);
    expect(container.read(questionBankEpochProvider), 0);
  });
}
