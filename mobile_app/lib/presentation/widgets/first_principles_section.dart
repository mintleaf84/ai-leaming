import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../core/providers/first_principles_provider.dart';
import '../../domain/entities/first_principles_params.dart';
import '../../domain/entities/practice_log.dart';
import 'ai_analysis_card.dart';

/// 第一性原理分析区域组件
///
/// 自包含的状态管理：展开/折叠由组件内部控制
class FirstPrinciplesSection extends ConsumerStatefulWidget {
  final PracticeLog log;

  const FirstPrinciplesSection({super.key, required this.log});

  @override
  ConsumerState<FirstPrinciplesSection> createState() =>
      _FirstPrinciplesSectionState();
}

class _FirstPrinciplesSectionState
    extends ConsumerState<FirstPrinciplesSection> {
  bool _isExpanded = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    // AI 标识颜色
    final accentColor = isDark
        ? const Color(0xFFE1BEE7)
        : const Color(0xFF9C27B0);

    if (!_isExpanded) {
      return _buildCollapsedButton(accentColor);
    }

    return _buildExpandedCard();
  }

  Widget _buildCollapsedButton(Color accentColor) {
    return Padding(
      padding: EdgeInsets.only(top: 12.h),
      child: InkWell(
        onTap: () => setState(() => _isExpanded = true),
        borderRadius: BorderRadius.circular(8.r),
        child: Container(
          padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 8.h),
          decoration: BoxDecoration(
            color: accentColor.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(8.r),
            border: Border.all(color: accentColor.withValues(alpha: 0.3)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('✨', style: TextStyle(fontSize: 14.sp)),
              SizedBox(width: 6.w),
              Text(
                '查看第一性原理分析',
                style: TextStyle(
                  fontSize: 13.sp,
                  fontWeight: FontWeight.w600,
                  color: accentColor,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildExpandedCard() {
    final log = widget.log;

    final params = FirstPrinciplesParams(
      questionContent: log.questionContent,
      correctAnswer: log.correctAnswer,
      explanation: log.explanation,
      wrongAnswer: log.isCorrect ? null : log.userAnswer,
    );

    final asyncValue = ref.watch(firstPrinciplesProvider(params));

    return AiAnalysisCard(
      isLoading: asyncValue.isLoading,
      content: asyncValue.asData?.value.analysis,
      error: asyncValue.error?.toString(),
      onRetry: () => ref.refresh(firstPrinciplesProvider(params)),
      onCollapse: () => setState(() => _isExpanded = false),
    );
  }
}
