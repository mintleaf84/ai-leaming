import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import 'exam_timer_badge.dart';

/// 作答/成绩单共用的导航栏：左侧返回（作答中走离开确认），右侧交卷与倒计时。
class ExamSessionAppBar extends StatelessWidget implements PreferredSizeWidget {
  const ExamSessionAppBar({
    super.key,
    required this.colors,
    required this.title,
    required this.hasResult,
    required this.showSubmit,
    required this.submitting,
    required this.timed,
    required this.remaining,
    required this.onLeading,
    required this.onSubmit,
  });

  final AppColors colors;
  final String title;
  final bool hasResult;

  /// 可交卷的时机：还没交、也没在加载/报错。
  final bool showSubmit;
  final bool submitting;
  final bool timed;
  final Duration? remaining;
  final VoidCallback onLeading;
  final VoidCallback onSubmit;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      elevation: 0,
      leading: IconButton(
        tooltip: hasResult ? '返回' : '离开作答',
        icon: Icon(
          hasResult ? AppIcons.arrowBack : AppIcons.close,
          color: colors.text,
        ),
        onPressed: onLeading,
      ),
      title: Text(
        title,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontSize: 16.sp,
          fontWeight: FontWeight.w600,
          color: colors.text,
        ),
      ),
      centerTitle: true,
      actions: [
        if (showSubmit)
          Padding(
            padding: EdgeInsets.only(right: 6.w),
            child: TextButton(
              onPressed: submitting ? null : onSubmit,
              style: TextButton.styleFrom(
                foregroundColor: colors.accent,
                minimumSize: const Size(48, 44),
              ),
              child: Text(
                '交卷',
                style: TextStyle(fontSize: 14.sp, fontWeight: FontWeight.w600),
              ),
            ),
          ),
        if (!hasResult && timed && remaining != null)
          ExamTimerBadge(remaining: remaining!, colors: colors),
        SizedBox(width: 8.w),
      ],
    );
  }
}
