import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:mobile_app/features/practice/presentation/practice_provider.dart';
import 'package:mobile_app/core/theme/app_icons.dart';
import 'package:mobile_app/core/theme/app_colors.dart';

/// 第一性原理 AI 分析面板
/// 
/// 以 BottomSheet 形式展示，包含：
/// - 层级化的分析步骤 (Core Essence -> Fundamental Components -> Reconstructed Understanding)
/// - 优雅的加载动画
class FirstPrinciplesPanel extends ConsumerWidget {
  final String questionId;

  const FirstPrinciplesPanel({super.key, required this.questionId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(practiceControllerProvider);
    final response = state.firstPrinciples[questionId];
    final isAnalyzing = state.isAnalyzingFirstPrinciples;

    return Container(
      padding: EdgeInsets.symmetric(horizontal: 24.w, vertical: 32.h),
      decoration: BoxDecoration(
        color: context.colors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(32.r)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    padding: EdgeInsets.all(8.w),
                    decoration: BoxDecoration(
                      color: context.colors.accentContainer,
                      borderRadius: BorderRadius.circular(12.r),
                    ),
                    child: Icon(
                      AppIcons.smartToy,
                      color: context.colors.accent,
                      size: 24.sp,
                    ),
                  ),
                  SizedBox(width: 12.w),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'AI 第一性原理透视',
                        style: TextStyle(
                          fontSize: 18.sp,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        '从本质逻辑出发解构问题',
                        style: TextStyle(
                          fontSize: 12.sp,
                          color: context.colors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              IconButton(
                tooltip: '关闭',
                onPressed: () => Navigator.pop(context),
                icon: Icon(AppIcons.close, color: context.colors.textSecondary),
              ),
            ],
          ),
          SizedBox(height: 32.h),
          
          if (isAnalyzing)
            _buildLoadingState(context)
          else if (response != null)
            _buildAnalysisContent(context, response)
          else
            const Center(child: Text('暂无分析数据')),
          
          SizedBox(height: 16.h),
        ],
      ),
    );
  }

  Widget _buildLoadingState(BuildContext context) {
    return Column(
      children: [
        SizedBox(height: 48.h),
        CircularProgressIndicator(color: context.colors.accent),
        SizedBox(height: 24.h),
        Text(
          '正在深入解构逻辑本质...',
          style: TextStyle(fontSize: 14.sp, color: Colors.grey),
        ),
        SizedBox(height: 48.h),
      ],
    );
  }

  Widget _buildAnalysisContent(BuildContext context, dynamic response) {
    return Column(
      children: [
        _buildStep(
          context,
          '🎯',
          '核心本质',
          '剥离冗余信息，识别问题的最基础事实。',
          response.coreEssence,
          true,
        ),
        _buildStep(
          context,
          '🧱',
          '基本要素',
          '问题的构成组件及其相互关系。',
          response.fundamentalComponents.join('\n• '),
          true,
        ),
        _buildStep(
          context,
          '💡',
          '重构理解',
          '基于底层逻辑得出的最终结论。',
          response.reconstructedUnderstanding,
          false,
        ),
      ],
    );
  }

  Widget _buildStep(
    BuildContext context,
    String emoji,
    String title,
    String subtitle,
    String content,
    bool showDivider,
  ) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            Container(
              width: 44.w,
              height: 44.h,
              decoration: BoxDecoration(
                color: context.colors.surface,
                shape: BoxShape.circle,
                border: Border.all(color: context.colors.border),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.03),
                    blurRadius: 4,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              alignment: Alignment.center,
              child: Text(emoji, style: TextStyle(fontSize: 20.sp)),
            ),
            if (showDivider)
              Container(
                width: 1.w,
                height: 60.h,
                color: context.colors.border,
              ),
          ],
        ),
        SizedBox(width: 16.w),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  fontSize: 15.sp,
                  fontWeight: FontWeight.bold,
                  color: context.colors.text,
                ),
              ),
              Text(
                subtitle,
                style: TextStyle(
                  fontSize: 12.sp,
                  color: Colors.grey[500],
                ),
              ),
              SizedBox(height: 8.h),
              Container(
                width: double.infinity,
                padding: EdgeInsets.all(12.w),
                decoration: BoxDecoration(
                  color: context.colors.surfaceAlt,
                  borderRadius: BorderRadius.circular(12.r),
                ),
                child: Text(
                  content,
                  style: TextStyle(
                    fontSize: 13.sp,
                    height: 1.5,
                    color: context.colors.text.withValues(alpha: 0.8),
                  ),
                ),
              ),
              if (showDivider) SizedBox(height: 16.h),
            ],
          ),
        ),
      ],
    );
  }
}
