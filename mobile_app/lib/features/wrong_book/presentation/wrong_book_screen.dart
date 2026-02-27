import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:go_router/go_router.dart';
import 'wrong_book_provider.dart';
import '../domain/wrong_question.dart';

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
      backgroundColor: const Color(0xFFF7F7F5),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Color(0xFF37352F)),
          onPressed: () => context.go('/dashboard'),
        ),
        title: Text(
          '错题本',
          style: TextStyle(
            fontSize: 18.sp,
            fontWeight: FontWeight.w600,
            color: const Color(0xFF37352F),
          ),
        ),
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Color(0xFF37352F)),
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
          _buildStatCard('总错题', stats.total, const Color(0xFFDC2626)),
          SizedBox(width: 12.w),
          _buildStatCard('近7天', stats.recent, const Color(0xFFFF9500)),
          SizedBox(width: 12.w),
          _buildStatCard('高频错题', stats.frequent, const Color(0xFF135BEC)),
        ],
      ),
    );
  }

  Widget _buildStatCard(String label, int value, Color color) {
    return Expanded(
      child: Container(
        padding: EdgeInsets.symmetric(vertical: 12.h, horizontal: 12.w),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12.r),
          border: Border.all(color: const Color(0xFFE0E0E0)),
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
              style: TextStyle(fontSize: 11.sp, color: Colors.grey),
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
        color: Colors.white,
        borderRadius: BorderRadius.circular(10.r),
        border: Border.all(color: const Color(0xFFE0E0E0)),
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
            color: isSelected ? const Color(0xFF37352F) : Colors.transparent,
            borderRadius: BorderRadius.circular(8.r),
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13.sp,
              fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
              color: isSelected ? Colors.white : const Color(0xFF37352F),
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
          color: Colors.white,
          borderRadius: BorderRadius.circular(12.r),
          border: Border.all(
            color: isSelected
                ? const Color(0xFF135BEC)
                : const Color(0xFFE0E0E0),
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
                color: isSelected
                    ? const Color(0xFF135BEC)
                    : Colors.transparent,
                borderRadius: BorderRadius.circular(6.r),
                border: Border.all(
                  color: isSelected
                      ? const Color(0xFF135BEC)
                      : Colors.grey[300]!,
                  width: 1.5,
                ),
              ),
              child: isSelected
                  ? Icon(Icons.check, size: 14.sp, color: Colors.white)
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
                      color: const Color(0xFF37352F),
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
                          color: const Color(0xFFFEF2F2),
                          borderRadius: BorderRadius.circular(4.r),
                        ),
                        child: Text(
                          '错 ${q.wrongCount} 次',
                          style: TextStyle(
                            fontSize: 10.sp,
                            fontWeight: FontWeight.w600,
                            color: const Color(0xFFDC2626),
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
                            color: const Color(0xFFF3F4F6),
                            borderRadius: BorderRadius.circular(4.r),
                          ),
                          child: Text(
                            q.tags.first,
                            style: TextStyle(
                              fontSize: 10.sp,
                              color: Colors.grey[600],
                            ),
                          ),
                        ),
                      const Spacer(),
                      // 标记已掌握按钮
                      GestureDetector(
                        onTap: () {
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
                        child: Text(
                          '已掌握',
                          style: TextStyle(
                            fontSize: 11.sp,
                            color: const Color(0xFF4EA05E),
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
            color: Colors.white,
            borderRadius: BorderRadius.circular(12.r),
            border: Border.all(color: const Color(0xFFE0E0E0)),
          ),
          child: ExpansionTile(
            tilePadding: EdgeInsets.symmetric(horizontal: 16.w),
            childrenPadding: EdgeInsets.fromLTRB(16.w, 0, 16.w, 12.h),
            title: Row(
              children: [
                Container(
                  padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 4.h),
                  decoration: BoxDecoration(
                    color: const Color(0xFF135BEC).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(6.r),
                  ),
                  child: Text(
                    group.tag,
                    style: TextStyle(
                      fontSize: 13.sp,
                      fontWeight: FontWeight.w600,
                      color: const Color(0xFF135BEC),
                    ),
                  ),
                ),
                const Spacer(),
                Text(
                  '${group.count} 题',
                  style: TextStyle(fontSize: 12.sp, color: Colors.grey),
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
                        color: const Color(0xFFFEF2F2),
                        borderRadius: BorderRadius.circular(4.r),
                      ),
                      child: Text(
                        '×${q.wrongCount}',
                        style: TextStyle(
                          fontSize: 10.sp,
                          fontWeight: FontWeight.bold,
                          color: const Color(0xFFDC2626),
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
                          color: const Color(0xFF37352F),
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
            style: TextStyle(fontSize: 16.sp, color: Colors.grey),
          ),
          SizedBox(height: 8.h),
          Text(
            '在列表中点击"已掌握"将题目归档',
            style: TextStyle(fontSize: 13.sp, color: Colors.grey[400]),
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
        color: Colors.white,
        border: Border(top: BorderSide(color: Colors.grey[200]!)),
      ),
      child: Row(
        children: [
          // 全选
          GestureDetector(
            onTap: () =>
                ref.read(wrongBookControllerProvider.notifier).selectAll(),
            child: Row(
              children: [
                Icon(
                  count == state.questions.length
                      ? Icons.check_box
                      : Icons.check_box_outline_blank,
                  size: 20.sp,
                  color: const Color(0xFF37352F),
                ),
                SizedBox(width: 6.w),
                Text(
                  '全选',
                  style: TextStyle(
                    fontSize: 13.sp,
                    color: const Color(0xFF37352F),
                  ),
                ),
              ],
            ),
          ),
          const Spacer(),
          // 开始练习
          SizedBox(
            height: 40.h,
            child: ElevatedButton(
              onPressed: count == 0 || state.isCreatingPractice
                  ? null
                  : () async {
                      final sessionId = await ref
                          .read(wrongBookControllerProvider.notifier)
                          .startPractice();
                      if (sessionId != null && mounted) {
                        context.go('/practice?sessionId=$sessionId');
                      } else if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('创建练习失败，请重试')),
                        );
                      }
                    },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF135BEC),
                foregroundColor: Colors.white,
                disabledBackgroundColor: Colors.grey[300],
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8.r),
                ),
              ),
              child: state.isCreatingPractice
                  ? SizedBox(
                      width: 18.sp,
                      height: 18.sp,
                      child: const CircularProgressIndicator(
                        color: Colors.white,
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
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text('🎉', style: TextStyle(fontSize: 64.sp)),
          SizedBox(height: 16.h),
          Text(
            '太棒了，没有错题！',
            style: TextStyle(
              fontSize: 18.sp,
              fontWeight: FontWeight.bold,
              color: const Color(0xFF37352F),
            ),
          ),
          SizedBox(height: 8.h),
          Text(
            '继续保持，加油哦',
            style: TextStyle(fontSize: 14.sp, color: Colors.grey),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorView() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.error_outline, size: 48.sp, color: Colors.red[300]),
          SizedBox(height: 16.h),
          Text(
            '加载失败',
            style: TextStyle(
              fontSize: 18.sp,
              fontWeight: FontWeight.w600,
              color: const Color(0xFF37352F),
            ),
          ),
          SizedBox(height: 8.h),
          Text(
            '请检查网络后重试',
            style: TextStyle(fontSize: 14.sp, color: Colors.grey),
          ),
          SizedBox(height: 24.h),
          ElevatedButton.icon(
            onPressed: () =>
                ref.read(wrongBookControllerProvider.notifier).loadData(),
            icon: const Icon(Icons.refresh, size: 18),
            label: const Text('重试'),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF135BEC),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8.r),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSkeleton() {
    return Padding(
      padding: EdgeInsets.all(16.w),
      child: Column(
        children: [
          // 统计卡片骨架
          Row(
            children: List.generate(
              3,
              (i) => Expanded(
                child: Container(
                  height: 70.h,
                  margin: EdgeInsets.only(right: i < 2 ? 12.w : 0),
                  decoration: BoxDecoration(
                    color: Colors.grey[200],
                    borderRadius: BorderRadius.circular(12.r),
                  ),
                ),
              ),
            ),
          ),
          SizedBox(height: 16.h),
          // 列表骨架
          ...List.generate(
            5,
            (_) => Container(
              height: 80.h,
              margin: EdgeInsets.only(bottom: 10.h),
              decoration: BoxDecoration(
                color: Colors.grey[200],
                borderRadius: BorderRadius.circular(12.r),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
