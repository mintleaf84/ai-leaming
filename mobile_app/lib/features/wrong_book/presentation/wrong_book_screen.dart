import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../../../core/navigation/app_nav.dart';
import 'package:skeletonizer/skeletonizer.dart';
import 'wrong_book_provider.dart';
import '../../../shared/skeletons/skeleton_fakes.dart';
import '../domain/wrong_question.dart';
import '../../../core/theme/app_icons.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/state_views.dart';

/// 错题本页面
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
                _buildStatsBar(state.stats),
                // 视图切换
                _buildViewModeTabs(state.viewMode),
                // 内容区
                Expanded(child: _buildContent(state)),
              ],
            ),
      // 底部操作栏
      bottomNavigationBar:
          state.viewMode == WrongBookViewMode.list && state.questions.isNotEmpty
          ? _buildBottomBar(state)
          : null,
    );
  }

  // ==================== 统计卡片 ====================

  Widget _buildStatsBar(WrongBookStats stats) {
    return Container(
      padding: EdgeInsets.all(16.w),
      child: Row(
        children: [
          _buildStatCard('总错题', stats.total, context.colors.error),
          SizedBox(width: 12.w),
          _buildStatCard('近7天', stats.recent, context.colors.warning),
          SizedBox(width: 12.w),
          _buildStatCard('高频错题', stats.frequent, context.colors.accent),
        ],
      ),
    );
  }

  Widget _buildStatCard(String label, int value, Color color) {
    return Expanded(
      child: Container(
        padding: EdgeInsets.symmetric(vertical: 12.h, horizontal: 12.w),
        decoration: BoxDecoration(
          color: context.colors.surface,
          borderRadius: BorderRadius.circular(12.r),
          border: Border.all(color: context.colors.border),
        ),
        child: Column(
          children: [
            Text(
              '$value',
              style: TextStyle(
                fontSize: 24.sp,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            SizedBox(height: 4.h),
            Text(
              label,
              style: TextStyle(
                fontSize: 12.sp,
                color: context.colors.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ==================== 视图切换 ====================

  Widget _buildViewModeTabs(WrongBookViewMode current) {
    return Container(
      margin: EdgeInsets.symmetric(horizontal: 16.w),
      padding: EdgeInsets.all(4.w),
      decoration: BoxDecoration(
        color: context.colors.surface,
        borderRadius: BorderRadius.circular(10.r),
        border: Border.all(color: context.colors.border),
      ),
      child: Row(
        children: [
          _buildTab('列表', WrongBookViewMode.list, current),
          _buildTab('按知识点', WrongBookViewMode.byTag, current),
          _buildTab('已掌握', WrongBookViewMode.mastered, current),
        ],
      ),
    );
  }

  Widget _buildTab(
    String label,
    WrongBookViewMode mode,
    WrongBookViewMode current,
  ) {
    final isSelected = mode == current;
    return Expanded(
      child: GestureDetector(
        onTap: () =>
            ref.read(wrongBookControllerProvider.notifier).setViewMode(mode),
        child: Container(
          padding: EdgeInsets.symmetric(vertical: 10.h),
          decoration: BoxDecoration(
            color: isSelected ? context.colors.primary : Colors.transparent,
            borderRadius: BorderRadius.circular(8.r),
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13.sp,
              fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
              color: isSelected
                  ? context.colors.onPrimary
                  : context.colors.text,
            ),
          ),
        ),
      ),
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
        // 已掌握视图暂用占位（后续可扩展 API）
        return _buildMasteredPlaceholder();
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
        final isSelected = state.selectedIds.contains(q.questionId);
        return _buildQuestionCard(q, isSelected);
      },
    );
  }

  Widget _buildQuestionCard(WrongQuestion q, bool isSelected) {
    return GestureDetector(
      onTap: () => ref
          .read(wrongBookControllerProvider.notifier)
          .toggleSelect(q.questionId),
      child: Container(
        padding: EdgeInsets.all(14.w),
        decoration: BoxDecoration(
          color: context.colors.surface,
          borderRadius: BorderRadius.circular(12.r),
          border: Border.all(
            color: isSelected ? context.colors.accent : context.colors.border,
            width: isSelected ? 1.5 : 1,
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 复选框
            Container(
              width: 22.w,
              height: 22.w,
              margin: EdgeInsets.only(top: 2.h, right: 12.w),
              decoration: BoxDecoration(
                color: isSelected ? context.colors.accent : Colors.transparent,
                borderRadius: BorderRadius.circular(6.r),
                border: Border.all(
                  color: isSelected
                      ? context.colors.accent
                      : context.colors.border,
                  width: 1.5,
                ),
              ),
              child: isSelected
                  ? Icon(
                      AppIcons.check,
                      size: 14.sp,
                      color: context.colors.onAccent,
                    )
                  : null,
            ),
            // 内容
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    q.questionContent,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 14.sp,
                      fontWeight: FontWeight.w500,
                      color: context.colors.text,
                      height: 1.4,
                    ),
                  ),
                  SizedBox(height: 8.h),
                  Row(
                    children: [
                      // 错误次数
                      Container(
                        padding: EdgeInsets.symmetric(
                          horizontal: 6.w,
                          vertical: 2.h,
                        ),
                        decoration: BoxDecoration(
                          color: context.colors.errorContainer,
                          borderRadius: BorderRadius.circular(4.r),
                        ),
                        child: Text(
                          '错 ${q.wrongCount} 次',
                          style: TextStyle(
                            fontSize: 10.sp,
                            fontWeight: FontWeight.w600,
                            color: context.colors.error,
                          ),
                        ),
                      ),
                      SizedBox(width: 6.w),
                      // 标签
                      if (q.tags.isNotEmpty)
                        Container(
                          padding: EdgeInsets.symmetric(
                            horizontal: 6.w,
                            vertical: 2.h,
                          ),
                          decoration: BoxDecoration(
                            color: context.colors.surfaceAlt,
                            borderRadius: BorderRadius.circular(4.r),
                          ),
                          child: Text(
                            q.tags.first,
                            style: TextStyle(
                              fontSize: 12.sp,
                              color: context.colors.textSecondary,
                            ),
                          ),
                        ),
                      const Spacer(),
                      // 标记已掌握按钮
                      //
                      // 原来是 GestureDetector 包 11sp 的纯文字（实测约 33×15），
                      // 审计 #5：手指点不中。改 TextButton 并锁死最小 44×44。
                      TextButton(
                        onPressed: () {
                          ref
                              .read(wrongBookControllerProvider.notifier)
                              .markAsMastered(q.questionId);
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('已标记为掌握 ✅'),
                              duration: Duration(seconds: 1),
                            ),
                          );
                        },
                        style: TextButton.styleFrom(
                          foregroundColor: context.colors.success,
                          minimumSize: const Size(44, 44),
                          padding: EdgeInsets.symmetric(horizontal: 4.w),
                        ),
                        child: Text(
                          '已掌握',
                          style: TextStyle(
                            fontSize: 12.sp,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // --- 按知识点视图 ---
  Widget _buildByTagView(WrongBookState state) {
    if (state.groupedByTag.isEmpty) {
      return _buildEmptyState();
    }

    return ListView.builder(
      padding: EdgeInsets.all(16.w),
      itemCount: state.groupedByTag.length,
      itemBuilder: (context, index) {
        final group = state.groupedByTag[index];
        return Container(
          margin: EdgeInsets.only(bottom: 10.h),
          decoration: BoxDecoration(
            color: context.colors.surface,
            borderRadius: BorderRadius.circular(12.r),
            border: Border.all(color: context.colors.border),
          ),
          child: ExpansionTile(
            tilePadding: EdgeInsets.symmetric(horizontal: 16.w),
            childrenPadding: EdgeInsets.fromLTRB(16.w, 0, 16.w, 12.h),
            title: Row(
              children: [
                Container(
                  padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 4.h),
                  decoration: BoxDecoration(
                    color: context.colors.accentContainer,
                    borderRadius: BorderRadius.circular(6.r),
                  ),
                  child: Text(
                    group.tag,
                    style: TextStyle(
                      fontSize: 13.sp,
                      fontWeight: FontWeight.w600,
                      color: context.colors.accent,
                    ),
                  ),
                ),
                const Spacer(),
                Text(
                  '${group.count} 题',
                  style: TextStyle(
                    fontSize: 12.sp,
                    color: context.colors.textSecondary,
                  ),
                ),
              ],
            ),
            children: group.questions.map((q) {
              return Padding(
                padding: EdgeInsets.only(bottom: 8.h),
                child: Row(
                  children: [
                    Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: 5.w,
                        vertical: 2.h,
                      ),
                      decoration: BoxDecoration(
                        color: context.colors.errorContainer,
                        borderRadius: BorderRadius.circular(4.r),
                      ),
                      child: Text(
                        '×${q.wrongCount}',
                        style: TextStyle(
                          fontSize: 10.sp,
                          fontWeight: FontWeight.bold,
                          color: context.colors.error,
                        ),
                      ),
                    ),
                    SizedBox(width: 8.w),
                    Expanded(
                      child: Text(
                        q.questionContent,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 13.sp,
                          color: context.colors.text,
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
        );
      },
    );
  }

  // --- 已掌握占位 ---
  Widget _buildMasteredPlaceholder() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text('🏆', style: TextStyle(fontSize: 48.sp)),
          SizedBox(height: 16.h),
          Text(
            '已掌握的错题会显示在这里',
            style: TextStyle(
              fontSize: 16.sp,
              color: context.colors.textSecondary,
            ),
          ),
          SizedBox(height: 8.h),
          Text(
            '在列表中点击"已掌握"将题目归档',
            style: TextStyle(
              fontSize: 13.sp,
              color: context.colors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }

  // ==================== 底部操作栏 ====================

  Widget _buildBottomBar(WrongBookState state) {
    final count = state.selectedIds.length;
    return Container(
      padding: EdgeInsets.only(
        left: 16.w,
        right: 16.w,
        top: 12.h,
        bottom: MediaQuery.of(context).padding.bottom + 12.h,
      ),
      decoration: BoxDecoration(
        color: context.colors.surface,
        border: Border(top: BorderSide(color: context.colors.border)),
      ),
      child: Row(
        children: [
          // 全选
          //
          // 原来是 GestureDetector 包一行图标+文字，命中区只有 20sp 图标那么高，
          // 审计 #5：手指点不中。TextButton 自带 Material/InkWell，最小 44×44。
          TextButton.icon(
            onPressed: () =>
                ref.read(wrongBookControllerProvider.notifier).selectAll(),
            icon: Icon(
              count == state.questions.length
                  ? AppIcons.checkBoxSolid
                  : AppIcons.checkBoxOutlineBlank,
              size: 20.sp,
              color: context.colors.text,
            ),
            label: Text(
              '全选',
              style: TextStyle(fontSize: 13.sp, color: context.colors.text),
            ),
            style: TextButton.styleFrom(
              minimumSize: const Size(44, 44),
              padding: EdgeInsets.symmetric(horizontal: 8.w),
            ),
          ),
          const Spacer(),
          // 开始练习
          SizedBox(
            // 触屏命中区下限 44（审计 #5）
            height: 44.h,
            child: ElevatedButton(
              onPressed: count == 0 || state.isCreatingPractice
                  ? null
                  : () async {
                      final sessionId = await ref
                          .read(wrongBookControllerProvider.notifier)
                          .startPractice();
                      if (sessionId != null && mounted) {
                        // 走 extra 传参：/practice 只读 state.extra，用 query 传
                        // sessionId 会被静默忽略、变成随机新练习。
                        context.pushDetail(
                          AppRoutes.practice,
                          extra: {'sessionId': sessionId, 'mode': 'review'},
                          // 回来时页面仍挂载，必须手动刷新：练习会改变错题状态与统计
                          onReturn: () => ref
                              .read(wrongBookControllerProvider.notifier)
                              .loadData(),
                        );
                      } else if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('创建练习失败，请重试')),
                        );
                      }
                    },
              style: ElevatedButton.styleFrom(
                backgroundColor: context.colors.accent,
                foregroundColor: context.colors.onAccent,
                disabledBackgroundColor: context.colors.surfaceAlt,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8.r),
                ),
              ),
              child: state.isCreatingPractice
                  ? SizedBox(
                      width: 18.sp,
                      height: 18.sp,
                      child: CircularProgressIndicator(
                        color: context.colors.onAccent,
                        strokeWidth: 2,
                      ),
                    )
                  : Text(
                      count > 0 ? '开始练习 ($count)' : '请选择题目',
                      style: TextStyle(
                        fontSize: 14.sp,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
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
  /// 统计条（`_buildStatCard` 需要真实 `WrongBookStats`）不复用，改用
  /// `Skeletonizer.zone` + `Bone` 画出同尺寸的占位条。
  Widget _buildSkeleton() {
    return Skeletonizer(
      enabled: true,
      child: Column(
        children: [
          // 统计卡片占位（高度/间距与 _buildStatsBar 对齐）。
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
                child: _buildQuestionCard(
                  fakeWrongQuestion(index: index),
                  false,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
