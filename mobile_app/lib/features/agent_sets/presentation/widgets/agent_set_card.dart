import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import '../../domain/agent_question_set.dart';
import 'agent_set_unread_badge.dart';

/// 题集列表卡：标题、来源、目标考点、剩余题数、最近成绩、未读点。
///
/// 右侧那两行是**真实数据**（未做数 / 上次成绩），取不到就写「还没做过」，
/// 不编一个看起来合理的分数（与首页三卡同一条纪律）。
class AgentSetCard extends StatelessWidget {
  const AgentSetCard({super.key, required this.set, required this.onTap});

  final AgentQuestionSet set;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final score = set.lastScoreLabel;

    return Semantics(
      button: true,
      label: '${set.title}，${set.pendingLabel}',
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: EdgeInsets.all(16.w),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(14.r),
            border: Border.all(color: colors.border),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.02),
                blurRadius: 4,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      set.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 17.sp,
                        fontWeight: FontWeight.bold,
                        height: 1.25,
                        color: colors.text,
                      ),
                    ),
                  ),
                  if (set.unreadCount > 0) ...[
                    SizedBox(width: 8.w),
                    Padding(
                      padding: EdgeInsets.only(top: 2.h),
                      child: AgentSetUnreadBadge(count: set.unreadCount),
                    ),
                  ],
                ],
              ),
              SizedBox(height: 6.h),
              Row(
                children: [
                  Icon(
                    AppIcons.smartToy,
                    size: 13.sp,
                    color: colors.textSecondary,
                  ),
                  SizedBox(width: 4.w),
                  Flexible(
                    child: Text(
                      set.sourceLabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12.sp,
                        color: colors.textSecondary,
                      ),
                    ),
                  ),
                ],
              ),
              if (set.targetTags.isNotEmpty) ...[
                SizedBox(height: 8.h),
                _TagRow(tags: set.targetTags, status: set.status),
              ],
              SizedBox(height: 12.h),
              Divider(height: 1, color: colors.border),
              SizedBox(height: 10.h),
              Row(
                children: [
                  Text(
                    set.pendingLabel,
                    style: TextStyle(
                      fontSize: 13.sp,
                      fontWeight: FontWeight.w700,
                      color: set.hasPending
                          ? colors.text
                          : colors.textSecondary,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    score == null ? '还没做过' : '上次 $score',
                    style: TextStyle(
                      fontSize: 12.sp,
                      color: colors.textSecondary,
                    ),
                  ),
                  SizedBox(width: 4.w),
                  Icon(
                    AppIcons.chevronRight,
                    size: 18.sp,
                    color: colors.textSecondary,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 考点标签行：最多 3 个，多出来的收成 `+N`，避免长考点把卡片撑成两行。
class _TagRow extends StatelessWidget {
  const _TagRow({required this.tags, required this.status});

  final List<String> tags;
  final String status;

  @override
  Widget build(BuildContext context) {
    final shown = tags.take(3).toList(growable: false);
    final extra = tags.length - shown.length;
    return Wrap(
      spacing: 6.w,
      runSpacing: 6.h,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        for (final tag in shown) _Chip(label: tag),
        if (extra > 0) _Chip(label: '+$extra', muted: true),
        if (status == 'promoted') const _Chip(label: '已转正', highlight: true),
        if (status == 'archived') const _Chip(label: '已归档', muted: true),
      ],
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    this.muted = false,
    this.highlight = false,
  });

  final String label;
  final bool muted;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final background = highlight
        ? colors.successContainer
        : muted
        ? colors.surfaceAlt
        : colors.accentContainer;
    final foreground = highlight
        ? colors.success
        : muted
        ? colors.textSecondary
        : colors.accent;
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 7.w, vertical: 2.h),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(4.r),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontSize: 11.sp,
          fontWeight: FontWeight.w600,
          color: foreground,
        ),
      ),
    );
  }
}
