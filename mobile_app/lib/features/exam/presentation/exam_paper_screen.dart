import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../core/navigation/app_nav.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_icons.dart';
import '../../../shared/widgets/state_views.dart';
import '../data/exam_repository.dart';
import '../domain/exam_paper.dart';
import '../domain/exam_submit_result.dart';
import 'exam_error_text.dart';
import 'exam_format.dart';

/// 试卷详情（预览）：题目清单 + 开始作答。
///
/// 预览页**不显示答案**：服务端在未交卷时也会把 `answer` 置空，但即使它没置空，
/// 这里也只渲染题干与选项数量——防作弊不能指望单侧。
final examPaperProvider = FutureProvider.autoDispose
    .family<ExamPaperDetail, int>(
      (ref, paperId) => ref.watch(examRepositoryProvider).getPaper(paperId),
      // 关掉 Riverpod 3 的自动重试：本页已经有「重试」按钮，而框架自动重试会把
      // 错误态换成转圈——用户既看不到失败原因，也点不到那个按钮。
      retry: (retryCount, error) => null,
    );

class ExamPaperScreen extends ConsumerStatefulWidget {
  const ExamPaperScreen({super.key, required this.paperId});

  final int paperId;

  @override
  ConsumerState<ExamPaperScreen> createState() => _ExamPaperScreenState();
}

class _ExamPaperScreenState extends ConsumerState<ExamPaperScreen> {
  bool _starting = false;
  String? _startError;

  Future<void> _start() async {
    if (_starting) return;
    setState(() {
      _starting = true;
      _startError = null;
    });
    try {
      final attempt = await ref
          .read(examRepositoryProvider)
          .startAttempt(widget.paperId);
      if (!mounted) return;
      if (attempt.sessionId.isEmpty) {
        // 没有 sessionId 就没法交卷：宁可报错，也不进一个「做了也不算」的屏。
        setState(() {
          _starting = false;
          _startError = '服务器没有返回作答编号，请稍后重试。';
        });
        return;
      }
      setState(() => _starting = false);
      context.pushDetail(
        AppRoutes.examSession(attempt.sessionId),
        extra: attempt,
      );
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _starting = false;
        _startError = describeExamError(error);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final detailState = ref.watch(examPaperProvider(widget.paperId));

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
          '试卷预览',
          style: TextStyle(
            fontSize: 18.sp,
            fontWeight: FontWeight.w600,
            color: colors.text,
          ),
        ),
        centerTitle: true,
      ),
      body: detailState.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => AppErrorView(
          message: describeExamError(error),
          onRetry: () => ref.invalidate(examPaperProvider(widget.paperId)),
        ),
        data: (detail) => _buildPreview(detail, colors),
      ),
      bottomNavigationBar: detailState.hasValue
          ? _buildStartBar(detailState.requireValue, colors)
          : null,
    );
  }

  Widget _buildPreview(ExamPaperDetail detail, AppColors colors) {
    final paper = detail.paper;
    return ListView.builder(
      padding: EdgeInsets.fromLTRB(20.w, 16.h, 20.w, 24.h),
      itemCount: detail.items.length + 2,
      itemBuilder: (context, index) {
        if (index == 0) return _buildHeader(paper, detail.lastAttempt, colors);
        if (index == 1) return _buildNotice(colors, detail.items.length);
        final item = detail.items[index - 2];
        return _buildItem(item, colors);
      },
    );
  }

  Widget _buildHeader(
    ExamPaper paper,
    ExamLastAttempt? lastAttempt,
    AppColors colors,
  ) {
    final lastAt = formatExamDateTime(lastAttempt?.submittedAt);
    final lastScore = lastAttempt?.score;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          paper.title,
          style: TextStyle(
            fontSize: 22.sp,
            fontWeight: FontWeight.w700,
            height: 1.35,
            color: colors.text,
            letterSpacing: -0.3,
          ),
        ),
        SizedBox(height: 10.h),
        Text(
          '${paper.totalQuestions} 题 · ${paper.durationLabel} · '
          '${paper.source == 'auto' ? '自动组卷' : '手工组卷'}',
          style: TextStyle(fontSize: 12.sp, color: colors.textSecondary),
        ),
        if (lastScore != null || lastAt != null) ...[
          SizedBox(height: 12.h),
          Container(
            padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 8.h),
            decoration: BoxDecoration(
              color: colors.surfaceAlt,
              borderRadius: BorderRadius.circular(8.r),
            ),
            child: Text(
              <String>[
                '上次作答',
                if (lastAt != null) lastAt,
                if (lastScore != null)
                  '${examScorePercent(lastScore).round()} 分',
              ].join(' · '),
              style: TextStyle(fontSize: 12.sp, color: colors.textSecondary),
            ),
          ),
        ],
        SizedBox(height: 24.h),
      ],
    );
  }

  Widget _buildNotice(AppColors colors, int itemCount) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: EdgeInsets.only(top: 2.h),
              child: Icon(
                AppIcons.infoOutline,
                size: 15.sp,
                color: colors.textSecondary,
              ),
            ),
            SizedBox(width: 6.w),
            Expanded(
              child: Text(
                '作答时不显示答案，交卷后统一批改。中途离开不会保存这次作答。',
                style: TextStyle(
                  fontSize: 12.sp,
                  height: 1.55,
                  color: colors.textSecondary,
                ),
              ),
            ),
          ],
        ),
        SizedBox(height: 20.h),
        Row(
          children: [
            Text(
              '题目清单',
              style: TextStyle(
                fontSize: 15.sp,
                fontWeight: FontWeight.w700,
                color: colors.text,
              ),
            ),
            SizedBox(width: 8.w),
            Text(
              '$itemCount 题',
              style: TextStyle(fontSize: 12.sp, color: colors.textSecondary),
            ),
          ],
        ),
        SizedBox(height: 4.h),
        if (itemCount == 0)
          Padding(
            padding: EdgeInsets.only(top: 8.h),
            child: Text(
              '题目清单暂时取不到，仍然可以直接开始作答。',
              style: TextStyle(fontSize: 12.sp, color: colors.textSecondary),
            ),
          ),
        SizedBox(height: 4.h),
      ],
    );
  }

  Widget _buildItem(ExamPaperItem item, AppColors colors) {
    final question = item.question;
    return Padding(
      padding: EdgeInsets.only(bottom: 10.h),
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: 14.w, vertical: 12.h),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(12.r),
          border: Border.all(color: colors.border),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 26.w,
              height: 26.w,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: colors.surfaceAlt,
                shape: BoxShape.circle,
              ),
              child: Text(
                '${item.position}',
                style: TextStyle(
                  fontSize: 11.sp,
                  fontWeight: FontWeight.w700,
                  color: colors.textSecondary,
                  fontFeatures: const <FontFeature>[
                    FontFeature.tabularFigures(),
                  ],
                ),
              ),
            ),
            SizedBox(width: 10.w),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    question.typeLabel,
                    style: TextStyle(
                      fontSize: 10.sp,
                      fontWeight: FontWeight.w600,
                      color: colors.accent,
                      letterSpacing: 0.4,
                    ),
                  ),
                  SizedBox(height: 3.h),
                  Text(
                    question.content,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 13.sp,
                      height: 1.5,
                      color: colors.text,
                    ),
                  ),
                  if (question.tags.isNotEmpty) ...[
                    SizedBox(height: 4.h),
                    Text(
                      question.tags.take(2).join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 10.sp,
                        color: colors.textSecondary,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStartBar(ExamPaperDetail detail, AppColors colors) {
    final paper = detail.paper;
    return Container(
      padding: EdgeInsets.fromLTRB(20.w, 12.h, 20.w, 16.h),
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(top: BorderSide(color: colors.border)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_startError != null) ...[
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(AppIcons.errorOutline, size: 15.sp, color: colors.error),
                  SizedBox(width: 6.w),
                  Expanded(
                    child: Text(
                      _startError!,
                      style: TextStyle(
                        fontSize: 12.sp,
                        height: 1.5,
                        color: colors.error,
                      ),
                    ),
                  ),
                ],
              ),
              SizedBox(height: 10.h),
            ],
            SizedBox(
              width: double.infinity,
              height: 48,
              child: FilledButton(
                onPressed: _starting ? null : _start,
                style: FilledButton.styleFrom(
                  backgroundColor: colors.primary,
                  foregroundColor: colors.onPrimary,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10.r),
                  ),
                ),
                child: Text(
                  _starting
                      ? '正在准备…'
                      : paper.isTimed
                      ? '开始作答（限时 ${paper.durationMinutes} 分钟）'
                      : '开始作答',
                  style: TextStyle(
                    fontSize: 15.sp,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
