import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/wrong_question.dart';

/// 错题本「按知识点」视图：每个知识点一个可展开分组。
///
/// 从 `wrong_book_screen.dart` 原样搬出；空态仍由调用方决定（这里只负责有数据
/// 时的渲染），避免把「没有错题」的出口藏进子组件。
class WrongBookTagView extends StatelessWidget {
  const WrongBookTagView({super.key, required this.groups});

  final List<WrongQuestionsByTag> groups;

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: EdgeInsets.all(16.w),
      itemCount: groups.length,
      itemBuilder: (context, index) {
        final group = groups[index];
        return Container(
          margin: EdgeInsets.only(bottom: 10.h),
          decoration: BoxDecoration(
            color: context.colors.surface,
            borderRadius: BorderRadius.circular(12.r),
            border: Border.all(color: context.colors.border),
          ),
          child: ExpansionTile(
            tilePadding: EdgeInsets.symmetric(horizontal: 16.w),
            childrenPadding: EdgeInsets.fromLTRB(16.w, 0, 16.w, 12.h),
            title: Row(
              children: [
                // 知识点名同样是后端自由文本：Expanded 占满剩余宽度（替代原来的
                // Spacer），Align 让 chip 仍按内容宽度靠左，超长时单行省略。
                Expanded(
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: 8.w,
                        vertical: 4.h,
                      ),
                      decoration: BoxDecoration(
                        color: context.colors.accentContainer,
                        borderRadius: BorderRadius.circular(6.r),
                      ),
                      child: Text(
                        group.tag,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 13.sp,
                          fontWeight: FontWeight.w600,
                          color: context.colors.accent,
                        ),
                      ),
                    ),
                  ),
                ),
                SizedBox(width: 8.w),
                Text(
                  '${group.count} 题',
                  style: TextStyle(
                    fontSize: 12.sp,
                    color: context.colors.textSecondary,
                  ),
                ),
              ],
            ),
            children: group.questions.map((q) {
              return Padding(
                padding: EdgeInsets.only(bottom: 8.h),
                child: Row(
                  children: [
                    Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: 5.w,
                        vertical: 2.h,
                      ),
                      decoration: BoxDecoration(
                        color: context.colors.errorContainer,
                        borderRadius: BorderRadius.circular(4.r),
                      ),
                      child: Text(
                        '×${q.wrongCount}',
                        style: TextStyle(
                          fontSize: 10.sp,
                          fontWeight: FontWeight.bold,
                          color: context.colors.error,
                        ),
                      ),
                    ),
                    SizedBox(width: 8.w),
                    Expanded(
                      child: Text(
                        q.questionContent,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 13.sp,
                          color: context.colors.text,
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
        );
      },
    );
  }
}
