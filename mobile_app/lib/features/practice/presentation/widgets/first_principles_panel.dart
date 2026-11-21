import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:mobile_app/features/practice/domain/first_principles_response.dart';
import 'package:mobile_app/features/practice/presentation/practice_provider.dart';
import 'package:mobile_app/core/theme/app_icons.dart';
import 'package:mobile_app/core/theme/app_colors.dart';

/// 第一性原理 AI 分析面板
///
/// 以 BottomSheet 形式展示。
///
/// 服务端契约（`POST /api/practice/first-principles`）只有两个字段：
/// `{analysis: String, cached: bool}`——`analysis` 是**一段文本**，格式约定为
///
/// ```
/// 【答案】X
/// 【核心逻辑】……
/// ```
///
/// 所以这里不再去读 `coreEssence` / `fundamentalComponents` /
/// `reconstructedUnderstanding`（那是早期假想的结构化契约，模型上没有这几个字段，
/// 读到的第一天就是 `NoSuchMethodError`），而是把 `analysis` 正文按 `【…】`
/// 小标题切段渲染。
class FirstPrinciplesPanel extends ConsumerWidget {
  final String questionId;

  const FirstPrinciplesPanel({super.key, required this.questionId});

  /// 形如 `【核心逻辑】正文` 的小标题行（正文可为空，下一行接着写）。
  static final RegExp _headingPattern = RegExp(r'^【(.+?)】\s*(.*)$');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(practiceControllerProvider);
    final response = state.firstPrinciples[questionId];
    final isAnalyzing = state.isAnalyzingFirstPrinciples;
    final error = state.firstPrinciplesError;

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
          _buildHeader(context, cached: response?.cached ?? false),
          SizedBox(height: 32.h),
          // 正文可能很长（模型一次会给几百字）：放进滚动区，
          // 否则在小屏上会直接溢出底部。
          Flexible(
            child: SingleChildScrollView(
              child: isAnalyzing
                  ? _buildLoadingState(context)
                  : error != null
                  ? _buildErrorState(context, ref, error)
                  : response != null
                  ? _buildAnalysisContent(context, response)
                  : const Center(child: Text('暂无分析数据')),
            ),
          ),
          SizedBox(height: 16.h),
        ],
      ),
    );
  }

  /// 头部：图标 + 两行标题 + 关闭。
  ///
  /// 标题必须用 [Expanded] 收进剩余宽度（375 宽 + 1.3 倍字号时，图标与关闭按钮
  /// 之间的空间不够放下整行标题，没有它就会 RenderFlex overflow）。
  Widget _buildHeader(BuildContext context, {required bool cached}) {
    return Row(
      children: [
        Container(
          padding: EdgeInsets.all(8.w),
          decoration: BoxDecoration(
            color: context.colors.accentContainer,
            borderRadius: BorderRadius.circular(12.r),
          ),
          child: Icon(AppIcons.smartToy, color: context.colors.accent, size: 24.sp),
        ),
        SizedBox(width: 12.w),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Flexible(
                    child: Text(
                      'AI 第一性原理透视',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 18.sp,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  if (cached) ...[
                    SizedBox(width: 8.w),
                    Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: 6.w,
                        vertical: 2.h,
                      ),
                      decoration: BoxDecoration(
                        color: context.colors.accentContainer,
                        borderRadius: BorderRadius.circular(4.r),
                      ),
                      child: Text(
                        '已缓存',
                        style: TextStyle(
                          fontSize: 10.sp,
                          color: context.colors.accent,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              Text(
                '从本质逻辑出发解构问题',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12.sp,
                  color: context.colors.textSecondary,
                ),
              ),
            ],
          ),
        ),
        IconButton(
          tooltip: '关闭',
          onPressed: () => Navigator.pop(context),
          icon: Icon(AppIcons.close, color: context.colors.textSecondary),
        ),
      ],
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

  Widget _buildErrorState(BuildContext context, WidgetRef ref, String message) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: double.infinity,
          padding: EdgeInsets.all(16.w),
          decoration: BoxDecoration(
            color: context.colors.errorContainer,
            borderRadius: BorderRadius.circular(12.r),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                AppIcons.errorOutline,
                color: context.colors.error,
                size: 20.sp,
              ),
              SizedBox(width: 8.w),
              Expanded(
                child: Text(
                  message,
                  style: TextStyle(
                    fontSize: 13.sp,
                    height: 1.5,
                    color: context.colors.text,
                  ),
                ),
              ),
            ],
          ),
        ),
        SizedBox(height: 16.h),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: () => ref
                .read(practiceControllerProvider.notifier)
                .fetchFirstPrinciples(questionId),
            child: const Text('重试'),
          ),
        ),
      ],
    );
  }

  Widget _buildAnalysisContent(
    BuildContext context,
    FirstPrinciplesResponse response,
  ) {
    final blocks = _parseAnalysis(response.analysis);
    if (blocks.isEmpty) {
      return const Center(child: Text('暂无分析数据'));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final block in blocks)
          Padding(
            padding: EdgeInsets.only(bottom: 16.h),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (block.heading != null)
                  Text(
                    block.heading!,
                    style: TextStyle(
                      fontSize: 15.sp,
                      fontWeight: FontWeight.bold,
                      color: context.colors.accent,
                    ),
                  ),
                if (block.body.isNotEmpty)
                  Container(
                    width: double.infinity,
                    margin: EdgeInsets.only(top: 6.h),
                    padding: EdgeInsets.all(12.w),
                    decoration: BoxDecoration(
                      color: context.colors.surfaceAlt,
                      borderRadius: BorderRadius.circular(12.r),
                    ),
                    child: Text(
                      block.body,
                      style: TextStyle(
                        fontSize: 13.sp,
                        height: 1.5,
                        color: context.colors.text.withValues(alpha: 0.8),
                      ),
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }

  /// 把一段纯文本按 `【小标题】` 切成「小标题 + 正文」的段落。
  ///
  /// 小标题独占一行时，下一行起算它的正文；没有小标题的行原样成段；
  /// 空行结束当前段（也避免模型多打几个换行就撑出一堆空块）。
  static List<_AnalysisBlock> _parseAnalysis(String analysis) {
    final blocks = <_AnalysisBlock>[];
    String? heading;
    final body = StringBuffer();

    void flush() {
      final text = body.toString().trim();
      if (text.isEmpty && heading == null) return;
      blocks.add(_AnalysisBlock(heading: heading, body: text));
      heading = null;
      body.clear();
    }

    for (final rawLine in analysis.split('\n')) {
      final line = rawLine.trim();
      if (line.isEmpty) {
        flush();
        continue;
      }
      final match = _headingPattern.firstMatch(line);
      if (match == null) {
        body.writeln(line);
        continue;
      }
      flush();
      heading = '【${match.group(1)!.trim()}】';
      final rest = (match.group(2) ?? '').trim();
      if (rest.isNotEmpty) body.writeln(rest);
    }
    flush();
    return blocks;
  }
}

/// 一段渲染单元：可选小标题 + 正文。
class _AnalysisBlock {
  const _AnalysisBlock({required this.heading, required this.body});

  final String? heading;
  final String body;
}
