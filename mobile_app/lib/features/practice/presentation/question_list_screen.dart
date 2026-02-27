import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:go_router/go_router.dart';
import 'questions_provider.dart';

class QuestionListScreen extends ConsumerStatefulWidget {
  const QuestionListScreen({super.key});

  @override
  ConsumerState<QuestionListScreen> createState() => _QuestionListScreenState();
}

class _QuestionListScreenState extends ConsumerState<QuestionListScreen> {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
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
    final isDarkMode = theme.brightness == Brightness.dark;

    final bgColor = theme.scaffoldBackgroundColor;
    final cardColor = theme.cardColor;
    final textColor = theme.colorScheme.onSurface;
    final secondaryColor = isDarkMode
        ? const Color(0xFF8A8A8A)
        : const Color(0xFF787774);
    final borderColor = theme.dividerColor;

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
                    onPressed: () => context.go('/dashboard'),
                    icon: Icon(Icons.arrow_back, color: textColor),
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
                  color: isDarkMode
                      ? const Color(0xFF2F2F2F)
                      : const Color(0xFFF1F1EF),
                  borderRadius: BorderRadius.circular(8.r),
                ),
                child: TextField(
                  decoration: InputDecoration(
                    hintText: '搜索题目内容或标签...',
                    hintStyle: TextStyle(
                      color: secondaryColor,
                      fontSize: 14.sp,
                    ),
                    prefixIcon: Icon(
                      Icons.search,
                      color: secondaryColor,
                      size: 20.sp,
                    ),
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.symmetric(vertical: 12.h),
                  ),
                  style: TextStyle(color: textColor, fontSize: 14.sp),
                  onSubmitted: (value) {
                    // TODO: Implement search with Provider
                    ScaffoldMessenger.of(
                      context,
                    ).showSnackBar(const SnackBar(content: Text('搜索功能开发中...')));
                  },
                ),
              ),
            ),

            // List
            Expanded(
              child: RefreshIndicator(
                onRefresh: () =>
                    ref.read(questionsControllerProvider.notifier).refresh(),
                color: const Color(0xFF135BEC),
                child: questionsState.items.isEmpty && questionsState.isLoading
                    ? const Center(
                        child: CircularProgressIndicator(
                          color: Color(0xFF135BEC),
                        ),
                      )
                    : questionsState.items.isEmpty &&
                          questionsState.error != null
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.error_outline,
                              size: 48.sp,
                              color: const Color(0xFFEB5757),
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
                              child: const Center(
                                child: CircularProgressIndicator(
                                  color: Color(0xFF135BEC),
                                ),
                              ),
                            );
                          }

                          final question = questionsState.items[index];
                          return Container(
                            decoration: BoxDecoration(
                              color: cardColor,
                              borderRadius: BorderRadius.circular(8.r),
                              border: Border.all(color: borderColor),
                            ),
                            child: Material(
                              color: Colors.transparent,
                              child: InkWell(
                                onTap: () {
                                  // TODO: Go to question detail or start practice session
                                },
                                borderRadius: BorderRadius.circular(8.r),
                                child: Padding(
                                  padding: EdgeInsets.all(16.w),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Container(
                                            padding: EdgeInsets.symmetric(
                                              horizontal: 6.w,
                                              vertical: 2.h,
                                            ),
                                            decoration: BoxDecoration(
                                              color: question.type == 'single'
                                                  ? const Color(0xFFE3F2FD)
                                                  : const Color(0xFFF3E5F5),
                                              borderRadius:
                                                  BorderRadius.circular(4.r),
                                            ),
                                            child: Text(
                                              question.type == 'single'
                                                  ? '单选'
                                                  : '多选',
                                              style: TextStyle(
                                                fontSize: 10.sp,
                                                color: question.type == 'single'
                                                    ? const Color(0xFF1976D2)
                                                    : const Color(0xFF7B1FA2),
                                                fontWeight: FontWeight.bold,
                                              ),
                                            ),
                                          ),
                                          SizedBox(width: 8.w),
                                          Expanded(
                                            child: Text(
                                              question.dimension ?? '综合能力',
                                              style: TextStyle(
                                                fontSize: 12.sp,
                                                color: secondaryColor,
                                              ),
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ),
                                          Text(
                                            'ID: ${question.id}',
                                            style: TextStyle(
                                              fontSize: 10.sp,
                                              color: secondaryColor.withValues(
                                                alpha: 0.5,
                                              ),
                                              fontFamily: 'monospace',
                                            ),
                                          ),
                                        ],
                                      ),
                                      SizedBox(height: 12.h),
                                      Text(
                                        question.content,
                                        style: TextStyle(
                                          fontSize: 15.sp,
                                          color: textColor,
                                          height: 1.4,
                                        ),
                                        maxLines: 3,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      if (question.tags.isNotEmpty) ...[
                                        SizedBox(height: 12.h),
                                        Wrap(
                                          spacing: 8.w,
                                          runSpacing: 4.h,
                                          children: question.tags
                                              .map(
                                                (tag) => Text(
                                                  '#$tag',
                                                  style: TextStyle(
                                                    fontSize: 12.sp,
                                                    color: const Color(
                                                      0xFF135BEC,
                                                    ),
                                                  ),
                                                ),
                                              )
                                              .toList(),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          );
                        },
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
