import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/navigation/app_nav.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/domain/recall_queue.dart';
import 'dashboard_action_card.dart';
import 'dashboard_wide_card.dart';

/// 首页功能入口区：两列卡 + 整宽入口（记忆卡 / 试卷 / 错题 / 历史）。
///
/// 从 `dashboard_screen._buildActionGrid` 原样搬出（纯搬移，无行为改动）。
/// 能力协商与离线判定仍由屏负责（屏拿着 `ref`），这里只接收结论。
class DashboardActionGrid extends StatelessWidget {
  const DashboardActionGrid({
    super.key,
    required this.showRecall,
    required this.showExam,
    required this.isOnline,
    required this.recallQueue,
    required this.wrongTotal,
    required this.lastPracticeAt,
  });

  final bool showRecall;
  final bool showExam;
  final bool isOnline;
  final AsyncValue<RecallQueue>? recallQueue;
  final AsyncValue<int> wrongTotal;
  final DateTime? lastPracticeAt;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: GestureDetector(
                  onTap: () => context.pushDetail(AppRoutes.questions),
                  child: DashboardActionCard(
                    icon: '📚',
                    tag: '查缺补漏',
                    tagColor: context.colors.accentContainer,
                    tagTextColor: context.colors.accent,
                    title: '全量\n题库',
                    subtitleLabel: '探索',
                    subtitleValue: '获取所有题目',
                  ),
                ),
              ),
              SizedBox(width: 16.w),
              Expanded(
                child: GestureDetector(
                  onTap: () => context.pushDetail(AppRoutes.practiceSetup),
                  child: DashboardActionCard(
                    icon: '🧠',
                    tag: '待复习',
                    tagColor: context.colors.warningContainer,
                    tagTextColor: context.colors.warning,
                    title: '智能\n复习',
                    subtitleLabel: '今日待办',
                    subtitleValue: '开始练习',
                  ),
                ),
              ),
            ],
          ),
        ),
        SizedBox(height: 16.h),
        // 整宽行：按"每天要做 → 补漏 → 回看"的优先级往下排。
        // 记忆卡放在第一行整宽位而不是挤进两列：两列里落单一张会留半个空槽，
        // 而它本身就是"开始一件事"的入口，用整宽行更接近顶部两张卡的语义。
        //
        // 服务端自述没有 recall 能力时整张卡不出现（连它的间距一起）：
        // 留一个空槽位比隐藏更难看，而灰显一张点不动的卡是欺骗。
        //
        // 离线是例外（审计 #20 方案 A）：这张卡进去就要拉会话，断网只会在下一页
        // 撞一个空屏。所以断网时保留卡片但**禁用**，并把原因写在卡上——用户看到
        // 的是「离线 / 联网后可用」，而不是一张点了没反应的卡。
        if (showRecall) ...[
          DashboardWideCard(
            icon: '📇',
            tag: '每日记一点',
            tagColor: context.colors.successContainer,
            tagTextColor: context.colors.success,
            title: '记忆卡',
            trailingLabel: isOnline ? '今日到期' : '离线',
            trailingValue: _recallValue(recallQueue, isOnline: isOnline),
            onTap: isOnline ? () => context.pushDetail(AppRoutes.recall) : null,
            disabledNote: isOnline ? null : '离线，联网后可进入记忆卡',
          ),
          SizedBox(height: 16.h),
        ],
        // 试卷：整卷 + 限时 + 交卷后统一批改。放在记忆卡下方、错题本上方——
        // 与「今天要做的事」相邻，但仍排在每日回忆之后（模考不是每天都做的）。
        // 断网时保留入口但禁用：进去第一件事就是拉列表，离线只会撞空屏。
        if (showExam) ...[
          DashboardWideCard(
            icon: '📝',
            tag: '整卷模考',
            tagColor: context.colors.accentContainer,
            tagTextColor: context.colors.accent,
            title: '试卷',
            trailingLabel: '模考',
            trailingValue: isOnline ? '自动组卷' : '需要联网',
            onTap: isOnline ? () => context.pushDetail(AppRoutes.exam) : null,
            disabledNote: isOnline ? null : '离线，联网后可进入试卷',
          ),
          SizedBox(height: 16.h),
        ],
        DashboardWideCard(
          icon: '📕',
          tag: '重点关注',
          tagColor: context.colors.errorContainer,
          tagTextColor: context.colors.error,
          title: '我的错题',
          trailingLabel: '累计',
          trailingValue: _wrongValue(wrongTotal),
          onTap: () => context.pushDetail(AppRoutes.wrongBook),
        ),
        SizedBox(height: 16.h),
        DashboardWideCard(
          icon: '⏳',
          tag: '温故知新',
          tagColor: context.colors.surfaceAlt,
          tagTextColor: context.colors.textSecondary,
          title: '练习历史',
          trailingLabel: '最近',
          trailingValue: _lastPracticeValue(lastPracticeAt),
          onTap: () => context.pushDetail(AppRoutes.history),
        ),
      ],
    );
  }
}

/// 记忆卡右侧数值：今日到期张数。
///
/// 到期 0 时给「今天已完成」而不是「0 张」——后者读起来像「今天还没开始」。
/// 队列还没回来/失败时给「暂无」：宁可承认不知道，也不写一个假数字。
String _recallValue(AsyncValue<RecallQueue>? queue, {required bool isOnline}) {
  if (!isOnline) return '联网后可用';
  final value = queue?.value;
  if (value == null) return '暂无';
  if (value.due > 0) return '${value.due} 张';
  return '今天已完成';
}

/// 错题卡右侧数值：累计条数。
String _wrongValue(AsyncValue<int> total) {
  final value = total.value;
  if (value == null || value <= 0) return '暂无';
  return '$value 条';
}

/// 练习历史卡右侧数值：最近一次练习时间。
String _lastPracticeValue(DateTime? at) {
  if (at == null) return '暂无';
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(at.year, at.month, at.day);
  final days = today.difference(day).inDays;
  final hm =
      '${at.hour.toString().padLeft(2, '0')}:'
      '${at.minute.toString().padLeft(2, '0')}';
  if (days <= 0) return '今天 $hm';
  if (days == 1) return '昨天 $hm';
  if (days < 7) return '$days 天前';
  return '${at.month}月${at.day}日';
}
