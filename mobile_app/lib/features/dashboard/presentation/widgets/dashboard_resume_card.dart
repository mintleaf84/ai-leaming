import 'package:flutter/material.dart';

import '../../../../core/navigation/app_nav.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/domain/practice_resume.dart';
import 'dashboard_wide_card.dart';

/// 「继续上次练习」：回到那一场的断点题。
///
/// 从 `dashboard_screen._buildResumeCard` 原样搬出（纯搬移，无行为改动）。
///
/// 不经过配置页：断点里已经有会话与进度，再让用户选模式/题量是多余的一步。
/// 已答记录（题号 + 对错）一并带过去：练习页据此回填结果、定位第一道未答题。
class DashboardResumeCard extends StatelessWidget {
  const DashboardResumeCard({super.key, required this.resume});

  final PracticeResume resume;

  @override
  Widget build(BuildContext context) {
    final total = resume.total;
    final position = resume.startIndex + 1;
    return DashboardWideCard(
      icon: '▶️',
      tag: '未完成',
      tagColor: context.colors.warningContainer,
      tagTextColor: context.colors.warning,
      title: '继续上次练习',
      trailingLabel: '进度',
      trailingValue: '$position/$total 题',
      onTap: () => context.pushDetail(
        AppRoutes.practice,
        extra: <String, dynamic>{
          'sessionId': resume.sessionId,
          'startIndex': resume.startIndex,
          'answered': resume.answers,
          'legacyAnswered': resume.legacyAnswered,
          'mode': resume.mode,
        },
      ),
    );
  }
}
