import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../core/navigation/app_nav.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_icons.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/exam_paper.dart';
import 'exam_list_controller.dart';
import 'widgets/exam_error_banner.dart';
import 'widgets/exam_generate_sheet.dart';
import 'widgets/exam_paper_card.dart';
import 'widgets/exam_paper_overview_card.dart';

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
            ExamErrorBanner(message: state.errorMessage!),
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
            ExamPaperOverviewCard(papers: state.papers),
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
              ExamErrorBanner(message: state.errorMessage!),
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
              ExamPaperCard(paper: paper, onTap: () => _openPaper(paper)),
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
