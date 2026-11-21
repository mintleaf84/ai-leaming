import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:skeletonizer/skeletonizer.dart';

import '../../../core/navigation/app_nav.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_icons.dart';
import '../../../shared/skeletons/skeleton_fakes.dart';
import '../../../shared/widgets/state_views.dart';
import 'widgets/wrong_book_bottom_bar.dart';
import 'widgets/wrong_book_question_card.dart';
import 'widgets/wrong_book_stats_bar.dart';
import 'widgets/wrong_book_tag_view.dart';
import 'widgets/wrong_book_view_tabs.dart';
import 'wrong_book_provider.dart';

/// 错题本页面
///
/// 统计条 / 视图切换 / 错题卡 / 按知识点分组 / 底部操作栏都在
/// `widgets/` 下（纯搬移，参数显式传入）；本文件只做状态分派与骨架屏。
class WrongBookScreen extends ConsumerStatefulWidget {
  const WrongBookScreen({super.key});

  @override
  ConsumerState<WrongBookScreen> createState() => _WrongBookScreenState();
}

class _WrongBookScreenState extends ConsumerState<WrongBookScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(
      () => ref.read(wrongBookControllerProvider.notifier).loadData(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(wrongBookControllerProvider);

    return Scaffold(
      backgroundColor: context.colors.background,
      appBar: AppBar(
        elevation: 0,
        leading: IconButton(
          tooltip: '返回',
          icon: Icon(AppIcons.arrowBack, color: context.colors.text),
          onPressed: () => context.backOrHome(),
        ),
        title: Text(
          '错题本',
          style: TextStyle(
            fontSize: 18.sp,
            fontWeight: FontWeight.w600,
            color: context.colors.text,
          ),
        ),
        centerTitle: true,
        actions: [
          IconButton(
            tooltip: '刷新错题本',
            icon: Icon(AppIcons.refresh, color: context.colors.text),
            onPressed: () =>
                ref.read(wrongBookControllerProvider.notifier).loadData(),
          ),
        ],
      ),
      body: state.isLoading
          ? _buildSkeleton()
          : state.error != null
          ? _buildErrorView()
          : Column(
              children: [
                // 统计卡片
                WrongBookStatsBar(stats: state.stats),
                // 视图切换
                WrongBookViewTabs(current: state.viewMode),
                // 内容区
                Expanded(child: _buildContent(state)),
              ],
            ),
      // 底部操作栏
      bottomNavigationBar:
          state.viewMode == WrongBookViewMode.list && state.questions.isNotEmpty
          ? WrongBookBottomBar(state: state)
          : null,
    );
  }

  // ==================== 内容区 ====================

  Widget _buildContent(WrongBookState state) {
    switch (state.viewMode) {
      case WrongBookViewMode.list:
        return _buildListView(state);
      case WrongBookViewMode.byTag:
        return _buildByTagView(state);
      case WrongBookViewMode.mastered:
        // 不可达：「已掌握」页签已移除（见 WrongBookViewTabs 注释）。
        // 枚举值暂时保留是为了不破坏既有调用方；真的走到这里就按列表展示。
        return _buildListView(state);
    }
  }

  // --- 列表视图 ---
  Widget _buildListView(WrongBookState state) {
    if (state.questions.isEmpty) {
      return _buildEmptyState();
    }

    return ListView.separated(
      padding: EdgeInsets.all(16.w),
      itemCount: state.questions.length,
      separatorBuilder: (context, index) => SizedBox(height: 10.h),
      itemBuilder: (context, index) {
        final q = state.questions[index];
        return WrongBookQuestionCard(
          question: q,
          isSelected: state.selectedIds.contains(q.questionId),
        );
      },
    );
  }

  // --- 按知识点视图 ---
  Widget _buildByTagView(WrongBookState state) {
    if (state.groupedByTag.isEmpty) {
      return _buildEmptyState();
    }

    return WrongBookTagView(groups: state.groupedByTag);
  }

  // ==================== 空状态 / 骨架屏 / 错误 ====================

  Widget _buildEmptyState() {
    // 列表视图为空 / 按知识点视图为空都走这里
    return const AppEmptyView(
      emoji: '\u{1F389}',
      title: '太棒了，没有错题！',
      hint: '继续保持，加油哦',
    );
  }

  Widget _buildErrorView() {
    return AppErrorView(
      message: '请检查网络后重试',
      onRetry: () => ref.read(wrongBookControllerProvider.notifier).loadData(),
    );
  }

  /// 加载态骨架：用 Skeletonizer 包裹真实错题卡片渲染器，布局与真实列表一致。
  ///
  /// 统计条（`WrongBookStatsBar` 需要真实 `WrongBookStats`）不复用，改用
  /// `Skeletonizer.zone` + `Bone` 画出同尺寸的占位条。
  Widget _buildSkeleton() {
    return Skeletonizer(
      enabled: true,
      child: Column(
        children: [
          // 统计卡片占位（高度/间距与 WrongBookStatsBar 对齐）。
          // 外层 Skeletonizer 已开启，Bone 直接交给它上色即可，不用再套 zone。
          Padding(
            padding: EdgeInsets.all(16.w),
            child: Row(
              children: [
                for (int i = 0; i < 3; i++) ...<Widget>[
                  if (i > 0) SizedBox(width: 12.w),
                  Expanded(
                    child: Bone(
                      height: 70.h,
                      borderRadius: BorderRadius.circular(12.r),
                    ),
                  ),
                ],
              ],
            ),
          ),
          // 错题列表占位（真实列表是 separated + 10.h 间隔，卡片无 margin）
          Expanded(
            child: ListView.builder(
              padding: EdgeInsets.all(16.w),
              itemCount: 3,
              itemBuilder: (context, index) => Padding(
                padding: EdgeInsets.only(bottom: 10.h),
                child: WrongBookQuestionCard(
                  question: fakeWrongQuestion(index: index),
                  isSelected: false,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
