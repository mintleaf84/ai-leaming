import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import '../../domain/question.dart';

/// 题库列表里点一张卡片后的「题目预览」底部弹层。
///
/// 从 `question_list_screen.dart` 原样搬出（同一套 DraggableScrollableSheet
/// 尺寸、同一份文案与按钮）。参数是**屏的** context：弹层挂在同一个 Navigator
/// 上，与原来在 State 里调用完全等价。
void showQuestionPreview(BuildContext context, Question question) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (context) {
      final theme = Theme.of(context);
      return DraggableScrollableSheet(
        initialChildSize: 0.8,
        minChildSize: 0.4,
        maxChildSize: 0.95,
        builder: (context, scrollController) {
          return Container(
            decoration: BoxDecoration(
              color: theme.scaffoldBackgroundColor,
              borderRadius: BorderRadius.vertical(top: Radius.circular(20.r)),
            ),
            child: Column(
              children: [
                // 拖拽手柄（Drag Handle）
                GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  child: Container(
                    width: double.infinity,
                    padding: EdgeInsets.symmetric(vertical: 12.h),
                    alignment: Alignment.center,
                    child: Container(
                      width: 40.w,
                      height: 4.h,
                      decoration: BoxDecoration(
                        color: context.colors.border,
                        borderRadius: BorderRadius.circular(2.r),
                      ),
                    ),
                  ),
                ),
                // 可滚动内容（使用 DraggableScrollableSheet 的 scrollController）
                Expanded(
                  child: ListView(
                    controller: scrollController,
                    padding: EdgeInsets.all(24.w),
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: EdgeInsets.symmetric(
                              horizontal: 8.w,
                              vertical: 4.h,
                            ),
                            decoration: BoxDecoration(
                              color: question.type == 'single'
                                  ? const Color(0xFFE3F2FD)
                                  : const Color(0xFFF3E5F5),
                              borderRadius: BorderRadius.circular(6.r),
                            ),
                            child: Text(
                              question.type == 'single' ? '单选' : '多选',
                              style: TextStyle(
                                fontSize: 12.sp,
                                color: question.type == 'single'
                                    ? const Color(0xFF1976D2)
                                    : const Color(0xFF7B1FA2),
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                          SizedBox(width: 12.w),
                          Expanded(
                            child: Text(
                              question.dimension ?? '综合',
                              style: TextStyle(
                                fontSize: 14.sp,
                                color: context.colors.textSecondary,
                              ),
                            ),
                          ),
                        ],
                      ),
                      SizedBox(height: 24.h),
                      Text(
                        question.content,
                        style: TextStyle(
                          fontSize: 20.sp,
                          fontWeight: FontWeight.w600,
                          height: 1.5,
                          color: theme.colorScheme.onSurface,
                        ),
                      ),
                      SizedBox(height: 32.h),
                      ...question.options.asMap().entries.map((e) {
                        return Container(
                          width: double.infinity,
                          margin: EdgeInsets.only(bottom: 12.h),
                          padding: EdgeInsets.all(16.w),
                          decoration: BoxDecoration(
                            color: context.colors.surfaceAlt,
                            borderRadius: BorderRadius.circular(12.r),
                            border: Border.all(color: context.colors.border),
                          ),
                          child: Text(
                            '${String.fromCharCode(65 + e.key)}. ${e.value}',
                            style: TextStyle(
                              fontSize: 16.sp,
                              color: theme.colorScheme.onSurface,
                            ),
                          ),
                        );
                      }),
                      if (question.explanation != null) ...[
                        SizedBox(height: 24.h),
                        Container(
                          width: double.infinity,
                          padding: EdgeInsets.all(16.w),
                          decoration: BoxDecoration(
                            color: context.colors.accentContainer,
                            borderRadius: BorderRadius.circular(12.r),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Icon(
                                    AppIcons.lightbulbOutline,
                                    color: context.colors.accent,
                                    size: 20.sp,
                                  ),
                                  SizedBox(width: 8.w),
                                  Text(
                                    '解析',
                                    style: TextStyle(
                                      fontSize: 16.sp,
                                      fontWeight: FontWeight.bold,
                                      color: context.colors.accent,
                                    ),
                                  ),
                                ],
                              ),
                              SizedBox(height: 12.h),
                              Text(
                                question.explanation!,
                                style: TextStyle(
                                  fontSize: 15.sp,
                                  height: 1.5,
                                  color: theme.colorScheme.onSurface
                                      .withValues(alpha: 0.8),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                      SizedBox(height: 48.h),
                    ],
                  ),
                ),
                // 底部按钮
                Container(
                  padding: EdgeInsets.all(24.w),
                  decoration: BoxDecoration(
                    color: theme.scaffoldBackgroundColor,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.05),
                        offset: const Offset(0, -4),
                        blurRadius: 8,
                      ),
                    ],
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => Navigator.pop(context),
                          style: OutlinedButton.styleFrom(
                            padding: EdgeInsets.symmetric(vertical: 16.h),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12.r),
                            ),
                          ),
                          child: Text('关闭', style: TextStyle(fontSize: 16.sp)),
                        ),
                      ),
                      SizedBox(width: 16.w),
                      Expanded(
                        flex: 2,
                        child: ElevatedButton(
                          onPressed: () {
                            Navigator.pop(context);
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('单题练习跳转功能准备接管...'),
                              ),
                            );
                          },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: context.colors.accent,
                            foregroundColor: context.colors.onAccent,
                            padding: EdgeInsets.symmetric(vertical: 16.h),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12.r),
                            ),
                          ),
                          child: Text(
                            '加入练习',
                            style: TextStyle(
                              fontSize: 16.sp,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      );
    },
  );
}
