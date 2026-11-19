import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:skeletonizer/skeletonizer.dart';
import '../../core/theme/app_icons.dart';

class AiAnalysisCard extends StatelessWidget {
  final String? content;
  final bool isLoading;
  final String? error;
  final VoidCallback? onRetry;
  final VoidCallback? onCollapse;

  const AiAnalysisCard({
    super.key,
    this.content,
    this.isLoading = false,
    this.error,
    this.onRetry,
    this.onCollapse,
  });

  @override
  Widget build(BuildContext context) {
    if (!isLoading && content == null && error == null) {
      return const SizedBox.shrink();
    }

    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    // AI 风格颜色
    final headerColor = isDark
        ? const Color(0xFFE1BEE7)
        : const Color(0xFF9C27B0);
    final cardBgColor = isDark
        ? const Color(0xFF311B92).withValues(alpha: 0.2)
        : const Color(0xFFEDE7F6).withValues(alpha: 0.5);

    return Container(
      margin: EdgeInsets.only(top: 16.h),
      padding: EdgeInsets.all(16.w),
      decoration: BoxDecoration(
        color: cardBgColor,
        borderRadius: BorderRadius.circular(12.r),
        border: Border.all(color: headerColor.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('✨', style: TextStyle(fontSize: 18.sp)),
              SizedBox(width: 8.w),
              Expanded(
                child: ShaderMask(
                  shaderCallback: (bounds) => LinearGradient(
                    colors: isDark
                        ? [const Color(0xFFAB47BC), const Color(0xFF42A5F5)]
                        : [const Color(0xFF8E24AA), const Color(0xFF1976D2)],
                  ).createShader(bounds),
                  child: Text(
                    '第一性原理深度解析',
                    style: TextStyle(
                      fontSize: 14.sp,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
              if (onCollapse != null)
                InkWell(
                  onTap: onCollapse,
                  borderRadius: BorderRadius.circular(12.r),
                  child: Padding(
                    padding: EdgeInsets.all(4.w),
                    child: Icon(
                      AppIcons.keyboardArrowUp,
                      size: 20.sp,
                      color: headerColor,
                    ),
                  ),
                ),
            ],
          ),
          SizedBox(height: 12.h),
          if (isLoading)
            _buildShimmer(isDark)
          else if (error != null)
            _buildError(error!, theme.colorScheme.error)
          else
            MarkdownBody(
              data: content!,
              styleSheet: MarkdownStyleSheet.fromTheme(theme).copyWith(
                p: TextStyle(
                  fontSize: 14.sp,
                  height: 1.6,
                  color: theme.textTheme.bodyMedium?.color,
                ),
                strong: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: isDark
                      ? const Color(0xFF90CAF9)
                      : const Color(0xFF1565C0),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildShimmer(bool isDark) {
    // 骨架与 skeletonizer 全线一致：用 Bone 撑出 4 行正文的占位（见 docs/mobile-ui-kit.md M-05）。
    // 行高沿用真实 Markdown 正文的 1.6 倍行距，避免加载完成后卡片高度跳动。
    return Skeletonizer.zone(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Bone.text(words: 8),
          SizedBox(height: 8.h),
          const Bone.text(words: 8),
          SizedBox(height: 8.h),
          const Bone.text(words: 4),
        ],
      ),
    );
  }

  Widget _buildError(String error, Color errorColor) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '分析失败: $error',
          style: TextStyle(fontSize: 13.sp, color: errorColor),
        ),
        SizedBox(height: 8.h),
        if (onRetry != null)
          InkWell(
            onTap: onRetry,
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: 4.h),
              child: Text(
                '点击重试',
                style: TextStyle(
                  fontSize: 13.sp,
                  color: Colors.blue,
                  decoration: TextDecoration.underline,
                ),
              ),
            ),
          ),
      ],
    );
  }
}
