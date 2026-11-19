import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:go_router/go_router.dart';

import '../theme/app_colors.dart';
import '../theme/app_icons.dart';

/// 底部导航的四个高频入口（备考主路径）。
///
/// 为什么只有四个：这个 App 的真实用法是「每天 45 分钟」，从打开到开始今天的
/// 第一道题要几步才是判据。首页 / 练习 / 记忆卡 / 错题本 是每天都会碰的；
/// AI 助手、知识库、教材库、我的属于「偶尔进」，走首页卡片与「我的」里的
/// 快捷导航，不占常驻位置。
///
/// 为什么由 shell 持有导航条：四个入口是**平级**的，导航条必须活在四个页面
/// 之外，否则每个页面各画一条，切换时会出现「导航条跟着页面一起重建」的闪动，
/// 也无法保证「切 tab 不堆栈」。
class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.navigationShell});

  /// go_router 的 `StatefulShellRoute.indexedStack` 交给 shell 的句柄。
  ///
  /// `goBranch(i)` 是**切 tab**（`go` 语义，替换当前分支栈），不是 push：
  /// 连点四个 tab 不会把页面叠起来，返回键在 tab 根页直接退出 App。
  final StatefulNavigationShell navigationShell;

  static const List<_ShellTab> _tabs = <_ShellTab>[
    _ShellTab(icon: AppIcons.dashboard, label: '首页'),
    _ShellTab(icon: AppIcons.playCircleOutline, label: '练习'),
    _ShellTab(icon: AppIcons.styleOutlined, label: '记忆卡'),
    _ShellTab(icon: AppIcons.errorOutline, label: '错题本'),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.colors.background,
      body: navigationShell,
      bottomNavigationBar: _buildBottomNav(context),
    );
  }

  Widget _buildBottomNav(BuildContext context) {
    return Container(
      padding: EdgeInsets.only(
        top: 12.h,
        bottom: 24.h,
        left: 16.w,
        right: 16.w,
      ),
      decoration: BoxDecoration(
        color: context.colors.surface,
        border: Border(top: BorderSide(color: context.colors.border)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.02),
            offset: const Offset(0, -4),
            blurRadius: 6,
          ),
        ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          for (var i = 0; i < _tabs.length; i++)
            _buildNavItem(
              context,
              _tabs[i],
              selected: navigationShell.currentIndex == i,
              onTap: () => navigationShell.goBranch(i),
            ),
        ],
      ),
    );
  }

  Widget _buildNavItem(
    BuildContext context,
    _ShellTab tab, {
    required bool selected,
    required VoidCallback onTap,
  }) {
    final activeColor = context.colors.text;
    final inactiveColor = context.colors.textSecondary;

    return Semantics(
      button: true,
      selected: selected,
      child: GestureDetector(
        // 测试按 tab 名定位（`find.byKey(ValueKey('shell_tab_练习'))`）：
        // 文字在页面里可能重复，key 不会。
        key: ValueKey<String>('shell_tab_${tab.label}'),
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Container(
          // 触控区 ≥44×44（图标 24 + 文字 12 + 间距），
          // 四等分后窄屏也不会挤到一起
          padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 4.h),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AnimatedScale(
                scale: selected ? 1.1 : 1.0,
                duration: const Duration(milliseconds: 200),
                curve: Curves.easeOutBack,
                child: Icon(
                  tab.icon,
                  size: 24.sp,
                  color: selected ? activeColor : inactiveColor,
                ),
              ),
              SizedBox(height: 4.h),
              AnimatedDefaultTextStyle(
                duration: const Duration(milliseconds: 200),
                style: TextStyle(
                  fontSize: 12.sp,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  color: selected ? activeColor : inactiveColor,
                ),
                child: Text(tab.label),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ShellTab {
  const _ShellTab({required this.icon, required this.label});

  final IconData icon;
  final String label;
}
