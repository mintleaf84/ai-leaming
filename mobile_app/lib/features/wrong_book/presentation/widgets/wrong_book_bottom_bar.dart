import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/navigation/app_nav.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import '../wrong_book_provider.dart';

/// 错题本底部操作栏：全选 + 「开始练习 (N)」。
///
/// 从 `wrong_book_screen.dart` 原样搬出。`mounted` 判断改为 `context.mounted`：
/// 这里已经没有 State，但语义一致（同一个 Element 是否还挂在树上）。
class WrongBookBottomBar extends ConsumerWidget {
  const WrongBookBottomBar({super.key, required this.state});

  final WrongBookState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = state.selectedIds.length;

    return Container(
      padding: EdgeInsets.only(
        left: 16.w,
        right: 16.w,
        top: 12.h,
        bottom: MediaQuery.of(context).padding.bottom + 12.h,
      ),
      decoration: BoxDecoration(
        color: context.colors.surface,
        border: Border(top: BorderSide(color: context.colors.border)),
      ),
      child: Row(
        children: [
          // 全选
          //
          // 原来是 GestureDetector 包一行图标+文字，命中区只有 20sp 图标那么高，
          // 审计 #5：手指点不中。TextButton 自带 Material/InkWell，最小 44×44。
          TextButton.icon(
            onPressed: () =>
                ref.read(wrongBookControllerProvider.notifier).selectAll(),
            icon: Icon(
              count == state.questions.length
                  ? AppIcons.checkBoxSolid
                  : AppIcons.checkBoxOutlineBlank,
              size: 20.sp,
              color: context.colors.text,
            ),
            label: Text(
              '全选',
              style: TextStyle(fontSize: 13.sp, color: context.colors.text),
            ),
            style: TextButton.styleFrom(
              minimumSize: const Size(44, 44),
              padding: EdgeInsets.symmetric(horizontal: 8.w),
            ),
          ),
          const Spacer(),
          // 开始练习
          SizedBox(
            // 触屏命中区下限 44（审计 #5）
            height: 44.h,
            child: ElevatedButton(
              onPressed: count == 0 || state.isCreatingPractice
                  ? null
                  : () async {
                      final sessionId = await ref
                          .read(wrongBookControllerProvider.notifier)
                          .startPractice();
                      if (sessionId != null && context.mounted) {
                        // 走 extra 传参：/practice 只读 state.extra，用 query 传
                        // sessionId 会被静默忽略、变成随机新练习。
                        context.pushDetail(
                          AppRoutes.practice,
                          extra: {'sessionId': sessionId, 'mode': 'review'},
                          // 回来时页面仍挂载，必须手动刷新：练习会改变错题状态与统计
                          onReturn: () => ref
                              .read(wrongBookControllerProvider.notifier)
                              .loadData(),
                        );
                      } else if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('创建练习失败，请重试')),
                        );
                      }
                    },
              style: ElevatedButton.styleFrom(
                backgroundColor: context.colors.accent,
                foregroundColor: context.colors.onAccent,
                disabledBackgroundColor: context.colors.surfaceAlt,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8.r),
                ),
              ),
              child: state.isCreatingPractice
                  ? SizedBox(
                      width: 18.sp,
                      height: 18.sp,
                      child: CircularProgressIndicator(
                        color: context.colors.onAccent,
                        strokeWidth: 2,
                      ),
                    )
                  : Text(
                      count > 0 ? '开始练习 ($count)' : '请选择题目',
                      style: TextStyle(
                        fontSize: 14.sp,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
