import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/navigation/app_nav.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import '../../../../shared/domain/learning_stats.dart';

/// 首页待办清单。
///
/// 从 `dashboard_screen._buildTodoList` 原样搬出（纯搬移，无行为改动）。
///
/// 条目全部由 [LearningStats] 的真实字段推导，没有占位文案。
///
/// 「今日还需练习 N 题」这一条可以直接开练（F3）：待办已经知道还差几题，
/// 再让用户去配置页选模式/题量是多余的一步。其余两条只做提示，不可点。
class DashboardTodoList extends StatelessWidget {
  const DashboardTodoList({
    super.key,
    required this.stats,
    required this.dailyGoal,
  });

  final LearningStats stats;
  final int dailyGoal;

  @override
  Widget build(BuildContext context) {
    final entries = _buildTodoEntries();
    final remaining = dailyGoal - stats.todayCount;
    // 目标已完成（remaining ≤ 0）时仍允许继续练：给练习页一个正常题量，
    // 而不是把 0 传下去变成一场空练习。
    final limit = remaining > 0 ? remaining : 10;

    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '待办清单',
              style: TextStyle(
                fontSize: 12.sp,
                fontWeight: FontWeight.w600,
                color: context.colors.textSecondary,
              ),
            ),
          ],
        ),
        SizedBox(height: 12.h),
        Container(
          padding: EdgeInsets.all(16.w),
          decoration: BoxDecoration(
            color: context.colors.surface,
            borderRadius: BorderRadius.circular(8.r),
            border: Border.all(color: context.colors.border),
          ),
          child: Column(
            children: [
              for (int i = 0; i < entries.length; i++) ...[
                if (i > 0) Divider(height: 20.h, color: context.colors.border),
                _TodoRow(
                  entry: entries[i],
                  // 只有「今日还需练习」这一条能一键开练；模式用练习页的默认
                  // （后端目前只支持 random，settings 里的 reviewMode 是
                  // 清单/沉浸的展示口径，传过去会 400）。
                  onTap: i == 0
                      ? () => context.pushDetail(
                          AppRoutes.practice,
                          extra: <String, dynamic>{
                            'limit': limit,
                            'mode': 'random',
                          },
                        )
                      : null,
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  List<_TodoEntry> _buildTodoEntries() {
    final remaining = dailyGoal - stats.todayCount;
    final wrongCount = stats.todayCount - stats.todayCorrect;
    final todayPracticed = stats.todayCount > 0;
    final accuracy = (stats.todayAccuracy * 100).toStringAsFixed(1);

    final practiceTitle = remaining > 0
        ? '今日还需练习 $remaining 题'
        : '今日 $dailyGoal 题目标已完成';
    final practiceSubtitle = todayPracticed
        ? '已练 ${stats.todayCount} 题 · 正确率 $accuracy%'
        : '今日还没有练习记录';
    final wrongTitle = wrongCount > 0 ? '复盘今日 $wrongCount 道错题' : '今日暂无错题需要复盘';
    final wrongSubtitle = wrongCount > 0 ? '在错题本中重做一遍' : '答错的题目会自动进入错题本';
    final streakTitle = stats.streakDays > 0
        ? '连续学习 ${stats.streakDays} 天'
        : '开启连续学习记录';
    final streakSubtitle =
        '累计 ${stats.totalSessions} 场练习 · ${stats.totalCount} 题';

    return <_TodoEntry>[
      _TodoEntry(
        icon: AppIcons.playCircleOutline,
        title: practiceTitle,
        subtitle: practiceSubtitle,
        isDone: remaining <= 0,
      ),
      _TodoEntry(
        icon: AppIcons.errorOutline,
        title: wrongTitle,
        subtitle: wrongSubtitle,
        isDone: wrongCount <= 0,
      ),
      _TodoEntry(
        icon: AppIcons.localFireDepartmentOutlined,
        title: streakTitle,
        subtitle: streakSubtitle,
        isDone: todayPracticed && stats.streakDays > 0,
      ),
    ];
  }
}

/// 待办清单条目：字段全部由 LearningStats 推导，不引入额外数据源。
class _TodoEntry {
  const _TodoEntry({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.isDone,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool isDone;
}

class _TodoRow extends StatelessWidget {
  const _TodoRow({required this.entry, this.onTap});

  final _TodoEntry entry;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final row = Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          entry.isDone ? AppIcons.checkCircle : entry.icon,
          size: 20.sp,
          color: entry.isDone
              ? context.colors.success
              : context.colors.textSecondary,
        ),
        SizedBox(width: 12.w),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                entry.title,
                style: TextStyle(
                  fontSize: 14.sp,
                  fontWeight: FontWeight.w600,
                  color: entry.isDone
                      ? context.colors.textSecondary
                      : context.colors.text,
                  decoration: entry.isDone
                      ? TextDecoration.lineThrough
                      : TextDecoration.none,
                ),
              ),
              SizedBox(height: 2.h),
              Text(
                entry.subtitle,
                style: TextStyle(
                  fontSize: 12.sp,
                  color: context.colors.textSecondary,
                ),
              ),
            ],
          ),
        ),
        if (onTap != null)
          Icon(
            AppIcons.chevronRight,
            size: 18.sp,
            color: context.colors.textSecondary,
          ),
      ],
    );

    if (onTap == null) return row;
    // 语义写在容器上：InkWell 的可点子项是变量，读屏拿不到可见文字。
    return Semantics(
      button: true,
      label: entry.title,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8.r),
        child: Padding(
          padding: EdgeInsets.symmetric(vertical: 4.h),
          child: row,
        ),
      ),
    );
  }
}
