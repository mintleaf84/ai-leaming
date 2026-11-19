import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../../../core/navigation/app_nav.dart';
import 'profile_provider.dart';
import '../domain/user_profile.dart';
import '../../../core/theme/app_icons.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/state_views.dart';

/// 个人中心页面
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(
      () => ref.read(profileControllerProvider.notifier).load(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(profileControllerProvider);
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: context.colors.background,
      appBar: AppBar(
        elevation: 0,
        leading: IconButton(
          tooltip: '返回',
          icon: Icon(AppIcons.arrowBack, color: theme.colorScheme.onSurface),
          onPressed: () => context.backOrHome(),
        ),
        title: Text(
          '个人中心',
          style: TextStyle(
            fontSize: 18.sp,
            fontWeight: FontWeight.w600,
            color: context.colors.text,
          ),
        ),
        actions: [
          IconButton(
            tooltip: '刷新个人信息',
            icon: Icon(AppIcons.refresh, color: context.colors.text),
            onPressed: () =>
                ref.read(profileControllerProvider.notifier).load(),
          ),
        ],
      ),
      body: state.isLoading
          ? const Center(child: CircularProgressIndicator())
          : state.error != null
          ? AppErrorView(
              message: state.error!,
              onRetry: () =>
                  ref.read(profileControllerProvider.notifier).load(),
            )
          : state.profile != null
          ? _buildContent(state.profile!)
          : const SizedBox.shrink(),
    );
  }

  Widget _buildContent(UserProfile profile) {
    return SingleChildScrollView(
      padding: EdgeInsets.all(20.w),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 头像与基本信息
          _buildAvatarCard(profile),
          SizedBox(height: 20.h),
          // 学习数据统计
          _buildSectionTitle('学习数据'),
          SizedBox(height: 12.h),
          _buildStatsGrid(profile.stats),
          SizedBox(height: 20.h),
          // 快捷导航
          _buildSectionTitle('快捷导航'),
          SizedBox(height: 12.h),
          _buildQuickActions(),
          SizedBox(height: 40.h),
        ],
      ),
    );
  }

  Widget _buildAvatarCard(UserProfile profile) {
    final roleLabel = profile.role == 'admin' ? '管理员' : '学生';
    // 解析注册日期
    String joinDate = '';
    try {
      final dt = DateTime.parse(profile.createdAt);
      joinDate = '${dt.year}年${dt.month}月${dt.day}日';
    } catch (_) {
      joinDate = profile.createdAt;
    }

    return Container(
      padding: EdgeInsets.all(20.w),
      decoration: BoxDecoration(
        color: context.colors.surface,
        borderRadius: BorderRadius.circular(16.r),
        border: Border.all(color: context.colors.border),
      ),
      child: Row(
        children: [
          // 头像
          Container(
            width: 64.w,
            height: 64.w,
            decoration: BoxDecoration(
              color: context.colors.text.withValues(alpha: 0.08),
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Text('👤', style: TextStyle(fontSize: 32.sp)),
          ),
          SizedBox(width: 16.w),
          // 信息
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  profile.username,
                  style: TextStyle(
                    fontSize: 20.sp,
                    fontWeight: FontWeight.bold,
                    color: context.colors.text,
                  ),
                ),
                SizedBox(height: 4.h),
                Row(
                  children: [
                    Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: 8.w,
                        vertical: 2.h,
                      ),
                      decoration: BoxDecoration(
                        color: context.colors.accentContainer,
                        borderRadius: BorderRadius.circular(4.r),
                      ),
                      child: Text(
                        roleLabel,
                        style: TextStyle(
                          fontSize: 12.sp,
                          color: context.colors.accent,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
                SizedBox(height: 4.h),
                Text(
                  '加入于 $joinDate',
                  style: TextStyle(
                    fontSize: 12.sp,
                    color: context.colors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Text(
      title,
      style: TextStyle(
        fontSize: 12.sp,
        fontWeight: FontWeight.w600,
        color: context.colors.textSecondary,
        letterSpacing: 0.5,
      ),
    );
  }

  Widget _buildStatsGrid(UserProfileStats stats) {
    final accuracy = (stats.overallAccuracy * 100).toStringAsFixed(1);

    return GridView.count(
      crossAxisCount: 2,
      crossAxisSpacing: 12.w,
      mainAxisSpacing: 12.h,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      childAspectRatio: 1.6,
      children: [
        _buildStatCard('🎯', '总会话数', '${stats.totalSessions}', '次练习'),
        _buildStatCard(
          '✅',
          '综合正确率',
          '$accuracy%',
          '${stats.totalCorrect}/${stats.totalAnswered} 题',
        ),
        _buildStatCard('🃏', '知识卡片', '${stats.knowledgeCardCount}', '张'),
        _buildStatCard('📝', '待攻克错题', '${stats.wrongBookCount}', '道'),
      ],
    );
  }

  Widget _buildStatCard(
    String emoji,
    String label,
    String value,
    String subtitle,
  ) {
    return Container(
      padding: EdgeInsets.all(14.w),
      decoration: BoxDecoration(
        color: context.colors.surface,
        borderRadius: BorderRadius.circular(12.r),
        border: Border.all(color: context.colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Text(emoji, style: TextStyle(fontSize: 16.sp)),
              SizedBox(width: 6.w),
              Flexible(
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: 12.sp,
                    color: context.colors.textSecondary,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: TextStyle(
                  fontSize: 20.sp,
                  fontWeight: FontWeight.bold,
                  color: context.colors.text,
                ),
              ),
              Text(
                subtitle,
                style: TextStyle(
                  fontSize: 12.sp,
                  color: context.colors.textSecondary,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildQuickActions() {
    final items = [
      (icon: AppIcons.history, label: '练习历史', route: '/history'),
      (icon: AppIcons.bookOutlined, label: '错题本', route: '/wrong-book'),
      (icon: AppIcons.styleOutlined, label: '知识卡片', route: '/knowledge'),
      (icon: AppIcons.hubOutlined, label: '掌握度', route: '/mastery'),
      (icon: AppIcons.workspacePremiumOutlined, label: '订阅套餐', route: '/pricing'),
      (icon: AppIcons.settingsOutlined, label: '设置', route: '/settings'),
    ];

    return Container(
      decoration: BoxDecoration(
        color: context.colors.surface,
        borderRadius: BorderRadius.circular(12.r),
        border: Border.all(color: context.colors.border),
      ),
      child: Column(
        children: items
            .map(
              (item) => _buildQuickActionItem(
                icon: item.icon,
                label: item.label,
                route: item.route,
                showDivider: item != items.last,
              ),
            )
            .toList(),
      ),
    );
  }

  Widget _buildQuickActionItem({
    required IconData icon,
    required String label,
    required String route,
    bool showDivider = true,
  }) {
    return Column(
      children: [
        InkWell(
          onTap: () => context.pushDetail(
            route,
            // 返回后刷新统计：知识卡片页新建的卡不会自己通知 profile，
            // 不刷新的话"知识卡片 N 张"会一直是进页面时的旧值
            onReturn: () => ref.read(profileControllerProvider.notifier).load(),
          ),
          borderRadius: BorderRadius.circular(12.r),
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 14.h),
            child: Row(
              children: [
                Icon(icon, size: 20.sp, color: context.colors.text),
                SizedBox(width: 12.w),
                Expanded(
                  child: Text(
                    label,
                    style: TextStyle(
                      fontSize: 15.sp,
                      color: context.colors.text,
                    ),
                  ),
                ),
                Icon(
                  AppIcons.chevronRight,
                  size: 20.sp,
                  color: context.colors.textSecondary,
                ),
              ],
            ),
          ),
        ),
        if (showDivider)
          Divider(
            height: 1.h,
            color: context.colors.border,
            indent: 16.w,
            endIndent: 16.w,
          ),
      ],
    );
  }
}
