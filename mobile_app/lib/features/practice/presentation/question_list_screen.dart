import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:skeletonizer/skeletonizer.dart';

import '../../../core/navigation/app_nav.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_icons.dart';
import '../../../shared/skeletons/skeleton_fakes.dart';
import '../../../shared/widgets/empty_state.dart';
import 'questions_provider.dart';
import 'widgets/question_list_card.dart';

/// 全量题库列表页。
///
/// 卡片与「题目预览」弹层在 `widgets/` 下（纯搬移）；本文件只保留搜索、分页
/// 触底加载与三态（骨架 / 空 / 失败）。
class QuestionListScreen extends ConsumerStatefulWidget {
  const QuestionListScreen({super.key});

  @override
  ConsumerState<QuestionListScreen> createState() => _QuestionListScreenState();
}

class _QuestionListScreenState extends ConsumerState<QuestionListScreen> {
  final ScrollController _scrollController = ScrollController();
  /// 搜索框的输入：空态里的「清空搜索」要同时清掉输入框与查询词，
  /// 否则框里还留着旧词、列表却是全部的，看起来像没生效。
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      ref.read(questionsControllerProvider.notifier).fetchQuestions();
    }
  }

  @override
  Widget build(BuildContext context) {
    final questionsState = ref.watch(questionsControllerProvider);
    final theme = Theme.of(context);

    final bgColor = theme.scaffoldBackgroundColor;
    final textColor = theme.colorScheme.onSurface;
    final secondaryColor = context.colors.textSecondary;

    return Scaffold(
      backgroundColor: bgColor,
      body: SafeArea(
        child: Column(
          children: [
            // Header
            Padding(
              padding: EdgeInsets.fromLTRB(16.w, 16.h, 16.w, 8.h),
              child: Row(
                children: [
                  IconButton(
                    tooltip: '返回',
                    onPressed: () => context.backOrHome(),
                    icon: Icon(AppIcons.arrowBack, color: textColor),
                  ),
                  Text('📚', style: TextStyle(fontSize: 28.sp)),
                  SizedBox(width: 8.w),
                  Expanded(
                    child: Text(
                      '全量题库',
                      style: TextStyle(
                        fontSize: 24.sp,
                        fontWeight: FontWeight.bold,
                        color: textColor,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Search Bar
            Padding(
              padding: EdgeInsets.symmetric(horizontal: 20.w, vertical: 8.h),
              child: Container(
                height: 44.h,
                decoration: BoxDecoration(
                  color: context.colors.surfaceAlt,
                  borderRadius: BorderRadius.circular(8.r),
                ),
                child: TextField(
                  controller: _searchController,
                  decoration: InputDecoration(
                    hintText: '搜索题目内容或标签...',
                    hintStyle: TextStyle(
                      color: secondaryColor,
                      fontSize: 14.sp,
                    ),
                    prefixIcon: Icon(
                      AppIcons.search,
                      color: secondaryColor,
                      size: 20.sp,
                    ),
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.symmetric(vertical: 12.h),
                  ),
                  style: TextStyle(color: textColor, fontSize: 14.sp),
                  onSubmitted: (value) {
                    ref
                        .read(questionsControllerProvider.notifier)
                        .applySearch(value);
                  },
                ),
              ),
            ),

            // List
            Expanded(
              child: RefreshIndicator(
                onRefresh: () =>
                    ref.read(questionsControllerProvider.notifier).refresh(),
                color: context.colors.accent,
                child: questionsState.items.isEmpty && questionsState.isLoading
                    ? _buildSkeleton()
                    : questionsState.items.isEmpty &&
                          questionsState.error != null
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              AppIcons.errorOutline,
                              size: 48.sp,
                              color: context.colors.error,
                            ),
                            SizedBox(height: 16.h),
                            Text(
                              '加载失败，请重试\n${questionsState.error}',
                              textAlign: TextAlign.center,
                              style: TextStyle(color: secondaryColor),
                            ),
                            SizedBox(height: 16.h),
                            FilledButton(
                              onPressed: () => ref
                                  .read(questionsControllerProvider.notifier)
                                  .refresh(),
                              child: const Text('重试'),
                            ),
                          ],
                        ),
                      )
                    : questionsState.items.isEmpty
                    ? _buildEmptyState(questionsState.search)
                    : ListView.separated(
                        controller: _scrollController,
                        padding: EdgeInsets.symmetric(
                          horizontal: 20.w,
                          vertical: 12.h,
                        ),
                        physics: const AlwaysScrollableScrollPhysics(),
                        itemCount:
                            questionsState.items.length +
                            (questionsState.hasMore ? 1 : 0),
                        separatorBuilder: (context, index) =>
                            SizedBox(height: 12.h),
                        itemBuilder: (context, index) {
                          if (index == questionsState.items.length) {
                            return Padding(
                              padding: EdgeInsets.symmetric(vertical: 24.h),
                              child: Center(
                                child: CircularProgressIndicator(
                                  color: context.colors.accent,
                                ),
                              ),
                            );
                          }

                          final question = questionsState.items[index];
                          return QuestionListCard(question: question);
                        },
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// 空列表：区分「没有搜到」与「题库本身没有题」。
  ///
  /// 之前这里直接渲染一个空的 `ListView`，整片空白，用户既不知道是没有匹配
  /// 还是加载失败。现在给出文案；有搜索词时再给「清空搜索」一键回到全部。
  Widget _buildEmptyState(String search) {
    final hasSearch = search.isNotEmpty;

    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        // 空态也要能下拉刷新：列表空了正是最需要重新拉一次的时候。
        physics: const AlwaysScrollableScrollPhysics(),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: EmptyState(
            icon: '📚',
            title: hasSearch ? '没有找到相关题目' : '这里还没有题目',
            subtitle: hasSearch ? '换个关键词试试，或清空搜索查看全部' : '题库暂时没有内容，稍后再来看看',
            actionLabel: hasSearch ? '清空搜索' : null,
            onAction: hasSearch ? _clearSearch : null,
          ),
        ),
      ),
    );
  }

  /// 清空搜索词：输入框与查询状态一起复位，再从第 1 页重新拉全部题目。
  void _clearSearch() {
    _searchController.clear();
    ref.read(questionsControllerProvider.notifier).applySearch('');
  }

  /// 列表骨架：3 张假题卡片复刻真实版式，再由 Skeletonizer 抹成骨块。
  Widget _buildSkeleton() {
    return Skeletonizer(
      enabled: true,
      child: ListView.separated(
        padding: EdgeInsets.symmetric(horizontal: 20.w, vertical: 12.h),
        itemCount: 3,
        separatorBuilder: (context, index) => SizedBox(height: 12.h),
        itemBuilder: (context, index) =>
            QuestionListCard(question: fakeQuestion(index: index)),
      ),
    );
  }
}
