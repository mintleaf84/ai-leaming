import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/navigation/app_nav.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';

/// 首页顶栏：问候语 + 日期 + 「我的」头像入口。
///
/// 从 `dashboard_screen` 原样搬出（纯搬移，无行为改动）。
class DashboardHeader extends StatelessWidget {
  const DashboardHeader({super.key});

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final hour = now.hour;
    String greeting = '我的学习\n空间';
    String emoji = '📖';
    if (hour < 5) {
      greeting = '夜深了,\n还在学习吗?';
      emoji = '🦉';
    } else if (hour < 12) {
      greeting = '早上好,\n开始学习吧!';
      emoji = '🌅';
    } else if (hour < 18) {
      greeting = '下午好,\n继续保持!';
      emoji = '☀️';
    } else {
      greeting = '晚上好,\n总结今日所学';
      emoji = '🌙';
    }

    final weekDays = ['一', '二', '三', '四', '五', '六', '日'];
    final dateStr = '${now.month}月${now.day}日 星期${weekDays[now.weekday - 1]}';

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(child: _Greeting(emoji: emoji, greeting: greeting, dateStr: dateStr)),
        // 「我的」原来是底部导航的一格；导航换成四个高频入口后，
        // 个人中心改由头像入口进入（不占常驻位置，但仍然一步可达）。
        IconButton(
          tooltip: '我的',
          onPressed: () => context.pushDetail(AppRoutes.profile),
          icon: Icon(
            AppIcons.personOutline,
            color: context.colors.text,
            size: 24.sp,
          ),
        ),
      ],
    );
  }
}

class _Greeting extends StatelessWidget {
  const _Greeting({
    required this.emoji,
    required this.greeting,
    required this.dateStr,
  });

  final String emoji;
  final String greeting;
  final String dateStr;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(emoji, style: TextStyle(fontSize: 48.sp)),
        SizedBox(height: 8.h),
        // 问候语保留首页的品牌语气（大字号），但字号/字重走主题档位，
        // 不在这里硬编码 sp；headlineLarge 是主题里最接近原 36sp 粗体的一档。
        Text(
          greeting,
          style: Theme.of(context).textTheme.headlineLarge?.copyWith(
            height: 1.1,
            color: context.colors.text,
          ),
        ),
        SizedBox(height: 4.h),
        Text(
          dateStr,
          style: TextStyle(
            fontSize: 14.sp,
            color: context.colors.textSecondary,
          ),
        ),
      ],
    );
  }
}
