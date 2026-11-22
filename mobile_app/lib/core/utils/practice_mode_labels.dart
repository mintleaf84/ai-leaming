/// 练习模式（`practice_sessions.practice_mode`）→ 中文标签的**唯一**一份映射。
///
/// 这个字段是有限集，写入点分散在服务端三处：
/// `practice.ts`（random / wrong / tag / review）、`exam.ts`（exam）、
/// `import-service.ts`（import），加上 AI 题集推来的 `agent_set`。
///
/// 为什么必须只有一份：练习屏面包屑与历史列表的模式 chip 各写一张表，
/// 迟早漂移——上一轮就是历史里 `review`/`exam`/`import` 全被标成「随机练习」。
/// 现在两边都从这里取文案，颜色由调用方按 [PracticeModeTone] 映射主题色。
///
/// 未知取值（外部写入、将来新增的模式）一律给中性的「其它练习」，
/// **绝不**回落成「随机练习」：冒充一种已知模式，用户会以为系统记错了自己的练习方式。
library;

/// 模式标签的语义色调。
///
/// 只描述「该用哪一组语义色」，不引用任何具体颜色：`core` 层拿不到
/// `BuildContext`，配色留给 UI 层（`context.colors`）决定。
enum PracticeModeTone {
  /// 主色（随机、AI 题集）
  accent,

  /// 错误色（错题）
  danger,

  /// 警告色（专项）
  warning,

  /// 成功色（考试、记忆复习）
  success,

  /// 中性灰（外部导入、未知模式）
  neutral,
}

/// 一条模式标签：文案 + 语义色调。
class PracticeModeTag {
  const PracticeModeTag(this.label, this.tone);

  final String label;
  final PracticeModeTone tone;
}

const PracticeModeTag _unknown = PracticeModeTag(
  '其它练习',
  PracticeModeTone.neutral,
);

/// 把 `practice_mode` 的原始取值翻译成标签。
///
/// 入参容忍首尾空白与 null（老会话可能没有这个字段）。
PracticeModeTag practiceModeTagOf(String? mode) {
  switch (mode?.trim()) {
    case 'random':
      return const PracticeModeTag('随机练习', PracticeModeTone.accent);
    case 'wrong':
      return const PracticeModeTag('错题复习', PracticeModeTone.danger);
    case 'tag':
      return const PracticeModeTag('专项练习', PracticeModeTone.warning);
    case 'exam':
      return const PracticeModeTag('模拟考试', PracticeModeTone.success);
    case 'import':
      return const PracticeModeTag('外部导入', PracticeModeTone.neutral);
    case 'agent_set':
      return const PracticeModeTag('AI 题集', PracticeModeTone.accent);
    case 'review':
      return const PracticeModeTag('记忆复习', PracticeModeTone.success);
    default:
      return _unknown;
  }
}

/// 只要文案时的简写（练习屏面包屑、无障碍播报等场景）。
String practiceModeLabelOf(String? mode) => practiceModeTagOf(mode).label;
