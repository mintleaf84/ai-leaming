import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';

/// 首页两列功能卡（题库 / 智能复习）。
///
/// 从 `dashboard_screen._buildActionCard` 原样搬出（纯搬移，无行为改动）。
class DashboardActionCard extends StatelessWidget {
  const DashboardActionCard({
    super.key,
    required this.icon,
    required this.tag,
    required this.tagColor,
    required this.tagTextColor,
    required this.title,
    required this.subtitleLabel,
    required this.subtitleValue,
  });

  final String icon;
  final String tag;
  final Color tagColor;
  final Color tagTextColor;
  final String title;
  final String subtitleLabel;
  final String subtitleValue;

  @override
  Widget build(BuildContext context) {
    // 固定高度改最小高度：字号放大到 1.3 倍时内容比 176 高，定高会溢出 11px；
    // 用 minHeight 让卡片自己长高（标准字号下渲染完全一致），
    // 同排两张由外层 IntrinsicHeight + stretch 保持等高。
    return Container(
      constraints: BoxConstraints(minHeight: 176.h),
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
            right: 0,
            top: 0,
            child: Padding(
              padding: EdgeInsets.all(16.w),
              child: Opacity(
                opacity: 0.1, // Faded
                child: Text(icon, style: TextStyle(fontSize: 60.sp)),
              ),
            ),
          ),
          Padding(
            padding: EdgeInsets.all(16.w),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
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
                        style: TextStyle(
                          fontSize: 12.sp,
                          color: tagTextColor,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    SizedBox(height: 12.h),
                    Text(
                      title,
                      style: TextStyle(
                        fontSize: 18.sp,
                        fontWeight: FontWeight.bold,
                        color: context.colors.text,
                        height: 1.2,
                      ),
                    ),
                  ],
                ),

                Column(
                  children: [
                    Divider(height: 1, color: context.colors.border),
                    SizedBox(height: 12.h),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        // 原来给副标题写死 80.w，字号放大后「获取所有题目」会被截成
                        // 「获取所有题…」。改成 Flexible：宽度跟着剩余空间走，
                        // 只有真的放不下才省略，箭头永远留在右边。
                        Flexible(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                subtitleLabel,
                                style: TextStyle(
                                  fontSize: 12.sp,
                                  color: context.colors.textSecondary,
                                  letterSpacing: 0.5,
                                ),
                              ),
                              SizedBox(height: 2.h),
                              Text(
                                subtitleValue,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 12.sp,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ),
                        SizedBox(width: 4.w),
                        Icon(
                          AppIcons.arrowForward,
                          size: 16.sp,
                          color: context.colors.text,
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
