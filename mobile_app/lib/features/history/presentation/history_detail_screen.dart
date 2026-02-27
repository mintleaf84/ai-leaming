import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'history_provider.dart';
import '../../settings/presentation/settings_provider.dart';
import '../domain/history_item.dart';
import '../domain/practice_log.dart';
import '../../../shared/widgets/skeleton_loading.dart';
import 'dart:math' as math;
import '../../../shared/widgets/first_principles_section.dart';

class HistoryDetailScreen extends ConsumerStatefulWidget {
  final String sessionId;

  const HistoryDetailScreen({super.key, required this.sessionId});

  @override
  ConsumerState<HistoryDetailScreen> createState() =>
      _HistoryDetailScreenState();
}

class _HistoryDetailScreenState extends ConsumerState<HistoryDetailScreen> {
  bool _showWrongOnly = false;

  @override
  Widget build(BuildContext context) {
    final asyncState = ref.watch(historyDetailProvider(widget.sessionId));
    final settingsState = ref.watch(settingsProvider);
    final reviewMode = settingsState.reviewMode;

    final theme = Theme.of(context);
    final bgColor = theme.scaffoldBackgroundColor;
    final cardColor = theme.cardColor;
    final textColor = theme.colorScheme.onSurface;
    final secondaryColor = theme.brightness == Brightness.dark
        ? const Color(0xFF8A8A8A)
        : const Color(0xFF787774);
    final borderColor = theme.dividerColor;

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: cardColor,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: textColor),
          onPressed: () => context.go('/history'),
        ),
        title: Text(
          '练习详情',
          style: TextStyle(
            fontSize: 18.sp,
            fontWeight: FontWeight.w600,
            color: textColor,
          ),
        ),
        centerTitle: true,
        actions: [
          IconButton(
            icon: Icon(
              _showWrongOnly ? Icons.filter_alt : Icons.filter_alt_outlined,
            ),
            color: _showWrongOnly ? const Color(0xFFEB5757) : textColor,
            onPressed: () => setState(() => _showWrongOnly = !_showWrongOnly),
          ),
        ],
      ),
      body: asyncState.when(
        loading: () => const HistoryDetailSkeletonList(),
        error: (error, _) => _buildErrorView(error.toString(), textColor),
        data: (state) => reviewMode == ReviewMode.immersive
            ? _buildImmersiveBody(
                state,
                cardColor,
                textColor,
                secondaryColor,
                borderColor,
              )
            : _buildListBody(
                state,
                cardColor,
                textColor,
                secondaryColor,
                borderColor,
              ),
      ),
    );
  }

  Widget _buildErrorView(String error, Color textColor) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.error_outline, size: 48.sp, color: Colors.red),
          SizedBox(height: 16.h),
          Text(
            '加载失败',
            style: TextStyle(fontSize: 18.sp, color: textColor),
          ),
          SizedBox(height: 16.h),
          ElevatedButton(
            onPressed: () =>
                ref.invalidate(historyDetailProvider(widget.sessionId)),
            child: const Text('重试'),
          ),
        ],
      ),
    );
  }

  // --- 清单模式 ---

  Widget _buildListBody(
    HistoryDetailState state,
    Color cardColor,
    Color textColor,
    Color secondaryColor,
    Color borderColor,
  ) {
    if (state.isLoading) {
      return const HistoryDetailSkeletonList();
    }
    if (state.session == null) {
      return Center(
        child: Text('未找到记录', style: TextStyle(color: textColor)),
      );
    }

    final allLogs = state.logs;
    final filteredLogs = _showWrongOnly
        ? allLogs.where((log) => !log.isCorrect).toList()
        : allLogs;

    return SingleChildScrollView(
      padding: EdgeInsets.all(16.w),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildSummaryCard(
            state.session!,
            cardColor,
            textColor,
            secondaryColor,
          ),
          SizedBox(height: 20.h),
          _buildFilterBar(textColor, secondaryColor, allLogs),
          SizedBox(height: 12.h),
          if (filteredLogs.isEmpty)
            _buildEmptyState(secondaryColor)
          else
            ...filteredLogs.asMap().entries.map((entry) {
              final log = entry.value;
              final actualIndex = allLogs.indexOf(log);
              return _buildListQuestionCard(
                actualIndex + 1,
                log,
                cardColor,
                textColor,
                secondaryColor,
                borderColor,
              );
            }),
        ],
      ),
    );
  }

  // --- 沉浸模式 ---

  Widget _buildImmersiveBody(
    HistoryDetailState state,
    Color cardColor,
    Color textColor,
    Color secondaryColor,
    Color borderColor,
  ) {
    if (state.isLoading) {
      return const HistoryDetailSkeletonList();
    }
    if (state.session == null) {
      return Center(
        child: Text('未找到记录', style: TextStyle(color: textColor)),
      );
    }

    final allLogs = state.logs;
    final filteredLogs = _showWrongOnly
        ? allLogs.where((log) => !log.isCorrect).toList()
        : allLogs;

    // Page 0 is summary, Pages 1..N are questions
    final totalPages = filteredLogs.length + 1;

    return PageView.builder(
      itemCount: totalPages,
      itemBuilder: (context, index) {
        if (index == 0) {
          return Center(
            child: Padding(
              padding: EdgeInsets.all(24.w),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _buildSummaryCard(
                    state.session!,
                    cardColor,
                    textColor,
                    secondaryColor,
                  ),
                  SizedBox(height: 48.h),
                  if (filteredLogs.isNotEmpty) ...[
                    Icon(Icons.swipe_left, size: 32.sp, color: secondaryColor),
                    SizedBox(height: 8.h),
                    Text(
                      '左滑开始复习',
                      style: TextStyle(fontSize: 14.sp, color: secondaryColor),
                    ),
                  ] else if (_showWrongOnly) ...[
                    Text('🎉', style: TextStyle(fontSize: 40.sp)),
                    SizedBox(height: 8.h),
                    Text(
                      '太棒了！没有错题',
                      style: TextStyle(fontSize: 16.sp, color: secondaryColor),
                    ),
                  ],
                ],
              ),
            ),
          );
        }

        final log = filteredLogs[index - 1];
        final actualIndex = allLogs.indexOf(log);
        return _buildImmersiveQuestionCard(
          actualIndex + 1,
          log,
          cardColor,
          textColor,
          secondaryColor,
          borderColor,
        );
      },
    );
  }

  // --- 共有组件 ---

  Widget _buildSummaryCard(
    HistoryItem session,
    Color cardColor,
    Color textColor,
    Color secondaryColor,
  ) {
    String formattedTime = '';
    try {
      final dateTime = DateTime.parse(session.createdAt);
      formattedTime = DateFormat('yyyy年MM月dd日 HH:mm').format(dateTime);
    } catch (_) {
      formattedTime = session.createdAt;
    }

    final accuracy = session.accuracy / 100.0;
    final accuracyColor = _getAccuracyColor(session.accuracy);

    return Container(
      padding: EdgeInsets.all(20.w),
      decoration: BoxDecoration(
        color: cardColor,
        borderRadius: BorderRadius.circular(16.r),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            children: [
              Icon(Icons.access_time, size: 16.sp, color: secondaryColor),
              SizedBox(width: 6.w),
              Text(
                formattedTime,
                style: TextStyle(fontSize: 13.sp, color: secondaryColor),
              ),
            ],
          ),
          SizedBox(height: 20.h),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              SizedBox(
                width: 100.w,
                height: 100.h,
                child: CustomPaint(
                  painter: _CircularProgressPainter(
                    progress: accuracy,
                    progressColor: accuracyColor,
                    backgroundColor: secondaryColor.withValues(alpha: 0.2),
                    strokeWidth: 8.w,
                  ),
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          '${session.accuracy}%',
                          style: TextStyle(
                            fontSize: 24.sp,
                            fontWeight: FontWeight.bold,
                            color: accuracyColor,
                          ),
                        ),
                        Text(
                          '正确率',
                          style: TextStyle(
                            fontSize: 10.sp,
                            color: secondaryColor,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildStatRow(
                    '✓ 答对',
                    '${session.correctCount}',
                    const Color(0xFF4EA05E),
                    textColor,
                  ),
                  SizedBox(height: 8.h),
                  _buildStatRow(
                    '✗ 答错',
                    '${session.totalQuestions - session.correctCount}',
                    const Color(0xFFD95656),
                    textColor,
                  ),
                  SizedBox(height: 8.h),
                  _buildStatRow(
                    '总题数',
                    '${session.totalQuestions}',
                    secondaryColor,
                    textColor,
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatRow(
    String label,
    String value,
    Color labelColor,
    Color valueColor,
  ) {
    return Row(
      children: [
        Text(
          label,
          style: TextStyle(fontSize: 13.sp, color: labelColor),
        ),
        SizedBox(width: 12.w),
        Text(
          value,
          style: TextStyle(
            fontSize: 18.sp,
            fontWeight: FontWeight.bold,
            color: valueColor,
          ),
        ),
      ],
    );
  }

  Widget _buildFilterBar(
    Color textColor,
    Color secondaryColor,
    List<PracticeLog> logs,
  ) {
    final wrongCount = logs.where((log) => !log.isCorrect).length;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          '题目回顾',
          style: TextStyle(
            fontSize: 16.sp,
            fontWeight: FontWeight.bold,
            color: textColor,
          ),
        ),
        if (_showWrongOnly)
          Text(
            '只看错题 ($wrongCount)',
            style: TextStyle(
              fontSize: 12.sp,
              fontWeight: FontWeight.w500,
              color: const Color(0xFFEB5757),
            ),
          ),
      ],
    );
  }

  Widget _buildEmptyState(Color secondaryColor) {
    return Center(
      child: Padding(
        padding: EdgeInsets.symmetric(vertical: 40.h),
        child: Column(
          children: [
            Text('🎉', style: TextStyle(fontSize: 48.sp)),
            SizedBox(height: 12.h),
            Text(
              _showWrongOnly ? '太棒了！没有错题' : '暂无题目',
              style: TextStyle(fontSize: 16.sp, color: secondaryColor),
            ),
          ],
        ),
      ),
    );
  }

  // --- 卡片组件 ---

  Widget _buildListQuestionCard(
    int questionNumber,
    PracticeLog log,
    Color cardColor,
    Color textColor,
    Color secondaryColor,
    Color borderColor,
  ) {
    final isCorrect = log.isCorrect;
    final statusColor = isCorrect
        ? const Color(0xFF4CAF50)
        : const Color(0xFFEF5350);

    return Container(
      margin: EdgeInsets.only(bottom: 12.h),
      decoration: BoxDecoration(
        color: cardColor,
        borderRadius: BorderRadius.circular(12.r),
        border: Border.all(color: borderColor),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12.r),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(width: 4.w, height: 80.h, color: statusColor),
            Expanded(
              child: ExpansionTile(
                tilePadding: EdgeInsets.symmetric(
                  horizontal: 12.w,
                  vertical: 4.h,
                ),
                childrenPadding: EdgeInsets.zero,
                leading: Container(
                  width: 32.w,
                  height: 32.h,
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8.r),
                  ),
                  child: Center(
                    child: Text(
                      '$questionNumber',
                      style: TextStyle(
                        fontSize: 14.sp,
                        fontWeight: FontWeight.bold,
                        color: statusColor,
                      ),
                    ),
                  ),
                ),
                title: _buildQuestionTitle(log, textColor, secondaryColor),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      isCorrect ? Icons.check_circle : Icons.cancel,
                      size: 20.sp,
                      color: statusColor,
                    ),
                    SizedBox(width: 4.w),
                    Icon(Icons.expand_more, size: 20.sp, color: secondaryColor),
                  ],
                ),
                iconColor: secondaryColor,
                collapsedIconColor: secondaryColor,
                children: [
                  Container(
                    padding: EdgeInsets.fromLTRB(16.w, 0, 16.w, 16.h),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Divider(color: borderColor, height: 1),
                        SizedBox(height: 12.h),
                        _buildOptionsList(log, textColor, borderColor),
                        if (log.explanation.isNotEmpty)
                          _buildExplanation(
                            log.explanation,
                            textColor,
                            secondaryColor,
                          ),
                        FirstPrinciplesSection(log: log),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildImmersiveQuestionCard(
    int questionNumber,
    PracticeLog log,
    Color cardColor,
    Color textColor,
    Color secondaryColor,
    Color borderColor,
  ) {
    final isCorrect = log.isCorrect;
    final statusColor = isCorrect
        ? const Color(0xFF4CAF50)
        : const Color(0xFFEF5350);

    return Container(
      margin: EdgeInsets.symmetric(horizontal: 16.w, vertical: 12.h),
      decoration: BoxDecoration(
        color: cardColor,
        borderRadius: BorderRadius.circular(20.r),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 15,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: Column(
        children: [
          // Header
          Container(
            padding: EdgeInsets.symmetric(horizontal: 20.w, vertical: 16.h),
            decoration: BoxDecoration(
              border: Border(bottom: BorderSide(color: borderColor)),
            ),
            child: Row(
              children: [
                Container(
                  padding: EdgeInsets.symmetric(
                    horizontal: 10.w,
                    vertical: 4.h,
                  ),
                  decoration: BoxDecoration(
                    color: statusColor,
                    borderRadius: BorderRadius.circular(12.r),
                  ),
                  child: Text(
                    '第 $questionNumber 题',
                    style: TextStyle(
                      fontSize: 12.sp,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ),
                SizedBox(width: 8.w),
                if (!isCorrect)
                  Text(
                    '答错了',
                    style: TextStyle(
                      fontSize: 12.sp,
                      color: statusColor,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                const Spacer(),
                // Tags could go here
              ],
            ),
          ),
          // Scrollable Content
          Expanded(
            child: SingleChildScrollView(
              padding: EdgeInsets.all(20.w),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildTags(log.tags, secondaryColor),
                  SizedBox(height: 12.h),
                  Text(
                    log.questionContent,
                    style: TextStyle(
                      fontSize: 18.sp,
                      fontWeight: FontWeight.w600,
                      color: textColor,
                      height: 1.5,
                      fontFamily: 'Noto Serif SC', // 使用衬线字体增强阅读感
                    ),
                  ),
                  SizedBox(height: 24.h),
                  _buildOptionsList(log, textColor, borderColor),
                  SizedBox(height: 24.h),
                  if (log.explanation.isNotEmpty)
                    _buildExplanation(
                      log.explanation,
                      textColor,
                      secondaryColor,
                    ),
                  FirstPrinciplesSection(log: log),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuestionTitle(
    PracticeLog log,
    Color textColor,
    Color secondaryColor,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (log.tags.isNotEmpty)
          Padding(
            padding: EdgeInsets.only(bottom: 6.h),
            child: _buildTags(log.tags, secondaryColor),
          ),
        Text(
          log.questionContent,
          style: TextStyle(
            fontSize: 14.sp,
            fontWeight: FontWeight.w500,
            color: textColor,
            height: 1.4,
          ),
        ),
      ],
    );
  }

  Widget _buildTags(List<String> tags, Color secondaryColor) {
    if (tags.isEmpty) return const SizedBox.shrink();
    return Wrap(
      spacing: 6.w,
      runSpacing: 4.h,
      children: tags
          .map(
            (tag) => Container(
              padding: EdgeInsets.symmetric(horizontal: 6.w, vertical: 2.h),
              decoration: BoxDecoration(
                color: secondaryColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(4.r),
              ),
              child: Text(
                tag,
                style: TextStyle(fontSize: 10.sp, color: secondaryColor),
              ),
            ),
          )
          .toList(),
    );
  }

  Widget _buildOptionsList(
    PracticeLog log,
    Color textColor,
    Color borderColor,
  ) {
    return Column(
      children: log.options.asMap().entries.map((entry) {
        final index = entry.key;
        final optionText = entry.value;
        final optionLabel = String.fromCharCode(65 + index);

        final bool isSelected = log.userAnswer == optionLabel;
        final bool isTargetCorrect = log.correctAnswer == optionLabel;

        Color optionBg = Colors.transparent;
        Color optionBorder = borderColor.withValues(alpha: 0.5);
        Color optionTextCol = textColor;

        if (isTargetCorrect) {
          optionBg = const Color(0xFF4CAF50).withValues(alpha: 0.1);
          optionBorder = const Color(0xFF4CAF50);
          optionTextCol = const Color(0xFF2E7D32);
        } else if (isSelected && !log.isCorrect) {
          optionBg = const Color(0xFFEF5350).withValues(alpha: 0.1);
          optionBorder = const Color(0xFFEF5350);
          optionTextCol = const Color(0xFFC62828);
        }

        return Container(
          margin: EdgeInsets.only(bottom: 8.h),
          padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 12.h),
          decoration: BoxDecoration(
            color: optionBg,
            borderRadius: BorderRadius.circular(8.r),
            border: Border.all(color: optionBorder),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '$optionLabel.',
                style: TextStyle(
                  fontSize: 14.sp,
                  fontWeight: FontWeight.bold,
                  color: optionTextCol,
                ),
              ),
              SizedBox(width: 8.w),
              Expanded(
                child: Text(
                  optionText,
                  style: TextStyle(
                    fontSize: 14.sp,
                    color: optionTextCol,
                    height: 1.4,
                  ),
                ),
              ),
              if (isTargetCorrect)
                Icon(Icons.check_circle, size: 16.sp, color: optionBorder),
              if (isSelected && !log.isCorrect)
                Icon(Icons.cancel, size: 16.sp, color: optionBorder),
            ],
          ),
        );
      }).toList(),
    );
  }

  Widget _buildExplanation(
    String explanation,
    Color textColor,
    Color secondaryColor,
  ) {
    return Container(
      margin: EdgeInsets.only(top: 16.h),
      padding: EdgeInsets.all(16.w),
      decoration: BoxDecoration(
        color: secondaryColor.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8.r),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.lightbulb_outline,
                size: 18.sp,
                color: const Color(0xFFFF9500),
              ),
              SizedBox(width: 6.w),
              Text(
                '解析',
                style: TextStyle(
                  fontSize: 14.sp,
                  fontWeight: FontWeight.bold,
                  color: textColor,
                ),
              ),
            ],
          ),
          SizedBox(height: 8.h),
          Text(
            explanation,
            style: TextStyle(fontSize: 14.sp, color: textColor, height: 1.6),
          ),
        ],
      ),
    );
  }

  Color _getAccuracyColor(int accuracy) {
    if (accuracy >= 80) return const Color(0xFF4EA05E);
    if (accuracy >= 60) return const Color(0xFFFF9500);
    return const Color(0xFFD95656);
  }
}

class _CircularProgressPainter extends CustomPainter {
  final double progress;
  final Color progressColor;
  final Color backgroundColor;
  final double strokeWidth;

  _CircularProgressPainter({
    required this.progress,
    required this.progressColor,
    required this.backgroundColor,
    required this.strokeWidth,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.width - strokeWidth) / 2;

    final bgPaint = Paint()
      ..color = backgroundColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;
    canvas.drawCircle(center, radius, bgPaint);

    final progressPaint = Paint()
      ..color = progressColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -math.pi / 2,
      2 * math.pi * progress,
      false,
      progressPaint,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}
