import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/practice_log.dart';

/// 「题目回顾」标题行 + 只看错题时的计数。
class HistoryFilterBar extends StatelessWidget {
  const HistoryFilterBar({
    super.key,
    required this.showWrongOnly,
    required this.logs,
    required this.textColor,
    required this.secondaryColor,
  });

  final bool showWrongOnly;
  final List<PracticeLog> logs;
  final Color textColor;
  final Color secondaryColor;

  @override
  Widget build(BuildContext context) {
    final wrongCount = logs.where((log) => !log.isCorrect).length;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          '题目回顾',
          style: TextStyle(
            fontSize: 16.sp,
            fontWeight: FontWeight.bold,
            color: textColor,
          ),
        ),
        if (showWrongOnly)
          Text(
            '只看错题 ($wrongCount)',
            style: TextStyle(
              fontSize: 12.sp,
              fontWeight: FontWeight.w500,
              color: context.colors.error,
            ),
          ),
      ],
    );
  }
}
