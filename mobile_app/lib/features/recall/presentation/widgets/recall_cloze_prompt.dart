import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// 填空卡的题干：把 `【　】` 占位渲染成带序号的空位。
///
/// 为什么要把序号压在题干上：一张填空卡有 3 个空时，作答区只有一个输入框，
/// 用户必须知道「现在写的是第几个空」。序号顺序 = 输入顺序，
/// 重测时只给本次呈现的空位编号（[presented] 是卡内下标，顺序即输入顺序），
/// 其余空位显示 `·` 并压暗——避免用户去填一个不会被判分的空。
class RecallClozePrompt extends StatelessWidget {
  const RecallClozePrompt({
    super.key,
    required this.prompt,
    required this.presented,
    this.fontSize = 18,
    this.compact = false,
  });

  /// 题干原文，空位写作 `【　】`（括号内内容不参与展示）。
  final String prompt;

  /// 本次呈现的空位（卡内下标，数组顺序 = 输入顺序）。
  final List<int> presented;

  /// 正文字号（判分屏比作答屏略小，让下面的逐条结果更早露出来）。
  final double fontSize;

  /// 判分屏用：空位 chip 更紧凑。
  final bool compact;

  static final RegExp _blankPattern = RegExp(r'【[^】]*】');

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final secondary = scheme.onSurface.withValues(alpha: 0.62);

    final spans = <InlineSpan>[];
    var cursor = 0;
    var blankIndex = -1;

    for (final match in _blankPattern.allMatches(prompt)) {
      if (match.start > cursor) {
        spans.add(TextSpan(text: prompt.substring(cursor, match.start)));
      }
      blankIndex += 1;
      final position = presented.indexOf(blankIndex);
      spans.add(
        WidgetSpan(
          alignment: PlaceholderAlignment.middle,
          child: _BlankChip(
            order: position >= 0 ? position + 1 : null,
            compact: compact,
          ),
        ),
      );
      cursor = match.end;
    }
    if (cursor < prompt.length) {
      spans.add(TextSpan(text: prompt.substring(cursor)));
    }

    return Text.rich(
      TextSpan(children: spans),
      style: theme.textTheme.bodyLarge?.copyWith(
        fontSize: fontSize.sp,
        height: 1.75,
        color: secondary,
        letterSpacing: 0.2,
      ),
    );
  }
}

/// 题干里的一个空位：有编号 = 本次要填，`·` = 本次不填。
class _BlankChip extends StatelessWidget {
  const _BlankChip({required this.order, required this.compact});

  final int? order;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final active = order != null;
    final base = compact ? 20.0 : 24.0;
    final digits = order == null ? 1 : '$order'.length;

    // 用固定尺寸 + Center，而不是「Container + alignment」：后者在 WidgetSpan 里
    // 会撑满整行可用宽度（WidgetSpan 给的是宽松约束 + 无界最大宽度），
    // 空位会变成一条横贯题干的长条。
    return Semantics(
      label: active ? '第 $order 空' : '本次不填',
      excludeSemantics: true,
      child: SizedBox(
        width: (base + (digits - 1) * 9).w,
        height: base.h,
        child: Container(
          margin: EdgeInsets.symmetric(horizontal: 2.w),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: active
                ? scheme.primary.withValues(alpha: 0.10)
                : scheme.onSurface.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(6.r),
            border: Border.all(
              color: active
                  ? scheme.primary.withValues(alpha: 0.32)
                  : Theme.of(context).dividerColor,
            ),
          ),
          child: Text(
            active ? '$order' : '·',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: (compact ? 11 : 12).sp,
              height: 1.2,
              fontWeight: FontWeight.w600,
              fontFeatures: const [FontFeature.tabularFigures()],
              color: active
                  ? scheme.onSurface
                  : scheme.onSurface.withValues(alpha: 0.45),
            ),
          ),
        ),
      ),
    );
  }
}
