import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:go_router/go_router.dart';
import 'textbook_provider.dart';
import '../domain/textbook.dart';

/// 教材库列表页
class TextbookListScreen extends ConsumerStatefulWidget {
  const TextbookListScreen({super.key});

  @override
  ConsumerState<TextbookListScreen> createState() => _TextbookListScreenState();
}

class _TextbookListScreenState extends ConsumerState<TextbookListScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(
      () => ref.read(textbookListControllerProvider.notifier).load(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(textbookListControllerProvider);

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
          '📚 教材库',
          style: TextStyle(
            fontSize: 18.sp,
            fontWeight: FontWeight.w600,
            color: const Color(0xFF37352F),
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Color(0xFF37352F)),
            onPressed: () =>
                ref.read(textbookListControllerProvider.notifier).load(),
          ),
        ],
      ),
      body: state.isLoading
          ? const Center(child: CircularProgressIndicator())
          : state.error != null
          ? _buildErrorView(state.error!)
          : state.textbooks.isEmpty
          ? _buildEmptyView()
          : _buildList(state.textbooks),
    );
  }

  Widget _buildErrorView(String error) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.error_outline, size: 48.sp, color: Colors.red[300]),
          SizedBox(height: 16.h),
          Text(
            '加载失败',
            style: TextStyle(fontSize: 16.sp, fontWeight: FontWeight.bold),
          ),
          SizedBox(height: 24.h),
          ElevatedButton.icon(
            onPressed: () =>
                ref.read(textbookListControllerProvider.notifier).load(),
            icon: const Icon(Icons.refresh),
            label: const Text('重试'),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyView() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text('📖', style: TextStyle(fontSize: 64.sp)),
          SizedBox(height: 16.h),
          Text(
            '暂无教材',
            style: TextStyle(fontSize: 18.sp, fontWeight: FontWeight.bold),
          ),
          SizedBox(height: 8.h),
          Text(
            '请联系管理员上传教材',
            style: TextStyle(fontSize: 14.sp, color: Colors.grey),
          ),
        ],
      ),
    );
  }

  Widget _buildList(List<Textbook> textbooks) {
    return ListView.separated(
      padding: EdgeInsets.all(16.w),
      itemCount: textbooks.length,
      separatorBuilder: (_, __) => SizedBox(height: 12.h),
      itemBuilder: (context, index) {
        return _buildTextbookCard(context, textbooks[index]);
      },
    );
  }

  Widget _buildTextbookCard(BuildContext context, Textbook textbook) {
    return InkWell(
      onTap: () => context.go('/textbooks/${textbook.id}'),
      borderRadius: BorderRadius.circular(12.r),
      child: Container(
        padding: EdgeInsets.all(16.w),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12.r),
          border: Border.all(color: const Color(0xFFE8E8E5)),
        ),
        child: Row(
          children: [
            // 封面占位图
            Container(
              width: 56.w,
              height: 72.h,
              decoration: BoxDecoration(
                color: const Color(0xFF37352F).withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(6.r),
              ),
              alignment: Alignment.center,
              child: Text('📖', style: TextStyle(fontSize: 28.sp)),
            ),
            SizedBox(width: 14.w),
            // 教材信息
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    textbook.title,
                    style: TextStyle(
                      fontSize: 16.sp,
                      fontWeight: FontWeight.w600,
                      color: const Color(0xFF37352F),
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (textbook.author != null &&
                      textbook.author!.isNotEmpty) ...[
                    SizedBox(height: 4.h),
                    Text(
                      textbook.author!,
                      style: TextStyle(
                        fontSize: 12.sp,
                        color: const Color(0xFF9B9A97),
                      ),
                    ),
                  ],
                  SizedBox(height: 8.h),
                  Row(
                    children: [
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
                          '${textbook.chapterCount} 章',
                          style: TextStyle(
                            fontSize: 11.sp,
                            color: const Color(0xFF10b981),
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Icon(
              Icons.chevron_right,
              size: 20.sp,
              color: const Color(0xFF9B9A97),
            ),
          ],
        ),
      ),
    );
  }
}
