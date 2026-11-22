import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import '../../../../core/utils/practice_mode_labels.dart';
import '../practice_provider.dart';

/// 练习屏顶部：退出 / 模式标题 / 进度条 / 题号与百分比。
///
/// 从 `practice_screen.dart` 原样搬出；退出确认与「丢掉本场状态」仍由调用方
/// 通过 [onExit] 决定（那是屏的职责，不在这里复制）。进度条、字号、间距一字未改。
class PracticeQuestionHeader extends StatelessWidget {
  const PracticeQuestionHeader({
    super.key,
    required this.state,
    required this.onExit,
  });

  final PracticeSessionState state;
  final VoidCallback onExit;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 12.h),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              IconButton(
                tooltip: '退出练习',
                onPressed: onExit,
                icon: const Icon(AppIcons.close),
                color: context.colors.text.withValues(alpha: 0.6),
              ),
              Text(
                '刷题模式',
                style: TextStyle(
                  fontSize: 12.sp,
                  fontWeight: FontWeight.w500,
                  color: context.colors.text.withValues(alpha: 0.4),
                  letterSpacing: 2,
                ),
              ),
              IconButton(
                tooltip: '更多操作',
                onPressed: () {},
                icon: const Icon(AppIcons.moreHoriz),
                color: context.colors.text.withValues(alpha: 0.6),
              ),
            ],
          ),
          SizedBox(height: 8.h),
          // Progress Bar
          ClipRRect(
            borderRadius: BorderRadius.circular(4.r),
            child: LinearProgressIndicator(
              value: state.progress,
              backgroundColor: context.colors.text.withValues(alpha: 0.05),
              color: context.colors.text,
              minHeight: 6.h,
            ),
          ),
          SizedBox(height: 6.h),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '${state.currentIndex + 1} / ${state.questions.length}',
                style: TextStyle(
                  fontSize: 10.sp,
                  color: context.colors.text.withValues(alpha: 0.4),
                  fontFamily: 'monospace',
                ),
              ),
              Text(
                '${(state.progress * 100).toInt()}%',
                style: TextStyle(
                  fontSize: 10.sp,
                  color: context.colors.text.withValues(alpha: 0.4),
                  fontFamily: 'monospace',
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// 标题下方那行面包屑：分类 + 本场的真实练习模式。
///
/// 模式文案与历史列表共用 [practiceModeTagOf]：从错题本、AI 题集、试卷进来的
/// 练习不能再一律写「随机模式」（未知模式显示中性的「其它练习」）。
class PracticeBreadcrumb extends StatelessWidget {
  const PracticeBreadcrumb({super.key, required this.mode});

  /// `practice_sessions.practice_mode` 的原始取值；null 表示还不知道。
  final String? mode;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text('🇨🇳', style: TextStyle(fontSize: 14.sp)),
        SizedBox(width: 4.w),
        Text(
          '综合练习',
          style: TextStyle(
            fontSize: 12.sp,
            color: context.colors.text.withValues(alpha: 0.5),
          ),
        ),
        Text(
          ' / ',
          style: TextStyle(
            fontSize: 12.sp,
            color: context.colors.text.withValues(alpha: 0.3),
          ),
        ),
        Text(
          practiceModeLabelOf(mode),
          style: TextStyle(
            fontSize: 12.sp,
            color: context.colors.text.withValues(alpha: 0.5),
          ),
        ),
      ],
    );
  }
}
