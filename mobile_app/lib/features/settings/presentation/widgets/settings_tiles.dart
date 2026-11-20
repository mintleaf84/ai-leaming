import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_icons.dart';

/// 设置页的四个原子件：分组标题 / 卡片 / 行 / 分隔线 / 头像行。
///
/// 从 `settings_screen.dart` 逐个原样搬出，颜色仍由调用方显式传入（与原来一样
/// 取自 Theme），因此版式与深浅色表现完全不变。
class SettingsSectionTitle extends StatelessWidget {
  const SettingsSectionTitle({
    super.key,
    required this.title,
    required this.color,
  });

  final String title;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(left: 4.w, bottom: 8.h),
      child: Text(
        title,
        style: TextStyle(
          fontSize: 12.sp,
          fontWeight: FontWeight.w600,
          color: color,
          letterSpacing: 1,
        ),
      ),
    );
  }
}

class SettingsCard extends StatelessWidget {
  const SettingsCard({
    super.key,
    required this.cardColor,
    required this.borderColor,
    required this.children,
  });

  final Color cardColor;
  final Color borderColor;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: cardColor,
        borderRadius: BorderRadius.circular(12.r),
        border: Border.all(color: borderColor),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.02),
            blurRadius: 3,
            offset: const Offset(0, 1),
          ),
        ],
      ),
      child: Column(children: children),
    );
  }
}

class SettingsTile extends StatelessWidget {
  const SettingsTile({
    super.key,
    required this.icon,
    required this.title,
    required this.textColor,
    this.trailing,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final Color textColor;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: 14.w, vertical: 14.h),
        child: Row(
          children: [
            Icon(icon, size: 22.sp, color: textColor),
            SizedBox(width: 12.w),
            Expanded(
              child: Text(
                title,
                style: TextStyle(
                  fontSize: 15.sp,
                  fontWeight: FontWeight.w500,
                  color: textColor,
                ),
              ),
            ),
            if (trailing != null) trailing!,
          ],
        ),
      ),
    );
  }
}

class SettingsDivider extends StatelessWidget {
  const SettingsDivider({super.key, required this.borderColor});

  final Color borderColor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(left: 52.w),
      child: Divider(height: 1, color: borderColor),
    );
  }
}

/// 头像行（点击仍是「功能开发中」提示，文案由调用方传入）。
class SettingsAvatarTile extends StatelessWidget {
  const SettingsAvatarTile({
    super.key,
    required this.textColor,
    required this.secondaryColor,
    required this.onTap,
  });

  final Color textColor;
  final Color secondaryColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: 14.w, vertical: 12.h),
        child: Row(
          children: [
            Container(
              width: 40.w,
              height: 40.h,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: secondaryColor.withValues(alpha: 0.3),
                ),
                image: const DecorationImage(
                  image: NetworkImage(
                    'https://ui-avatars.com/api/?name=N&background=37352F&color=fff',
                  ),
                  fit: BoxFit.cover,
                ),
              ),
            ),
            SizedBox(width: 12.w),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '修改头像',
                    style: TextStyle(
                      fontSize: 15.sp,
                      fontWeight: FontWeight.w500,
                      color: textColor,
                    ),
                  ),
                  Text(
                    '点击上传新照片',
                    style: TextStyle(fontSize: 13.sp, color: secondaryColor),
                  ),
                ],
              ),
            ),
            Icon(
              AppIcons.arrowForwardIos,
              size: 16.sp,
              color: secondaryColor.withValues(alpha: 0.7),
            ),
          ],
        ),
      ),
    );
  }
}
