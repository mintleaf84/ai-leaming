import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../../../core/navigation/app_nav.dart';
import 'settings_provider.dart';
import '../../../core/theme/theme_provider.dart';
import '../../auth/presentation/auth_provider.dart';
import '../../profile/presentation/profile_provider.dart';
import '../../../core/sync/sync_providers.dart';
import '../../../core/network/server_config.dart';
import '../../../shared/widgets/server_address_form.dart';
import '../../../core/theme/app_icons.dart';

/// 设置页面
///
/// Notion 风格的设置界面，支持深色模式。
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  // 每日学习目标：后端 users 表暂无该字段，仅保存在页面状态里（不落盘，切页即回到默认值）。
  int dailyGoal = 50;
  bool notificationEnabled = true;

  /// 本地已缓存题目数。只在初始化时查一次库，避免每次 rebuild 重新发起查询。
  late final Future<int> _cachedCountFuture;

  @override
  void initState() {
    super.initState();
    _cachedCountFuture = ref
        .read(localPracticeStoreProvider)
        .cachedQuestionCount();
    // 首帧前拉取一次真实资料；用 microtask 避开构建期改写 Provider 状态。
    Future.microtask(
      () => ref.read(profileControllerProvider.notifier).load(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final themeMode = ref.watch(themeModeProvider);
    final settingsState = ref.watch(settingsProvider);
    final reviewMode = settingsState.reviewMode;
    final profile = ref.watch(profileControllerProvider).profile;
    final serverConfig = ref.watch(serverConfigProvider);
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
                      onPressed: () => context.backOrHome(),
                      icon: Icon(AppIcons.arrowBack, color: textColor),
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
                          icon: AppIcons.personOutline,
                          title: '用户名',
                          trailing: Text(
                            profile?.username ?? '未登录',
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
                          icon: AppIcons.flagOutlined,
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
                                AppIcons.arrowForwardIos,
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
                          icon: AppIcons.viewCarouselOutlined,
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
                          icon: AppIcons.darkModeOutlined,
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
                          icon: AppIcons.notificationsOutlined,
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
                          icon: AppIcons.cleaningServicesOutlined,
                          title: '清理缓存',
                          trailing: _buildCachedCountTrailing(secondaryColor),
                          textColor: textColor,
                          onTap: () => _showClearCacheDialog(),
                        ),
                        _buildDivider(borderColor),
                        _buildSettingsTile(
                          icon: AppIcons.deleteOutline,
                          title: '清空错题本',
                          trailing: Icon(
                            AppIcons.arrowForwardIos,
                            size: 16.sp,
                            color: secondaryColor.withValues(alpha: 0.7),
                          ),
                          textColor: textColor,
                          onTap: () => _showClearConfirmDialog(),
                        ),
                        _buildDivider(borderColor),
                        _buildSettingsTile(
                          icon: AppIcons.cloudUploadOutlined,
                          title: '同步离线记录',
                          trailing: _buildPendingTrailing(secondaryColor),
                          textColor: textColor,
                          onTap: _syncOfflineAnswers,
                        ),
                      ],
                    ),
                    SizedBox(height: 24.h),
                    // 服务器
                    _buildSectionTitle('服务器', secondaryColor),
                    _buildCard(
                      cardColor: cardColor,
                      borderColor: borderColor,
                      children: [
                        _buildSettingsTile(
                          icon: AppIcons.dnsOutlined,
                          title: '服务器地址',
                          trailing: serverConfig.isConfigured
                              ? Text(
                                  '已生效',
                                  style: TextStyle(
                                    fontSize: 14.sp,
                                    color: secondaryColor,
                                  ),
                                )
                              : Text(
                                  '未配置',
                                  style: TextStyle(
                                    fontSize: 14.sp,
                                    color: const Color(0xFFEB5757),
                                  ),
                                ),
                          textColor: textColor,
                        ),
                        _buildDivider(borderColor),
                        // 输入框初始值即当前生效地址；格式校验与保存失败都经
                        // ServerConfigState.errorMessage 在表单内展示（不弹 toast）。
                        Padding(
                          padding: EdgeInsets.fromLTRB(14.w, 8.h, 14.w, 14.h),
                          child: ServerAddressForm(
                            initialValue: serverConfig.effectiveBaseUrl,
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: 24.h),
                    // 关于与反馈
                    _buildSectionTitle('关于与反馈', secondaryColor),
                    _buildCard(
                      cardColor: cardColor,
                      borderColor: borderColor,
                      children: [
                        _buildSettingsTile(
                          icon: AppIcons.feedbackOutlined,
                          title: '反馈建议',
                          trailing: Icon(
                            AppIcons.arrowForwardIos,
                            size: 16.sp,
                            color: secondaryColor.withValues(alpha: 0.7),
                          ),
                          textColor: textColor,
                          onTap: () => _showFeedbackDialog(),
                        ),
                        _buildDivider(borderColor),
                        _buildSettingsTile(
                          icon: AppIcons.infoOutline,
                          title: '当前版本',
                          trailing: Text(
                            'v1.2.0',
                            style: TextStyle(
                              fontSize: 14.sp,
                              color: secondaryColor,
                            ),
                          ),
                          textColor: textColor,
                          onTap: () => _showAboutDialog(),
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

  /// 待同步条数：读本地库，没有待同步记录时不打扰用户。
  Widget _buildPendingTrailing(Color secondaryColor) {
    return FutureBuilder<int>(
      future: ref.read(localPracticeStoreProvider).pendingCount(),
      builder: (context, snapshot) {
        final pending = snapshot.data ?? 0;
        if (snapshot.connectionState != ConnectionState.done) {
          return SizedBox(
            width: 14.w,
            height: 14.w,
            child: const CircularProgressIndicator(strokeWidth: 2),
          );
        }
        return Text(
          pending == 0 ? '已同步' : '待同步 $pending 条',
          style: TextStyle(fontSize: 14.sp, color: secondaryColor),
        );
      },
    );
  }

  /// 已缓存题目数：真实读本地库，不再写死存储容量。
  Widget _buildCachedCountTrailing(Color secondaryColor) {
    return FutureBuilder<int>(
      future: _cachedCountFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return SizedBox(
            width: 14.w,
            height: 14.w,
            child: const CircularProgressIndicator(strokeWidth: 2),
          );
        }
        return Text(
          '已缓存 ${snapshot.data ?? 0} 题',
          style: TextStyle(fontSize: 14.sp, color: secondaryColor),
        );
      },
    );
  }

  /// 手动触发一次离线记录补交，并把真实结果告诉用户（不再假装"连接中"）。
  Future<void> _syncOfflineAnswers() async {
    final store = ref.read(localPracticeStoreProvider);
    final pendingBefore = await store.pendingCount();
    if (!mounted) {
      return;
    }
    if (pendingBefore == 0) {
      _showSnackBar('没有待同步的离线记录');
      return;
    }

    final result = await ref.read(syncServiceProvider).flush();
    if (!mounted) {
      return;
    }
    if (result.error != null) {
      _showSnackBar('同步未完成：${result.error}');
    } else {
      _showSnackBar('已同步 ${result.answers} 条作答（${result.sessions} 个会话）');
    }
    setState(() {});
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
              AppIcons.arrowForwardIos,
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

  void _showClearCacheDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('清理缓存'),
        content: const Text('确定要清理本地缓存吗？这不会影响您的学习进度，但重新加载图片等资源可能需要一些时间。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _showSnackBar('缓存已清理完毕');
            },
            child: const Text('确定'),
          ),
        ],
      ),
    );
  }

  void _showFeedbackDialog() {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('反馈建议'),
        content: TextField(
          controller: controller,
          maxLines: 4,
          decoration: const InputDecoration(
            hintText: '描述您遇到的问题或建议...',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () {
              if (controller.text.isNotEmpty) {
                Navigator.pop(context);
                _showSnackBar('谢谢您的反馈！我们会尽快处理。');
              }
            },
            child: const Text('提交'),
          ),
        ],
      ),
    );
  }

  void _showAboutDialog() {
    showAboutDialog(
      context: context,
      applicationName: 'Zhuoyu AI',
      applicationVersion: 'v1.2.0',
      applicationIcon: Padding(
        padding: EdgeInsets.symmetric(vertical: 8.h),
        child: Text('🧠', style: TextStyle(fontSize: 48.sp)),
      ),
      applicationLegalese: '© 2026 Zhuoyu AI Team. All Rights Reserved.',
      children: [
        SizedBox(height: 16.h),
        const Text('琢玉 (Zhuoyu) 是一款基于第一性原理的学习辅助工具，旨在帮助用户通过 AI 辅助深度理解知识点。'),
      ],
    );
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
            onPressed: () async {
              Navigator.pop(context);
              await ref.read(authControllerProvider.notifier).logout();
              if (context.mounted) {
                context.replace(AppRoutes.login);
              }
            },
            child: const Text('退出', style: TextStyle(color: Color(0xFFEB5757))),
          ),
        ],
      ),
    );
  }
}
