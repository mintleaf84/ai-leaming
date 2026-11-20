import 'package:flutter/widgets.dart';

/// 校对页里可被测试稳定定位的控件。
///
/// 放在独立类而不是写在 private widget 里：测试只 import 这一个文件，
/// 不需要为了拿 Key 去 import 私有类型。
///
/// 校对页与条目编辑器分成两个文件后，这个类单独住一层：两边都 import 它，
/// 避免屏 ↔ 条目编辑器互相 import 形成环。
abstract final class DraftReviewKeys {
  static Key itemCard(int idx) => Key('draft-item-$idx');
  static Key itemContent(int idx) => Key('draft-item-$idx-content');
  static Key itemAnswer(int idx) => Key('draft-item-$idx-answer');
  static Key itemSave(int idx) => Key('draft-item-$idx-save');
  static Key itemDelete(int idx) => Key('draft-item-$idx-delete');
  static Key itemConfirmed(int idx) => Key('draft-item-$idx-confirmed');

  static const confirmAll = Key('draft-confirm-all');
  static const retryAnalyze = Key('draft-retry-analyze');
  static const reloadStatus = Key('draft-reload-status');
  static const discard = Key('draft-discard');
}
