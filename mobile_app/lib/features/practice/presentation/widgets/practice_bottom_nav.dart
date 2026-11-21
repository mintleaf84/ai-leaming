import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/navigation/app_nav.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import '../practice_provider.dart';

/// 练习屏底部导航：上一题 / 确认（或下一题）/ 下一题。
///
/// 从 `practice_screen.dart` 原样搬出。唯一的结构变化：原来「确认」按钮内部
/// 直接 `await submitCurrentAnswer()` 再 `announceStatus(...)`，现在提交动作由
/// 屏通过 [onConfirm] 传入——`announceStatus` 必须留在 `practice_screen.dart`
/// （`test/tool/a11y_rules_test.dart` 按文件路径钉住这条播报）。
class PracticeBottomNav extends ConsumerWidget {
  const PracticeBottomNav({
    super.key,
    required this.state,
    required this.selectedAnswers,
    required this.result,
    required this.onConfirm,
  });

  final PracticeSessionState state;
  final List<String> selectedAnswers;
  final bool? result;
  final VoidCallback onConfirm;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      padding: EdgeInsets.only(
        left: 24.w,
        right: 24.w,
        top: 16.h,
        bottom: 32.h,
      ),
      decoration: BoxDecoration(
        color: context.colors.surface.withValues(alpha: 0.85),
        border: Border(
          top: BorderSide(color: Colors.black.withValues(alpha: 0.05)),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // 上一题
          _NavButton(
            icon: AppIcons.chevronLeft,
            label: '上一题',
            onTap: state.hasPrev
                ? () => ref
                      .read(practiceControllerProvider.notifier)
                      .prevQuestion()
                : null,
          ),
          // 确认/下一题
          _CenterButton(
            selectedAnswers: selectedAnswers,
            result: result,
            hasNext: state.hasNext,
            isConfirming: state.isLoading,
            isMulti: state.currentQuestion?.type == 'multi',
            onConfirm: onConfirm,
          ),
          // 下一题
          _NavButton(
            icon: AppIcons.chevronRight,
            label: '下一题',
            onTap: state.hasNext
                ? () => ref
                      .read(practiceControllerProvider.notifier)
                      .nextQuestion()
                : null,
          ),
        ],
      ),
    );
  }
}

class _NavButton extends StatelessWidget {
  const _NavButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final isEnabled = onTap != null;
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // 视觉尺寸保持 40，命中区撑到 44（Material 最小触控目标）：
          // 外层 44×44 盒子居中放 40 的方按钮，多点出的 2dp 两侧不改变布局观感。
          SizedBox(
            width: 44.w,
            height: 44.h,
            child: Center(
              child: Container(
                width: 40.w,
                height: 40.h,
                decoration: BoxDecoration(
                  color: context.colors.text.withValues(
                    alpha: isEnabled ? 0.05 : 0.02,
                  ),
                  borderRadius: BorderRadius.circular(12.r),
                ),
                child: Icon(
                  icon,
                  color: context.colors.text.withValues(
                    alpha: isEnabled ? 1 : 0.3,
                  ),
                ),
              ),
            ),
          ),
          SizedBox(height: 4.h),
          Text(
            label,
            style: TextStyle(
              fontSize: 12.sp,
              fontWeight: FontWeight.w500,
              color: context.colors.text.withValues(
                alpha: isEnabled ? 0.6 : 0.3,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CenterButton extends ConsumerWidget {
  const _CenterButton({
    required this.selectedAnswers,
    required this.result,
    required this.hasNext,
    required this.isConfirming,
    required this.onConfirm,
    this.isMulti = false,
  });

  final List<String> selectedAnswers;
  final bool? result;
  final bool hasNext;
  final bool isConfirming;
  final VoidCallback onConfirm;
  final bool isMulti;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // 判断是否可以提交
    final bool canSubmit;
    if (isMulti) {
      canSubmit = selectedAnswers.length >= 2; // 多选至少选2项
    } else {
      canSubmit = selectedAnswers.isNotEmpty;
    }
    // 已提交则显示下一题
    if (result != null) {
      return GestureDetector(
        onTap: hasNext
            ? () => ref.read(practiceControllerProvider.notifier).nextQuestion()
            : () => context.replace(AppRoutes.result), // 完成所有题目，跳转结果页
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56.w,
              height: 56.h,
              decoration: BoxDecoration(
                color: context.colors.primary,
                borderRadius: BorderRadius.circular(16.r),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.1),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Icon(
                hasNext ? AppIcons.arrowForward : AppIcons.check,
                color: context.colors.onPrimary,
                size: 28.sp,
              ),
            ),
            SizedBox(height: 4.h),
            Text(
              hasNext ? '下一题' : '完成',
              style: TextStyle(
                fontSize: 12.sp,
                fontWeight: FontWeight.w600,
                color: context.colors.text,
              ),
            ),
          ],
        ),
      );
    }

    // 未选择则显示确认按钮 (禁用)
    // 已选择则显示确认按钮 (启用，如果不在判卷中)
    return GestureDetector(
      onTap: (canSubmit && !isConfirming) ? onConfirm : null,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 56.w,
            height: 56.h,
            decoration: BoxDecoration(
              color: canSubmit
                  ? context.colors.primary
                  : context.colors.primary.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(16.r),
              boxShadow: (canSubmit && !isConfirming)
                  ? [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.1),
                        blurRadius: 8,
                        offset: const Offset(0, 2),
                      ),
                    ]
                  : null,
            ),
            child: isConfirming
                ? Padding(
                    padding: EdgeInsets.all(16.w),
                    child: CircularProgressIndicator(
                      color: context.colors.onPrimary,
                      strokeWidth: 2,
                    ),
                  )
                : Icon(
                    AppIcons.check,
                    color: context.colors.onPrimary,
                    size: 28.sp,
                  ),
          ),
          SizedBox(height: 4.h),
          Text(
            isConfirming ? '判卷中...' : '确认',
            style: TextStyle(
              fontSize: 12.sp,
              fontWeight: FontWeight.w600,
              color: canSubmit
                  ? context.colors.text
                  : context.colors.text.withValues(alpha: 0.4),
            ),
          ),
        ],
      ),
    );
  }
}
