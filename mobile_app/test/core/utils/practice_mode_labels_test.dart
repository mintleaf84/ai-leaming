import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/core/utils/practice_mode_labels.dart';

/// `practice_mode` → 中文标签的唯一一张表。
///
/// 守的线：
/// 1. 服务端写过库的 7 种模式各有稳定文案（练习屏面包屑与历史 chip 共用）；
/// 2. 未知模式 / 缺失字段是中性「其它练习」，**绝不**冒充「随机练习」；
/// 3. 原始取值（`agent_set` 这类内部词）永远不会被当成文案返回。
void main() {
  test('七种已知模式各有中文标签', () {
    const expected = <String, String>{
      'random': '随机练习',
      'wrong': '错题复习',
      'tag': '专项练习',
      'exam': '模拟考试',
      'import': '外部导入',
      'agent_set': 'AI 题集',
      'review': '记忆复习',
    };

    expected.forEach((mode, label) {
      expect(
        practiceModeLabelOf(mode),
        label,
        reason: '$mode 的文案被改了：历史 chip 与练习屏面包屑会一起变',
      );
      // 内部取值不能直接出现在界面
      expect(practiceModeLabelOf(mode), isNot(mode));
    });
  });

  test('未知模式与缺失模式是中性「其它练习」，不回落随机', () {
    for (final mode in <String?>[null, '', '  ', 'flashcard_v2', 'unknown']) {
      final tag = practiceModeTagOf(mode);
      expect(tag.label, '其它练习', reason: 'mode=$mode');
      expect(tag.tone, PracticeModeTone.neutral, reason: 'mode=$mode');
      expect(
        tag.label,
        isNot('随机练习'),
        reason: 'mode=$mode 不能冒充随机练习',
      );
    }
  });

  test('容忍首尾空白（脏数据不至于掉进兜底）', () {
    expect(practiceModeLabelOf(' review '), '记忆复习');
    expect(practiceModeLabelOf('\texam\n'), '模拟考试');
  });
}
