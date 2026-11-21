import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import '../../../agent_sets/presentation/widgets/agent_set_unread_badge.dart';

/// 整宽入口卡（错题本 / 练习历史 / 记忆卡 / 试卷 / 继续上次练习共用一种形态）。
///
/// 从 `dashboard_screen._buildWideCard` 原样搬出（纯搬移，无行为改动）。
///
/// 原本是两份逐字重复的实现（只有 emoji、标签、标题、右侧两行字不同），
/// 加第三个入口时合并成一个：三张卡的圆角、阴影、emoji 水印位置、分割线
/// 从此不可能各写一套。
///
/// 右侧那两行（如「累计 / 24 条」「今日到期 / 3 张」）是**真实数据**：
/// 数据没到或取失败时显示「暂无」，绝不写死一个看起来合理的数字
/// （审计 §25 F1/F4：写死「--」「几分钟」会让用户以为数据坏了）。
///
/// `onTap` 为 null 表示入口**禁用**（当前只有离线时的记忆卡）：此时卡片降透明度、
/// 不再响应点击，并在标签下方写出 [disabledNote] 说明原因。禁用而不是隐藏，
/// 是因为用户需要知道「有这个功能，只是现在用不了」。
class DashboardWideCard extends StatelessWidget {
  const DashboardWideCard({
    super.key,
    required this.icon,
    required this.tag,
    required this.tagColor,
    required this.tagTextColor,
    required this.title,
    required this.trailingLabel,
    required this.trailingValue,
    required this.onTap,
    this.disabledNote,
    this.badgeCount = 0,
  });

  final String icon;
  final String tag;
  final Color tagColor;
  final Color tagTextColor;
  final String title;
  final String trailingLabel;
  final String trailingValue;
  final VoidCallback? onTap;
  final String? disabledNote;

  /// 标题旁的数字角标（目前只有「AI 题集」的未读数用它）。0 表示不显示。
  final int badgeCount;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return Semantics(
      button: true,
      enabled: enabled,
      label: enabled ? title : '$title，$disabledNote',
      child: GestureDetector(
        onTap: onTap,
        child: Opacity(
          opacity: enabled ? 1 : 0.55,
          child: Container(
            // 同两列卡：最小高度而不是固定高度，1.3 倍字号时不溢出
            constraints: BoxConstraints(minHeight: 96.h),
            decoration: BoxDecoration(
              color: context.colors.surface,
              borderRadius: BorderRadius.circular(16.r),
              border: Border.all(color: context.colors.border),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.02),
                  blurRadius: 4,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Stack(
              children: [
                Positioned(
                  right: 40.w,
                  top: 0,
                  bottom: 0,
                  child: Center(
                    child: Opacity(
                      opacity: 0.1,
                      child: Text(icon, style: TextStyle(fontSize: 60.sp)),
                    ),
                  ),
                ),
                Padding(
                  padding: EdgeInsets.all(16.w),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      // 标签 + 标题：字号放大时允许两行，不裁字
                      Flexible(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(
                              padding: EdgeInsets.symmetric(
                                horizontal: 6.w,
                                vertical: 2.h,
                              ),
                              decoration: BoxDecoration(
                                color: tagColor,
                                borderRadius: BorderRadius.circular(4.r),
                              ),
                              child: Text(
                                tag,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 12.sp,
                                  color: tagTextColor,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            SizedBox(height: 4.h),
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Flexible(
                                  child: Text(
                                    title,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: 18.sp,
                                      fontWeight: FontWeight.bold,
                                      color: context.colors.text,
                                    ),
                                  ),
                                ),
                                if (badgeCount > 0) ...[
                                  SizedBox(width: 6.w),
                                  AgentSetUnreadBadge(count: badgeCount),
                                ],
                              ],
                            ),
                            if (disabledNote != null) ...[
                              SizedBox(height: 2.h),
                              Text(
                                disabledNote!,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 11.sp,
                                  color: context.colors.textSecondary,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      SizedBox(width: 8.w),
                      Container(
                        decoration: BoxDecoration(
                          border: Border(
                            left: BorderSide(color: context.colors.border),
                          ),
                        ),
                        padding: EdgeInsets.only(left: 16.w),
                        child: Row(
                          children: [
                            Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  trailingLabel,
                                  style: TextStyle(
                                    fontSize: 12.sp,
                                    color: context.colors.textSecondary,
                                  ),
                                ),
                                Text(
                                  trailingValue,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 14.sp,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ],
                            ),
                            SizedBox(width: 8.w),
                            Icon(
                              AppIcons.chevronRight,
                              size: 20.sp,
                              color: context.colors.text,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
