import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:go_router/go_router.dart';
import 'settings_provider.dart';
import '../../../core/theme/theme_provider.dart';

/// 设置页面
///
/// Notion 风格的设置界面，支持深色模式。
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  // 模拟数据 (后续可从 Provider 获取)
  String userName = 'NotionUser';
  String userEmail = 'user@example.com';
  int dailyGoal = 50;
  bool notificationEnabled = true;

  @override
  Widget build(BuildContext context) {
    final themeMode = ref.watch(themeModeProvider);
    final settingsState = ref.watch(settingsProvider);
    final reviewMode = settingsState.reviewMode;
    final isDarkMode =
        themeMode == ThemeMode.dark ||
        (themeMode == ThemeMode.system &&
            MediaQuery.platformBrightnessOf(context) == Brightness.dark);

    // 主题颜色
    final theme = Theme.of(context);
    final bgColor = theme.scaffoldBackgroundColor;
    final cardColor = theme.cardColor;
    final textColor = theme.colorScheme.onSurface;
    final secondaryColor = isDarkMode
        ? const Color(0xFF8A8A8A)
        : const Color(0xFF787774);
    final borderColor = theme.dividerColor;

    return Scaffold(
      backgroundColor: bgColor,
      body: SafeArea(
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header with back button
              Padding(
                padding: EdgeInsets.fromLTRB(8.w, 16.h, 24.w, 24.h),
                child: Row(
                  children: [
                    IconButton(
                      onPressed: () => context.go('/dashboard'),
                      icon: Icon(Icons.arrow_back, color: textColor),
                    ),
                    Text('⚙️', style: TextStyle(fontSize: 32.sp)),
                    SizedBox(width: 12.w),
                    Text(
                      '设置',
                      style: TextStyle(
                        fontSize: 32.sp,
                        fontWeight: FontWeight.bold,
                        color: textColor,
                      ),
                    ),
                  ],
                ),
              ),
              // 内容区域
              Padding(
                padding: EdgeInsets.symmetric(horizontal: 20.w),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // 个人账户
                    _buildSectionTitle('个人账户', secondaryColor),
                    _buildCard(
                      cardColor: cardColor,
                      borderColor: borderColor,
                      children: [
                        _buildTileWithAvatar(textColor, secondaryColor),
                        _buildDivider(borderColor),
                        _buildSettingsTile(
                          icon: Icons.person_outline,
                          title: '用户名',
                          trailing: Text(
                            userName,
                            style: TextStyle(
                              fontSize: 14.sp,
                              color: secondaryColor,
                            ),
                          ),
                          textColor: textColor,
                        ),
                        _buildDivider(borderColor),
                        _buildSettingsTile(
                          icon: Icons.mail_outline,
                          title: '邮箱',
                          trailing: Text(
                            userEmail,
                            style: TextStyle(
                              fontSize: 14.sp,
                              color: secondaryColor,
                            ),
                          ),
                          textColor: textColor,
                        ),
                      ],
                    ),
                    SizedBox(height: 24.h),
                    // 学习设置
                    _buildSectionTitle('学习设置', secondaryColor),
                    _buildCard(
                      cardColor: cardColor,
                      borderColor: borderColor,
                      children: [
                        _buildSettingsTile(
                          icon: Icons.flag_outlined,
                          title: '每日学习目标',
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                '$dailyGoal 题',
                                style: TextStyle(
                                  fontSize: 14.sp,
                                  color: secondaryColor,
                                ),
                              ),
                              SizedBox(width: 4.w),
                              Icon(
                                Icons.arrow_forward_ios,
                                size: 16.sp,
                                color: secondaryColor.withValues(alpha: 0.7),
                              ),
                            ],
                          ),
                          textColor: textColor,
                          onTap: () =>
                              _showDailyGoalPicker(textColor, borderColor),
                        ),
                        _buildDivider(borderColor),
                        _buildSettingsTile(
                          icon: Icons.view_carousel_outlined,
                          title: '沉浸式复习',
                          trailing: Switch(
                            value: reviewMode == ReviewMode.immersive,
                            onChanged: (value) {
                              ref
                                  .read(settingsProvider.notifier)
                                  .setReviewMode(
                                    value
                                        ? ReviewMode.immersive
                                        : ReviewMode.list,
                                  );
                            },
                            activeTrackColor: const Color(0xFF2383E2),
                          ),
                          textColor: textColor,
                        ),

                        _buildDivider(borderColor),
                        _buildSettingsTile(
                          icon: Icons.dark_mode_outlined,
                          title: '深色模式',
                          trailing: Switch(
                            value: isDarkMode,
                            onChanged: (value) {
                              ref.read(themeModeProvider.notifier).toggle();
                            },
                            activeTrackColor: const Color(0xFF2383E2),
                          ),
                          textColor: textColor,
                        ),
                        _buildDivider(borderColor),
                        _buildSettingsTile(
                          icon: Icons.notifications_outlined,
                          title: '提醒通知',
                          trailing: Switch(
                            value: notificationEnabled,
                            onChanged: (value) {
                              setState(() {
                                notificationEnabled = value;
                              });
                            },
                            activeTrackColor: const Color(0xFF2383E2),
                          ),
                          textColor: textColor,
                        ),
                      ],
                    ),
                    SizedBox(height: 24.h),
                    // 数据管理
                    _buildSectionTitle('数据管理', secondaryColor),
                    _buildCard(
                      cardColor: cardColor,
                      borderColor: borderColor,
                      children: [
                        _buildSettingsTile(
                          icon: Icons.cloud_upload_outlined,
                          title: '备份笔记',
                          trailing: Icon(
                            Icons.arrow_forward_ios,
                            size: 16.sp,
                            color: secondaryColor.withValues(alpha: 0.7),
                          ),
                          textColor: textColor,
                          onTap: () => _showSnackBar('备份功能开发中...'),
                        ),
                        _buildDivider(borderColor),
                        _buildSettingsTile(
                          icon: Icons.delete_outline,
                          title: '清空错题本',
                          trailing: Icon(
                            Icons.arrow_forward_ios,
                            size: 16.sp,
                            color: secondaryColor.withValues(alpha: 0.7),
                          ),
                          textColor: textColor,
                          onTap: () => _showClearConfirmDialog(),
                        ),
                      ],
                    ),
                    SizedBox(height: 24.h),
                    // 关于
                    _buildSectionTitle('关于', secondaryColor),
                    _buildCard(
                      cardColor: cardColor,
                      borderColor: borderColor,
                      children: [
                        _buildSettingsTile(
                          icon: Icons.info_outline,
                          title: '版本号',
                          trailing: Text(
                            'v1.2.0',
                            style: TextStyle(
                              fontSize: 14.sp,
                              color: secondaryColor,
                            ),
                          ),
                          textColor: textColor,
                        ),
                        Divider(height: 1, color: borderColor),
                        InkWell(
                          onTap: () => _showLogoutConfirmDialog(),
                          child: Container(
                            width: double.infinity,
                            padding: EdgeInsets.symmetric(vertical: 14.h),
                            alignment: Alignment.center,
                            child: Text(
                              '退出登录',
                              style: TextStyle(
                                fontSize: 15.sp,
                                fontWeight: FontWeight.w500,
                                color: const Color(0xFFEB5757),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: 32.h),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSectionTitle(String title, Color color) {
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

  Widget _buildCard({
    required Color cardColor,
    required Color borderColor,
    required List<Widget> children,
  }) {
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

  Widget _buildTileWithAvatar(Color textColor, Color secondaryColor) {
    return InkWell(
      onTap: () => _showSnackBar('头像上传功能开发中...'),
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
              Icons.arrow_forward_ios,
              size: 16.sp,
              color: secondaryColor.withValues(alpha: 0.7),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSettingsTile({
    required IconData icon,
    required String title,
    required Color textColor,
    Widget? trailing,
    VoidCallback? onTap,
  }) {
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
            if (trailing != null) trailing,
          ],
        ),
      ),
    );
  }

  Widget _buildDivider(Color borderColor) {
    return Padding(
      padding: EdgeInsets.only(left: 52.w),
      child: Divider(height: 1, color: borderColor),
    );
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  void _showDailyGoalPicker(Color textColor, Color borderColor) {
    showModalBottomSheet(
      context: context,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16.r)),
      ),
      builder: (context) {
        return Container(
          padding: EdgeInsets.all(24.w),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '每日学习目标',
                style: TextStyle(
                  fontSize: 18.sp,
                  fontWeight: FontWeight.bold,
                  color: textColor,
                ),
              ),
              SizedBox(height: 16.h),
              Wrap(
                spacing: 12.w,
                runSpacing: 12.h,
                children: [20, 30, 50, 80, 100].map((goal) {
                  final isSelected = dailyGoal == goal;
                  return GestureDetector(
                    onTap: () {
                      setState(() {
                        dailyGoal = goal;
                      });
                      Navigator.pop(context);
                    },
                    child: Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: 20.w,
                        vertical: 12.h,
                      ),
                      decoration: BoxDecoration(
                        color: isSelected ? textColor : Colors.transparent,
                        borderRadius: BorderRadius.circular(8.r),
                        border: Border.all(
                          color: isSelected ? textColor : borderColor,
                        ),
                      ),
                      child: Text(
                        '$goal 题',
                        style: TextStyle(
                          fontSize: 14.sp,
                          fontWeight: FontWeight.w500,
                          color: isSelected
                              ? Theme.of(context).scaffoldBackgroundColor
                              : textColor,
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
              SizedBox(height: 24.h),
            ],
          ),
        );
      },
    );
  }

  void _showClearConfirmDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('清空错题本'),
        content: const Text('确定要清空所有错题吗？此操作不可撤销。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _showSnackBar('错题本已清空');
            },
            child: const Text('确定', style: TextStyle(color: Color(0xFFEB5757))),
          ),
        ],
      ),
    );
  }

  void _showLogoutConfirmDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('退出登录'),
        content: const Text('确定要退出当前账号吗？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              context.go('/login');
            },
            child: const Text('退出', style: TextStyle(color: Color(0xFFEB5757))),
          ),
        ],
      ),
    );
  }
}
