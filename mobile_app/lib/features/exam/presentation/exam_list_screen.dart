import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../core/navigation/app_nav.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_icons.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/exam_paper.dart';
import '../domain/exam_submit_result.dart';
import 'exam_format.dart';
import 'exam_list_controller.dart';
import 'widgets/exam_generate_sheet.dart';

/// 试卷列表：我的试卷 + 自动组卷入口。
///
/// 列表右侧的「最好成绩」必须来自服务端（`bestScore` / `attemptCount`），
/// 取不到就写「未作答」——不编一个看起来合理的分数（与首页三卡的纪律一致）。
class ExamListScreen extends ConsumerStatefulWidget {
  const ExamListScreen({super.key});

  @override
  ConsumerState<ExamListScreen> createState() => _ExamListScreenState();
}

class _ExamListScreenState extends ConsumerState<ExamListScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (!mounted) return;
      ref.read(examListControllerProvider.notifier).load();
    });
  }

  Future<void> _openGenerate() async {
    final controller = ref.read(examListControllerProvider.notifier);
    controller.clearGenerateError();
    final paper = await showExamGenerateSheet(context);
    if (!mounted || paper == null) return;
    context.pushDetail(
      AppRoutes.examPaper(paper.id),
      onReturn: () =>
          ref.read(examListControllerProvider.notifier).load(silent: true),
    );
  }

  Future<void> _refresh() async {
    await ref.read(examListControllerProvider.notifier).load(silent: true);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(examListControllerProvider);
    final colors = context.colors;

    return Scaffold(
      backgroundColor: colors.background,
      appBar: AppBar(
        elevation: 0,
        leading: IconButton(
          tooltip: '返回',
          icon: Icon(AppIcons.arrowBack, color: colors.text),
          onPressed: () => context.backOrHome(),
        ),
        title: Text(
          '试卷',
          style: TextStyle(
            fontSize: 18.sp,
            fontWeight: FontWeight.w600,
            color: colors.text,
          ),
        ),
        centerTitle: true,
        actions: [
          IconButton(
            tooltip: '刷新试卷列表',
            icon: Icon(AppIcons.refresh, color: colors.text),
            onPressed: _refresh,
          ),
        ],
      ),
      body: _buildBody(state, colors),
    );
  }

  Widget _buildBody(ExamListState state, AppColors colors) {
    if (state.phase == ExamListPhase.loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state.phase == ExamListPhase.error) {
      return AppErrorView(
        message: state.errorMessage ?? '请检查网络后重试',
        onRetry: () => ref.read(examListControllerProvider.notifier).load(),
      );
    }

    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        // 空列表时也要能下拉：否则空态变成一个「拉不动」的死屏。
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.symmetric(horizontal: 20.w, vertical: 16.h),
        children: [
          if (state.errorMessage != null && state.isEmpty)
            _ErrorBanner(message: state.errorMessage!),
          if (state.isEmpty)
            SizedBox(
              height: 380.h,
              child: AppEmptyView(
                emoji: '🗂️',
                title: '还没有试卷',
                hint: '自动组一份，做完就能看到成绩和逐题解析。',
                actionLabel: '自动组卷',
                onAction: _openGenerate,
              ),
            )
          else ...[
            _ExamOverviewCard(papers: state.papers),
            SizedBox(height: 16.h),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _openGenerate,
                style: FilledButton.styleFrom(
                  backgroundColor: colors.primary,
                  foregroundColor: colors.onPrimary,
                  minimumSize: const Size.fromHeight(48),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10.r),
                  ),
                ),
                icon: Icon(AppIcons.add, size: 18.sp),
                label: Text(
                  '自动组卷',
                  style: TextStyle(
                    fontSize: 15.sp,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
            if (state.errorMessage != null) ...[
              SizedBox(height: 12.h),
              _ErrorBanner(message: state.errorMessage!),
            ],
            SizedBox(height: 24.h),
            Row(
              children: [
                Text(
                  '我的试卷',
                  style: TextStyle(
                    fontSize: 15.sp,
                    fontWeight: FontWeight.w700,
                    color: colors.text,
                  ),
                ),
                SizedBox(width: 8.w),
                Text(
                  '${state.papers.length} 份',
                  style: TextStyle(
                    fontSize: 12.sp,
                    color: colors.textSecondary,
                  ),
                ),
              ],
            ),
            SizedBox(height: 12.h),
            for (final paper in state.papers) ...[
              _ExamPaperCard(paper: paper, onTap: () => _openPaper(paper)),
              SizedBox(height: 12.h),
            ],
          ],
        ],
      ),
    );
  }

  void _openPaper(ExamPaper paper) {
    context.pushDetail(
      AppRoutes.examPaper(paper.id),
      onReturn: () =>
          ref.read(examListControllerProvider.notifier).load(silent: true),
    );
  }
}

/// 顶部概览：共几份、做过几次、最好成绩。
///
/// 三个数都来自列表响应本身，不发额请求；「最好成绩」取各卷 `bestScore` 的最大值，
/// 没有成绩时显示「—」而不是 0 分（0 分是真实成绩，不能用来表示「没有」）。
class _ExamOverviewCard extends StatelessWidget {
  const _ExamOverviewCard({required this.papers});

  final List<ExamPaper> papers;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final attempts = papers.fold<int>(
      0,
      (sum, paper) => sum + paper.attemptCount,
    );
    final best = papers
        .map((paper) => examScorePercent(paper.bestScore))
        .fold<double>(0, math.max);
    final hasBest = papers.any((paper) => paper.bestScore != null);

    return Container(
      padding: EdgeInsets.all(20.w),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(18.r),
        border: Border.all(color: colors.border),
      ),
      child: Stack(
        children: [
          Positioned(
            right: -6.w,
            top: -16.h,
            child: Opacity(
              opacity: 0.08,
              child: Text('📝', style: TextStyle(fontSize: 88.sp)),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '整卷练习',
                style: TextStyle(
                  fontSize: 20.sp,
                  fontWeight: FontWeight.w700,
                  color: colors.text,
                  letterSpacing: -0.2,
                ),
              ),
              SizedBox(height: 6.h),
              Text(
                '限时做完再统一批改，成绩和错题会一起进历史与错题本。',
                style: TextStyle(
                  fontSize: 12.sp,
                  height: 1.6,
                  color: colors.textSecondary,
                ),
              ),
              SizedBox(height: 18.h),
              Row(
                children: [
                  _OverviewStat(label: '试卷', value: '${papers.length} 份'),
                  _OverviewDivider(color: colors.border),
                  _OverviewStat(label: '作答', value: '$attempts 次'),
                  _OverviewDivider(color: colors.border),
                  _OverviewStat(
                    label: '最好成绩',
                    value: hasBest ? '${best.round()} 分' : '—',
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _OverviewStat extends StatelessWidget {
  const _OverviewStat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 16.sp,
              fontWeight: FontWeight.w700,
              color: colors.text,
              fontFeatures: const <FontFeature>[FontFeature.tabularFigures()],
            ),
          ),
          SizedBox(height: 2.h),
          Text(
            label,
            style: TextStyle(fontSize: 11.sp, color: colors.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _OverviewDivider extends StatelessWidget {
  const _OverviewDivider({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 1,
      height: 28.h,
      margin: EdgeInsets.symmetric(horizontal: 12.w),
      color: color,
    );
  }
}

/// 一张试卷的卡片：名称、题量/时限/来源、最好成绩与作答次数。
class _ExamPaperCard extends StatelessWidget {
  const _ExamPaperCard({required this.paper, required this.onTap});

  final ExamPaper paper;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final score = examScorePercent(paper.bestScore);
    final lastAt = formatExamDateTime(paper.lastAttemptAt);

    return Semantics(
      button: true,
      label: '${paper.title}，${paper.totalQuestions} 题，${paper.durationLabel}',
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14.r),
        child: Container(
          padding: EdgeInsets.all(16.w),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(14.r),
            border: Border.all(color: colors.border),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      paper.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 16.sp,
                        fontWeight: FontWeight.w600,
                        height: 1.35,
                        color: colors.text,
                      ),
                    ),
                    SizedBox(height: 8.h),
                    Wrap(
                      spacing: 6.w,
                      runSpacing: 6.h,
                      children: [
                        _MetaChip(
                          label: '${paper.totalQuestions} 题',
                          background: colors.accentContainer,
                          foreground: colors.accent,
                        ),
                        _MetaChip(
                          label: paper.isTimed
                              ? '限时 ${paper.durationMinutes} 分钟'
                              : '固定题量',
                          background: paper.isTimed
                              ? colors.warningContainer
                              : colors.surfaceAlt,
                          foreground: paper.isTimed
                              ? colors.warning
                              : colors.textSecondary,
                        ),
                        _MetaChip(
                          label: paper.source == 'auto' ? '自动' : '手工',
                          background: colors.successContainer,
                          foreground: colors.success,
                        ),
                      ],
                    ),
                    if (lastAt != null) ...[
                      SizedBox(height: 8.h),
                      Text(
                        '最近作答 $lastAt',
                        style: TextStyle(
                          fontSize: 11.sp,
                          color: colors.textSecondary,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              SizedBox(width: 12.w),
              SizedBox(
                width: 72.w,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    if (paper.bestScore == null)
                      Text(
                        '未作答',
                        style: TextStyle(
                          fontSize: 13.sp,
                          fontWeight: FontWeight.w600,
                          color: colors.textSecondary,
                        ),
                      )
                    else
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        crossAxisAlignment: CrossAxisAlignment.baseline,
                        textBaseline: TextBaseline.alphabetic,
                        children: [
                          Text(
                            '${score.round()}',
                            style: TextStyle(
                              fontSize: 26.sp,
                              fontWeight: FontWeight.w700,
                              height: 1,
                              color: colors.text,
                              fontFeatures: const <FontFeature>[
                                FontFeature.tabularFigures(),
                              ],
                            ),
                          ),
                          SizedBox(width: 2.w),
                          Text(
                            '分',
                            style: TextStyle(
                              fontSize: 11.sp,
                              color: colors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    SizedBox(height: 4.h),
                    Text(
                      paper.bestScore == null ? '开始第一场' : '最好成绩',
                      textAlign: TextAlign.right,
                      style: TextStyle(
                        fontSize: 11.sp,
                        color: colors.textSecondary,
                      ),
                    ),
                    if (paper.attemptCount > 0) ...[
                      SizedBox(height: 2.h),
                      Text(
                        '做过 ${paper.attemptCount} 次',
                        textAlign: TextAlign.right,
                        style: TextStyle(
                          fontSize: 11.sp,
                          color: colors.textSecondary,
                        ),
                      ),
                    ],
                    SizedBox(height: 4.h),
                    Icon(
                      AppIcons.chevronRight,
                      size: 18.sp,
                      color: colors.textSecondary,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({
    required this.label,
    required this.background,
    required this.foreground,
  });

  final String label;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 7.w, vertical: 3.h),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(5.r),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11.sp,
          fontWeight: FontWeight.w600,
          color: foreground,
        ),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Container(
      width: double.infinity,
      margin: EdgeInsets.only(bottom: 12.h),
      padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 10.h),
      decoration: BoxDecoration(
        color: colors.warningContainer,
        borderRadius: BorderRadius.circular(8.r),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(AppIcons.cloudOffOutlined, size: 16.sp, color: colors.warning),
          SizedBox(width: 8.w),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                fontSize: 12.sp,
                height: 1.5,
                color: colors.text,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
