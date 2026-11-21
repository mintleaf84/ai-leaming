import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../../../core/navigation/app_nav.dart';
import 'textbook_provider.dart';
import '../domain/textbook.dart';
import '../../../core/theme/app_icons.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/state_views.dart';

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
      backgroundColor: context.colors.background,
      appBar: AppBar(
        elevation: 0,
        leading: IconButton(
          tooltip: '返回',
          icon: Icon(AppIcons.arrowBack, color: context.colors.text),
          onPressed: () => context.backOrHome(),
        ),
        title: Text(
          '📚 教材库',
          style: TextStyle(
            fontSize: 18.sp,
            fontWeight: FontWeight.w600,
            color: context.colors.text,
          ),
        ),
        actions: [
          IconButton(
            tooltip: '刷新教材列表',
            icon: Icon(AppIcons.refresh, color: context.colors.text),
            onPressed: () =>
                ref.read(textbookListControllerProvider.notifier).load(),
          ),
        ],
      ),
      body: state.isLoading
          ? const Center(child: CircularProgressIndicator())
          : state.error != null
          ? AppErrorView(
              message: '请检查网络后重试',
              onRetry: () =>
                  ref.read(textbookListControllerProvider.notifier).load(),
            )
          : state.textbooks.isEmpty
          ? const AppEmptyView(
              emoji: '\u{1F4D6}',
              title: '暂无教材',
              hint: '请联系管理员上传教材',
            )
          : _buildList(state.textbooks),
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
      onTap: () => context.pushDetail(AppRoutes.textbookDetail(textbook.id)),
      borderRadius: BorderRadius.circular(12.r),
      child: Container(
        padding: EdgeInsets.all(16.w),
        decoration: BoxDecoration(
          color: context.colors.surface,
          borderRadius: BorderRadius.circular(12.r),
          border: Border.all(color: context.colors.border),
        ),
        child: Row(
          children: [
            // 封面占位图
            Container(
              width: 56.w,
              height: 72.h,
              decoration: BoxDecoration(
                color: context.colors.text.withValues(alpha: 0.06),
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
                      color: context.colors.text,
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
                        color: context.colors.textSecondary,
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
                          color: context.colors.successContainer,
                          borderRadius: BorderRadius.circular(4.r),
                        ),
                        child: Text(
                          '${textbook.chapterCount} 章',
                          style: TextStyle(
                            fontSize: 12.sp,
                            color: context.colors.success,
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
              AppIcons.chevronRight,
              size: 20.sp,
              color: context.colors.textSecondary,
            ),
          ],
        ),
      ),
    );
  }
}
