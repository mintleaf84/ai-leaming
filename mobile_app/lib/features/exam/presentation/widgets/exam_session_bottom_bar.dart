import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import 'exam_bar_button.dart';

/// 作答屏底部：交卷状态/失败提示 + 上一题、答题卡、下一题（最后一题变交卷）。
class ExamSessionBottomBar extends StatelessWidget {
  const ExamSessionBottomBar({
    super.key,
    required this.colors,
    required this.isLast,
    required this.submitting,
    required this.submitError,
    required this.editingLocked,
    required this.onPrev,
    required this.onNext,
    required this.onOpenAnswerSheet,
    required this.onConfirmSubmit,
  });

  final AppColors colors;
  final bool isLast;
  final bool submitting;

  /// 上一次交卷失败的原因；为空表示没有错误可展示。
  final String? submitError;

  /// 结果未知（超时/断网/5xx）时锁住作答，重试重放同一份载荷。
  final bool editingLocked;
  final VoidCallback? onPrev;
  final VoidCallback onNext;
  final VoidCallback onOpenAnswerSheet;
  final VoidCallback onConfirmSubmit;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(16.w, 10.h, 16.w, 10.h),
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(top: BorderSide(color: colors.border)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (submitting) ...[
              Row(
                children: [
                  SizedBox(
                    width: 12.w,
                    height: 12.w,
                    child: const CircularProgressIndicator(strokeWidth: 2),
                  ),
                  SizedBox(width: 8.w),
                  Text(
                    '正在交卷…',
                    style: TextStyle(
                      fontSize: 12.sp,
                      color: colors.textSecondary,
                    ),
                  ),
                ],
              ),
              SizedBox(height: 8.h),
            ] else if (submitError != null) ...[
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(AppIcons.errorOutline, size: 14.sp, color: colors.error),
                  SizedBox(width: 6.w),
                  Expanded(
                    child: Text(
                      editingLocked
                          ? '交卷没成功：$submitError 答案已锁定，重试会提交刚才那一份。'
                          : '交卷没成功：$submitError 答案还在，可以再交一次。',
                      style: TextStyle(
                        fontSize: 12.sp,
                        height: 1.5,
                        color: colors.error,
                      ),
                    ),
                  ),
                ],
              ),
              SizedBox(height: 8.h),
            ],
            Row(
              children: [
                Expanded(
                  child: ExamBarButton(
                    label: '上一题',
                    icon: AppIcons.chevronLeft,
                    colors: colors,
                    onPressed: onPrev,
                  ),
                ),
                SizedBox(width: 8.w),
                Expanded(
                  child: ExamBarButton(
                    label: '答题卡',
                    icon: AppIcons.formatListNumbered,
                    colors: colors,
                    onPressed: submitting ? null : onOpenAnswerSheet,
                  ),
                ),
                SizedBox(width: 8.w),
                Expanded(
                  child: SizedBox(
                    height: 44,
                    child: isLast
                        ? FilledButton(
                            onPressed: submitting ? null : onConfirmSubmit,
                            style: FilledButton.styleFrom(
                              backgroundColor: colors.primary,
                              foregroundColor: colors.onPrimary,
                              padding: EdgeInsets.zero,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10.r),
                              ),
                            ),
                            child: Text(
                              '交卷',
                              style: TextStyle(
                                fontSize: 13.sp,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          )
                        : ExamBarButton(
                            label: '下一题',
                            icon: AppIcons.chevronRight,
                            trailingIcon: true,
                            colors: colors,
                            onPressed: submitting ? null : onNext,
                          ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
