import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:go_router/go_router.dart';
import 'profile_provider.dart';
import '../domain/user_profile.dart';

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
      backgroundColor: const Color(0xFFF7F7F5),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: theme.colorScheme.onSurface),
          onPressed: () => context.go('/dashboard'),
        ),
        title: Text(
          '个人中心',
          style: TextStyle(
            fontSize: 18.sp,
            fontWeight: FontWeight.w600,
            color: const Color(0xFF37352F),
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Color(0xFF37352F)),
            onPressed: () =>
                ref.read(profileControllerProvider.notifier).load(),
          ),
        ],
      ),
      body: state.isLoading
          ? const Center(child: CircularProgressIndicator())
          : state.error != null
          ? _buildErrorView(state.error!)
          : state.profile != null
          ? _buildContent(state.profile!)
          : const SizedBox.shrink(),
    );
  }

  Widget _buildErrorView(String error) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.error_outline, size: 48.sp, color: Colors.red[300]),
          SizedBox(height: 16.h),
          Text(
            '加载失败',
            style: TextStyle(fontSize: 16.sp, fontWeight: FontWeight.bold),
          ),
          SizedBox(height: 8.h),
          Text(
            error,
            style: TextStyle(fontSize: 12.sp, color: Colors.grey),
            textAlign: TextAlign.center,
          ),
          SizedBox(height: 24.h),
          ElevatedButton.icon(
            onPressed: () =>
                ref.read(profileControllerProvider.notifier).load(),
            icon: const Icon(Icons.refresh, size: 18),
            label: const Text('重试'),
          ),
        ],
      ),
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
        color: Colors.white,
        borderRadius: BorderRadius.circular(16.r),
        border: Border.all(color: const Color(0xFFE8E8E5)),
      ),
      child: Row(
        children: [
          // 头像
          Container(
            width: 64.w,
            height: 64.w,
            decoration: BoxDecoration(
              color: const Color(0xFF37352F).withValues(alpha: 0.08),
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
                    color: const Color(0xFF37352F),
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
                        color: const Color(0xFFE8F3FF),
                        borderRadius: BorderRadius.circular(4.r),
                      ),
                      child: Text(
                        roleLabel,
                        style: TextStyle(
                          fontSize: 11.sp,
                          color: const Color(0xFF135BEC),
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
                    color: const Color(0xFF9B9A97),
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
        color: const Color(0xFF9B9A97),
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
        color: Colors.white,
        borderRadius: BorderRadius.circular(12.r),
        border: Border.all(color: const Color(0xFFE8E8E5)),
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
                    fontSize: 11.sp,
                    color: const Color(0xFF9B9A97),
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
                  color: const Color(0xFF37352F),
                ),
              ),
              Text(
                subtitle,
                style: TextStyle(
                  fontSize: 11.sp,
                  color: const Color(0xFF9B9A97),
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
      (icon: Icons.history, label: '练习历史', route: '/history'),
      (icon: Icons.book_outlined, label: '错题本', route: '/wrong-book'),
      (icon: Icons.style_outlined, label: '知识卡片', route: '/knowledge'),
      (icon: Icons.settings_outlined, label: '设置', route: '/settings'),
    ];

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12.r),
        border: Border.all(color: const Color(0xFFE8E8E5)),
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
          onTap: () => context.go(route),
          borderRadius: BorderRadius.circular(12.r),
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 14.h),
            child: Row(
              children: [
                Icon(icon, size: 20.sp, color: const Color(0xFF37352F)),
                SizedBox(width: 12.w),
                Expanded(
                  child: Text(
                    label,
                    style: TextStyle(
                      fontSize: 15.sp,
                      color: const Color(0xFF37352F),
                    ),
                  ),
                ),
                Icon(
                  Icons.chevron_right,
                  size: 20.sp,
                  color: const Color(0xFF9B9A97),
                ),
              ],
            ),
          ),
        ),
        if (showDivider)
          Divider(
            height: 1.h,
            color: const Color(0xFFE8E8E5),
            indent: 16.w,
            endIndent: 16.w,
          ),
      ],
    );
  }
}
