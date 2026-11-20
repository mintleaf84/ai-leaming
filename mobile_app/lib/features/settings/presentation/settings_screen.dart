import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../core/a11y/status_announcer.dart';
import '../../../core/diagnostics/error_log.dart';
import '../../../core/navigation/app_nav.dart';
import '../../../core/network/server_config.dart';
import '../../../core/sync/sync_providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_icons.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../shared/widgets/server_address_form.dart';
import '../../practice/presentation/widgets/device_migration_panel.dart';
import '../../practice/presentation/widgets/practice_backup_panel.dart';
import '../../practice/presentation/widgets/question_prefetch_panel.dart';
import '../../profile/presentation/profile_provider.dart';
import 'settings_provider.dart';
import 'widgets/settings_dialogs.dart';
import 'widgets/settings_tiles.dart';

/// 设置页面
///
/// Notion 风格的设置界面，支持深色模式。
/// 卡片/行/分隔线等原子件与各弹窗分别在 `widgets/settings_tiles.dart`、
/// `widgets/settings_dialogs.dart`（纯搬移）；本文件只做布局与本地状态。
///
/// CI 传入的版本与构建指纹（`--dart-define`）。
///
/// 本地构建时两者都是空串：此时回落到仓库里的固定版本号，不显示指纹。
/// 为什么要从 CI 传：APK 的 versionCode 由 `github.run_number` 派生，
/// 用户上报问题时必须能对应到具体某次构建。
const String _buildSha = String.fromEnvironment('BUILD_SHA');
const String _appVersion = String.fromEnvironment('APP_VERSION');

/// 设置页与「关于」共用的版本文案：`v1.0.0 (12) · a1b2c3d4`。
String get _versionLabel {
  final base = _appVersion.isEmpty ? 'v1.2.0' : 'v$_appVersion';
  if (_buildSha.isEmpty) return base;
  final short = _buildSha.length >= 8 ? _buildSha.substring(0, 8) : _buildSha;
  return '$base · $short';
}

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
    Future.microtask(() => ref.read(profileControllerProvider.notifier).load());
  }

  @override
  Widget build(BuildContext context) {
    final themeMode = ref.watch(themeModeProvider);
    final settingsState = ref.watch(settingsProvider);
    final reviewMode = settingsState.reviewMode;
    final profile = ref.watch(profileControllerProvider).profile;
    final serverConfig = ref.watch(serverConfigProvider);
    final errorLog = ref.watch(errorLogProvider);
    final isDarkMode =
        themeMode == ThemeMode.dark ||
        (themeMode == ThemeMode.system &&
            MediaQuery.platformBrightnessOf(context) == Brightness.dark);

    // 主题颜色
    final theme = Theme.of(context);
    final bgColor = theme.scaffoldBackgroundColor;
    final cardColor = theme.cardColor;
    final textColor = theme.colorScheme.onSurface;
    final secondaryColor = context.colors.textSecondary;
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
                      tooltip: '返回',
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
                    SettingsSectionTitle(title: '个人账户', color: secondaryColor),
                    SettingsCard(
                      cardColor: cardColor,
                      borderColor: borderColor,
                      children: [
                        SettingsAvatarTile(
                          textColor: textColor,
                          secondaryColor: secondaryColor,
                          onTap: () => _showSnackBar('头像上传功能开发中...'),
                        ),
                        SettingsDivider(borderColor: borderColor),
                        SettingsTile(
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
                    SettingsSectionTitle(title: '学习设置', color: secondaryColor),
                    SettingsCard(
                      cardColor: cardColor,
                      borderColor: borderColor,
                      children: [
                        SettingsTile(
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
                          onTap: () => showDailyGoalPicker(
                            context,
                            current: dailyGoal,
                            onSelected: (goal) =>
                                setState(() => dailyGoal = goal),
                            textColor: textColor,
                            borderColor: borderColor,
                          ),
                        ),
                        SettingsDivider(borderColor: borderColor),
                        SettingsTile(
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
                            activeTrackColor: context.colors.accent,
                          ),
                          textColor: textColor,
                        ),

                        SettingsDivider(borderColor: borderColor),
                        SettingsTile(
                          icon: AppIcons.darkModeOutlined,
                          title: '深色模式',
                          trailing: Switch(
                            value: isDarkMode,
                            onChanged: (value) {
                              ref.read(themeModeProvider.notifier).toggle();
                            },
                            activeTrackColor: context.colors.accent,
                          ),
                          textColor: textColor,
                        ),
                        SettingsDivider(borderColor: borderColor),
                        SettingsTile(
                          icon: AppIcons.notificationsOutlined,
                          title: '提醒通知',
                          trailing: Switch(
                            value: notificationEnabled,
                            onChanged: (value) {
                              setState(() {
                                notificationEnabled = value;
                              });
                            },
                            activeTrackColor: context.colors.accent,
                          ),
                          textColor: textColor,
                        ),
                      ],
                    ),
                    SizedBox(height: 24.h),
                    // 数据管理
                    SettingsSectionTitle(title: '数据管理', color: secondaryColor),
                    SettingsCard(
                      cardColor: cardColor,
                      borderColor: borderColor,
                      children: [
                        SettingsTile(
                          icon: AppIcons.cleaningServicesOutlined,
                          title: '清理缓存',
                          trailing: _buildCachedCountTrailing(secondaryColor),
                          textColor: textColor,
                          onTap: () => showClearCacheDialog(context),
                        ),
                        SettingsDivider(borderColor: borderColor),
                        SettingsTile(
                          icon: AppIcons.deleteOutline,
                          title: '清空错题本',
                          trailing: Icon(
                            AppIcons.arrowForwardIos,
                            size: 16.sp,
                            color: secondaryColor.withValues(alpha: 0.7),
                          ),
                          textColor: textColor,
                          onTap: () => showClearConfirmDialog(context),
                        ),
                        SettingsDivider(borderColor: borderColor),
                        SettingsTile(
                          icon: AppIcons.cloudUploadOutlined,
                          title: '同步离线记录',
                          trailing: _buildPendingTrailing(secondaryColor),
                          textColor: textColor,
                          onTap: _syncOfflineAnswers,
                        ),
                        SettingsDivider(borderColor: borderColor),
                        // 换机前检查（§30 P1）：显示待同步条数，同步成功才宣称
                        // 「可以换机」。与上面「同步离线记录」的区别是这里把
                        // 「换机前必须同步」的后果说清楚，而不是只报数字。
                        const DeviceMigrationPanel(),
                        SettingsDivider(borderColor: borderColor),
                        // 导出/导入（§30 P2）：只走剪贴板，不引文件/分享依赖。
                        const PracticeBackupPanel(),
                        SettingsDivider(borderColor: borderColor),
                        // 题库预下载：按页拉全量，支持中断续传。
                        const QuestionPrefetchPanel(),
                        SettingsDivider(borderColor: borderColor),
                        // 诊断日志：本地记录异常与堆栈（不含用户内容），
                        // 用户遇到问题时可以复制出来反馈。
                        ListenableBuilder(
                          listenable: errorLog,
                          builder: (context, _) => SettingsTile(
                            icon: AppIcons.history,
                            title: '诊断日志',
                            trailing: Text(
                              errorLog.length == 0
                                  ? '暂无记录'
                                  : '${errorLog.length} 条',
                              style: TextStyle(
                                fontSize: 14.sp,
                                color: secondaryColor,
                              ),
                            ),
                            textColor: textColor,
                            onTap: () => showDiagnosticsDialog(context, ref),
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: 24.h),
                    // 服务器
                    SettingsSectionTitle(title: '服务器', color: secondaryColor),
                    SettingsCard(
                      cardColor: cardColor,
                      borderColor: borderColor,
                      children: [
                        SettingsTile(
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
                                    color: context.colors.error,
                                  ),
                                ),
                          textColor: textColor,
                        ),
                        SettingsDivider(borderColor: borderColor),
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
                    SettingsSectionTitle(
                      title: '关于与反馈',
                      color: secondaryColor,
                    ),
                    SettingsCard(
                      cardColor: cardColor,
                      borderColor: borderColor,
                      children: [
                        SettingsTile(
                          icon: AppIcons.feedbackOutlined,
                          title: '反馈建议',
                          trailing: Icon(
                            AppIcons.arrowForwardIos,
                            size: 16.sp,
                            color: secondaryColor.withValues(alpha: 0.7),
                          ),
                          textColor: textColor,
                          onTap: () => showFeedbackDialog(context),
                        ),
                        SettingsDivider(borderColor: borderColor),
                        SettingsTile(
                          icon: AppIcons.infoOutline,
                          title: '当前版本',
                          trailing: Text(
                            _versionLabel,
                            style: TextStyle(
                              fontSize: 14.sp,
                              color: secondaryColor,
                            ),
                          ),
                          textColor: textColor,
                          onTap: () =>
                              showAppAboutDialog(context, _versionLabel),
                        ),
                        Divider(height: 1, color: borderColor),
                        InkWell(
                          onTap: () => showLogoutConfirmDialog(context, ref),
                          child: Container(
                            width: double.infinity,
                            padding: EdgeInsets.symmetric(vertical: 14.h),
                            alignment: Alignment.center,
                            child: Text(
                              '退出登录',
                              style: TextStyle(
                                fontSize: 15.sp,
                                fontWeight: FontWeight.w500,
                                color: context.colors.error,
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
      announceStatus(context, '同步未完成：${result.error}');
    } else {
      final message = '已同步 ${result.answers} 条作答（${result.sessions} 个会话）';
      _showSnackBar(message);
      announceStatus(context, message);
    }
    setState(() {});
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }
}
