import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:go_router/go_router.dart';
import 'textbook_provider.dart';
import '../domain/textbook.dart';

/// 教材详情页（章节列表）
class TextbookDetailScreen extends ConsumerWidget {
  final int textbookId;

  const TextbookDetailScreen({super.key, required this.textbookId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncState = ref.watch(textbookDetailProvider(textbookId));

    return asyncState.when(
      loading: () => Scaffold(
        appBar: AppBar(
          backgroundColor: Colors.white,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back, color: Color(0xFF37352F)),
            onPressed: () => context.go('/textbooks'),
          ),
        ),
        body: const Center(child: CircularProgressIndicator()),
      ),
      error: (err, _) => Scaffold(
        appBar: AppBar(
          backgroundColor: Colors.white,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back, color: Color(0xFF37352F)),
            onPressed: () => context.go('/textbooks'),
          ),
        ),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.error_outline,
                  size: 48.sp, color: Colors.red[300]),
              SizedBox(height: 16.h),
              Text('加载失败',
                  style: TextStyle(
                      fontSize: 16.sp, fontWeight: FontWeight.bold)),
            ],
          ),
        ),
      ),
      data: (state) {
        if (state.error != null) {
          return Scaffold(
            appBar: AppBar(
              backgroundColor: Colors.white,
              elevation: 0,
              leading: IconButton(
                icon: const Icon(Icons.arrow_back, color: Color(0xFF37352F)),
                onPressed: () => context.go('/textbooks'),
              ),
            ),
            body: Center(
              child: Text(
                state.error!,
                style: TextStyle(fontSize: 14.sp, color: Colors.red),
              ),
            ),
          );
        }

        final detail = state.detail!;
        return _buildContent(context, detail);
      },
    );
  }

  Widget _buildContent(BuildContext context, TextbookDetail detail) {
    final tb = detail.textbook;
    // 将章节按父子关系排序展示（根章节在前，子章节缩进）
    final rootChapters =
        detail.chapters.where((c) => c.parentId == null).toList();

    return Scaffold(
      backgroundColor: const Color(0xFFF7F7F5),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Color(0xFF37352F)),
          onPressed: () => context.go('/textbooks'),
        ),
        title: Text(
          tb.title,
          style: TextStyle(
            fontSize: 16.sp,
            fontWeight: FontWeight.w600,
            color: const Color(0xFF37352F),
          ),
        ),
      ),
      body: CustomScrollView(
        slivers: [
          // 教材头部信息卡片
          SliverToBoxAdapter(
            child: Container(
              margin: EdgeInsets.all(16.w),
              padding: EdgeInsets.all(20.w),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16.r),
                border: Border.all(color: const Color(0xFFE8E8E5)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text('📖', style: TextStyle(fontSize: 36.sp)),
                      SizedBox(width: 12.w),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              tb.title,
                              style: TextStyle(
                                fontSize: 18.sp,
                                fontWeight: FontWeight.bold,
                                color: const Color(0xFF37352F),
                              ),
                            ),
                            if (tb.author != null &&
                                tb.author!.isNotEmpty) ...[
                              SizedBox(height: 4.h),
                              Text(
                                '作者：${tb.author}',
                                style: TextStyle(
                                  fontSize: 12.sp,
                                  color: const Color(0xFF9B9A97),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                  if (tb.description != null &&
                      tb.description!.isNotEmpty) ...[
                    SizedBox(height: 12.h),
                    Text(
                      tb.description!,
                      style: TextStyle(
                        fontSize: 13.sp,
                        color: const Color(0xFF787774),
                        height: 1.5,
                      ),
                    ),
                  ],
                  SizedBox(height: 12.h),
                  Container(
                    padding: EdgeInsets.symmetric(
                      horizontal: 8.w,
                      vertical: 3.h,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF0FDF4),
                      borderRadius: BorderRadius.circular(4.r),
                    ),
                    child: Text(
                      '共 ${tb.chapterCount} 章',
                      style: TextStyle(
                        fontSize: 12.sp,
                        color: const Color(0xFF10b981),
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          // 章节标题
          SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.fromLTRB(20.w, 4.h, 20.w, 8.h),
              child: Text(
                '章节目录',
                style: TextStyle(
                  fontSize: 12.sp,
                  fontWeight: FontWeight.w600,
                  color: const Color(0xFF9B9A97),
                  letterSpacing: 0.5,
                ),
              ),
            ),
          ),
          // 章节列表
          if (detail.chapters.isEmpty)
            SliverToBoxAdapter(
              child: Center(
                child: Padding(
                  padding: EdgeInsets.all(40.w),
                  child: Text(
                    '暂无章节内容',
                    style: TextStyle(
                      fontSize: 14.sp,
                      color: const Color(0xFF9B9A97),
                    ),
                  ),
                ),
              ),
            )
          else
            SliverPadding(
              padding: EdgeInsets.symmetric(horizontal: 16.w),
              sliver: SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, index) {
                    final chapter = rootChapters[index];
                    final subChapters = detail.chapters
                        .where((c) => c.parentId == chapter.id)
                        .toList();
                    return _buildChapterItem(
                      context,
                      chapter,
                      subChapters,
                      isLast: index == rootChapters.length - 1,
                    );
                  },
                  childCount: rootChapters.length,
                ),
              ),
            ),
          SliverToBoxAdapter(child: SizedBox(height: 40.h)),
        ],
      ),
    );
  }

  Widget _buildChapterItem(
    BuildContext context,
    TextbookChapter chapter,
    List<TextbookChapter> subChapters, {
    bool isLast = false,
  }) {
    return Container(
      margin: EdgeInsets.only(bottom: 8.h),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10.r),
        border: Border.all(color: const Color(0xFFE8E8E5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 根章节
          Padding(
            padding: EdgeInsets.all(14.w),
            child: Row(
              children: [
                Container(
                  width: 6.w,
                  height: 6.w,
                  decoration: const BoxDecoration(
                    color: Color(0xFF37352F),
                    shape: BoxShape.circle,
                  ),
                ),
                SizedBox(width: 10.w),
                Expanded(
                  child: Text(
                    chapter.title,
                    style: TextStyle(
                      fontSize: 14.sp,
                      fontWeight: FontWeight.w600,
                      color: const Color(0xFF37352F),
                    ),
                  ),
                ),
              ],
            ),
          ),
          // 子章节
          if (subChapters.isNotEmpty)
            ...subChapters.map(
              (sub) => Padding(
                padding: EdgeInsets.fromLTRB(30.w, 0, 14.w, 10.h),
                child: Row(
                  children: [
                    Icon(
                      Icons.subdirectory_arrow_right,
                      size: 14.sp,
                      color: const Color(0xFF9B9A97),
                    ),
                    SizedBox(width: 6.w),
                    Expanded(
                      child: Text(
                        sub.title,
                        style: TextStyle(
                          fontSize: 13.sp,
                          color: const Color(0xFF787774),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
