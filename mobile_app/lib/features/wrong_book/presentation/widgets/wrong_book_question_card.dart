import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import '../../domain/wrong_question.dart';
import '../wrong_book_provider.dart';

/// 错题本列表里的一张错题卡（含选中框与「已掌握」按钮）。
///
/// 从 `wrong_book_screen.dart` 原样搬出：选中态由调用方传入，点击仍直接落到
/// 控制器上；骨架屏也复用它（同版式）。
class WrongBookQuestionCard extends ConsumerWidget {
  const WrongBookQuestionCard({
    super.key,
    required this.question,
    required this.isSelected,
  });

  final WrongQuestion question;
  final bool isSelected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final q = question;

    return GestureDetector(
      onTap: () => ref
          .read(wrongBookControllerProvider.notifier)
          .toggleSelect(q.questionId),
      child: Container(
        padding: EdgeInsets.all(14.w),
        decoration: BoxDecoration(
          color: context.colors.surface,
          borderRadius: BorderRadius.circular(12.r),
          border: Border.all(
            color: isSelected ? context.colors.accent : context.colors.border,
            width: isSelected ? 1.5 : 1,
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 复选框
            Container(
              width: 22.w,
              height: 22.w,
              margin: EdgeInsets.only(top: 2.h, right: 12.w),
              decoration: BoxDecoration(
                color: isSelected ? context.colors.accent : Colors.transparent,
                borderRadius: BorderRadius.circular(6.r),
                border: Border.all(
                  color: isSelected
                      ? context.colors.accent
                      : context.colors.border,
                  width: 1.5,
                ),
              ),
              child: isSelected
                  ? Icon(
                      AppIcons.check,
                      size: 14.sp,
                      color: context.colors.onAccent,
                    )
                  : null,
            ),
            // 内容
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    q.questionContent,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 14.sp,
                      fontWeight: FontWeight.w500,
                      color: context.colors.text,
                      height: 1.4,
                    ),
                  ),
                  SizedBox(height: 8.h),
                  Row(
                    children: [
                      // 错误次数
                      Container(
                        padding: EdgeInsets.symmetric(
                          horizontal: 6.w,
                          vertical: 2.h,
                        ),
                        decoration: BoxDecoration(
                          color: context.colors.errorContainer,
                          borderRadius: BorderRadius.circular(4.r),
                        ),
                        child: Text(
                          '错 ${q.wrongCount} 次',
                          style: TextStyle(
                            fontSize: 10.sp,
                            fontWeight: FontWeight.w600,
                            color: context.colors.error,
                          ),
                        ),
                      ),
                      SizedBox(width: 6.w),
                      // 标签：后端自由文本，可能是很长的一句知识点名。
                      // 必须占位并单行省略——否则和右侧 44dp 的按钮同排，
                      // 长标签会把这一行撑出屏幕（RenderFlex overflow）。
                      // 用 Expanded + Align 而不是 Spacer：标签短时 chip 仍按内容
                      // 宽度靠左（Align 不拉伸），长时吃满剩余宽度再省略。
                      if (q.tags.isNotEmpty)
                        Expanded(
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child: Container(
                              padding: EdgeInsets.symmetric(
                                horizontal: 6.w,
                                vertical: 2.h,
                              ),
                              decoration: BoxDecoration(
                                color: context.colors.surfaceAlt,
                                borderRadius: BorderRadius.circular(4.r),
                              ),
                              child: Text(
                                q.tags.first,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 12.sp,
                                  color: context.colors.textSecondary,
                                ),
                              ),
                            ),
                          ),
                        )
                      else
                        const Spacer(),
                      // 标记已掌握按钮
                      //
                      // 原来是 GestureDetector 包 11sp 的纯文字（实测约 33×15），
                      // 审计 #5：手指点不中。改 TextButton 并锁死最小 44×44。
                      TextButton(
                        onPressed: () {
                          ref
                              .read(wrongBookControllerProvider.notifier)
                              .markAsMastered(q.questionId);
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('已标记为掌握 ✅'),
                              duration: Duration(seconds: 1),
                            ),
                          );
                        },
                        style: TextButton.styleFrom(
                          foregroundColor: context.colors.success,
                          minimumSize: const Size(44, 44),
                          padding: EdgeInsets.symmetric(horizontal: 4.w),
                        ),
                        child: Text(
                          '已掌握',
                          style: TextStyle(
                            fontSize: 12.sp,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
