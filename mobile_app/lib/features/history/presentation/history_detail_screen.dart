import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:skeletonizer/skeletonizer.dart';

import '../../../core/navigation/app_nav.dart';
import '../../../core/settings/settings_provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_icons.dart';
import '../../../shared/skeletons/skeleton_fakes.dart';
import '../../../shared/widgets/state_views.dart';
import 'history_provider.dart';
import 'widgets/filter_bar.dart';
import 'widgets/immersive_question_card.dart';
import 'widgets/question_card.dart';
import 'widgets/summary_card.dart';

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
    final secondaryColor = context.colors.textSecondary;
    final borderColor = theme.dividerColor;

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: cardColor,
        elevation: 0,
        leading: IconButton(
          tooltip: '返回',
          icon: Icon(AppIcons.arrowBack, color: textColor),
          onPressed: () => context.backOrHome(),
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
            tooltip: _showWrongOnly ? '显示全部题目' : '只看错题',
            icon: Icon(
              _showWrongOnly ? AppIcons.filterAlt : AppIcons.filterAltOutlined,
            ),
            color: _showWrongOnly ? context.colors.error : textColor,
            onPressed: () => setState(() => _showWrongOnly = !_showWrongOnly),
          ),
        ],
      ),
      body: asyncState.when(
        loading: () => _buildSkeleton(),
        error: (error, _) {
          // 原始异常只进日志，界面用统一文案（审计 #24）。
          debugPrint('[HistoryDetail] 加载失败: $error');
          return AppErrorView(
            message: '这段练习记录没加载出来。',
            onRetry: () => ref.invalidate(historyDetailProvider(widget.sessionId)),
          );
        },
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

  /// 加载骨架：用清单版卡片撑出布局，由 Skeletonizer 统一涂成灰块
  Widget _buildSkeleton() {
    final theme = Theme.of(context);
    final cardColor = theme.cardColor;
    final textColor = theme.colorScheme.onSurface;
    final secondaryColor = context.colors.textSecondary;
    final borderColor = theme.dividerColor;

    return Skeletonizer(
      enabled: true,
      child: ListView.builder(
        padding: EdgeInsets.all(16.w),
        itemCount: 3,
        itemBuilder: (context, index) => HistoryQuestionCard(
          questionNumber: index + 1,
          log: fakePracticeLog(index: index),
          cardColor: cardColor,
          textColor: textColor,
          secondaryColor: secondaryColor,
          borderColor: borderColor,
        ),
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
      return _buildSkeleton();
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
          HistorySummaryCard(
            session: state.session!,
            cardColor: cardColor,
            textColor: textColor,
            secondaryColor: secondaryColor,
          ),
          SizedBox(height: 20.h),
          HistoryFilterBar(
            showWrongOnly: _showWrongOnly,
            logs: allLogs,
            textColor: textColor,
            secondaryColor: secondaryColor,
          ),
          SizedBox(height: 12.h),
          if (filteredLogs.isEmpty)
            AppEmptyView(
              emoji: '🎉',
              title: _showWrongOnly ? '太棒了！没有错题' : '暂无题目',
            )
          else
            ...filteredLogs.asMap().entries.map((entry) {
              final log = entry.value;
              final actualIndex = allLogs.indexOf(log);
              return HistoryQuestionCard(
                questionNumber: actualIndex + 1,
                log: log,
                cardColor: cardColor,
                textColor: textColor,
                secondaryColor: secondaryColor,
                borderColor: borderColor,
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
      return _buildSkeleton();
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
                  HistorySummaryCard(
                    session: state.session!,
                    cardColor: cardColor,
                    textColor: textColor,
                    secondaryColor: secondaryColor,
                  ),
                  SizedBox(height: 48.h),
                  if (filteredLogs.isNotEmpty) ...[
                    Icon(AppIcons.swipeLeft, size: 32.sp, color: secondaryColor),
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
        return HistoryImmersiveQuestionCard(
          questionNumber: actualIndex + 1,
          log: log,
          cardColor: cardColor,
          textColor: textColor,
          secondaryColor: secondaryColor,
          borderColor: borderColor,
        );
      },
    );
  }
}
