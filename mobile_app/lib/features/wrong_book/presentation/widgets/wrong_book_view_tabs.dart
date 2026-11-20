import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../wrong_book_provider.dart';

/// 错题本视图切换（列表 / 按知识点）。
///
/// 从 `wrong_book_screen.dart` 原样搬出；点击仍直接落到控制器上。
class WrongBookViewTabs extends ConsumerWidget {
  const WrongBookViewTabs({super.key, required this.current});

  final WrongBookViewMode current;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      margin: EdgeInsets.symmetric(horizontal: 16.w),
      padding: EdgeInsets.all(4.w),
      decoration: BoxDecoration(
        color: context.colors.surface,
        borderRadius: BorderRadius.circular(10.r),
        border: Border.all(color: context.colors.border),
      ),
      child: Row(
        children: [
          _Tab(
            label: '列表',
            mode: WrongBookViewMode.list,
            current: current,
            onTap: (mode) =>
                ref.read(wrongBookControllerProvider.notifier).setViewMode(mode),
          ),
          _Tab(
            label: '按知识点',
            mode: WrongBookViewMode.byTag,
            current: current,
            onTap: (mode) =>
                ref.read(wrongBookControllerProvider.notifier).setViewMode(mode),
          ),
          // 「已掌握」页签已移除：服务端只有 `POST/DELETE /wrong-book/:id/master`，
          // 没有「已掌握列表」接口（`GET /wrong-book` 反而把已掌握题目排除掉），
          // 留着页签就是点了永远空的入口。补上接口（服务端已有
          // `wrongQuestionService.getMasteredQuestions`，缺一条路由）后再恢复。
        ],
      ),
    );
  }
}

class _Tab extends StatelessWidget {
  const _Tab({
    required this.label,
    required this.mode,
    required this.current,
    required this.onTap,
  });

  final String label;
  final WrongBookViewMode mode;
  final WrongBookViewMode current;
  final ValueChanged<WrongBookViewMode> onTap;

  @override
  Widget build(BuildContext context) {
    final isSelected = mode == current;
    return Expanded(
      child: GestureDetector(
        onTap: () => onTap(mode),
        child: Container(
          padding: EdgeInsets.symmetric(vertical: 10.h),
          decoration: BoxDecoration(
            color: isSelected ? context.colors.primary : Colors.transparent,
            borderRadius: BorderRadius.circular(8.r),
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13.sp,
              fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
              color: isSelected
                  ? context.colors.onPrimary
                  : context.colors.text,
            ),
          ),
        ),
      ),
    );
  }
}
