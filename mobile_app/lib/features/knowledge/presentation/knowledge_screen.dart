import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:go_router/go_router.dart';

import 'knowledge_provider.dart';
import '../../../shared/widgets/skeleton_loading.dart';
import '../../../shared/widgets/empty_state.dart';

class KnowledgeScreen extends ConsumerStatefulWidget {
  const KnowledgeScreen({super.key});

  @override
  ConsumerState<KnowledgeScreen> createState() => _KnowledgeScreenState();
}

class _KnowledgeScreenState extends ConsumerState<KnowledgeScreen> {
  String? selectedCategory;

  @override
  void initState() {
    super.initState();
    // 初始加载
    Future.microtask(
      () => ref.read(knowledgeControllerProvider.notifier).loadCards(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(knowledgeControllerProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFF7F7F5),
      appBar: AppBar(
        title: const Text('知识卡片'),
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Color(0xFF37352F)),
          onPressed: () => context.go('/dashboard'),
        ),
        titleTextStyle: TextStyle(
          color: const Color(0xFF37352F),
          fontSize: 18.sp,
          fontWeight: FontWeight.bold,
        ),
        iconTheme: const IconThemeData(color: Color(0xFF37352F)),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref
                .read(knowledgeControllerProvider.notifier)
                .loadCards(category: selectedCategory),
          ),
        ],
      ),
      body: Column(
        children: [
          // Category Filter
          if (state.categories.isNotEmpty)
            SizedBox(
              height: 50.h,
              child: ListView.separated(
                padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 8.h),
                scrollDirection: Axis.horizontal,
                itemCount: state.categories.length + 1,
                separatorBuilder: (_, i) => SizedBox(width: 8.w),
                itemBuilder: (context, index) {
                  final isAll = index == 0;
                  final category = isAll ? '全部' : state.categories[index - 1];
                  final isSelected = isAll
                      ? selectedCategory == null
                      : selectedCategory == category;

                  return ChoiceChip(
                    label: Text(category),
                    selected: isSelected,
                    onSelected: (selected) {
                      if (selected) {
                        setState(() {
                          selectedCategory = isAll ? null : category;
                        });
                        ref
                            .read(knowledgeControllerProvider.notifier)
                            .loadCards(category: selectedCategory);
                      }
                    },
                    selectedColor: const Color(0xFF37352F),
                    labelStyle: TextStyle(
                      color: isSelected
                          ? Colors.white
                          : const Color(0xFF37352F),
                    ),
                  );
                },
              ),
            ),

          // Content
          Expanded(
            child: state.isLoading
                ? const KnowledgeSkeletonList()
                : state.error != null
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.error_outline,
                          size: 48.sp,
                          color: Colors.red[300],
                        ),
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
                          onPressed: () => ref
                              .read(knowledgeControllerProvider.notifier)
                              .loadCards(category: selectedCategory),
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
                  )
                : state.cards.isEmpty
                ? const EmptyState(
                    icon: '🧠',
                    title: '暂无知识卡片',
                    subtitle: '知识卡片可以帮助你巩固概念',
                  )
                : ListView.separated(
                    padding: EdgeInsets.all(16.w),
                    itemCount: state.cards.length,
                    separatorBuilder: (_, i) => SizedBox(height: 12.h),
                    itemBuilder: (context, index) {
                      final card = state.cards[index];
                      return _buildCardItem(card);
                    },
                  ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          // TODO: Navigate to create card page or show dialog
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(const SnackBar(content: Text('创建卡片功能开发中...')));
        },
        backgroundColor: const Color(0xFF37352F),
        child: const Icon(Icons.add),
      ),
    );
  }

  Widget _buildCardItem(KnowledgeCard card) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12.r),
        border: Border.all(color: const Color(0xFFE0E0E0)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.02),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: ExpansionTile(
        title: Text(
          card.front,
          style: TextStyle(
            fontSize: 16.sp,
            fontWeight: FontWeight.w600,
            color: const Color(0xFF37352F),
          ),
        ),
        subtitle: Padding(
          padding: EdgeInsets.only(top: 4.h),
          child: Row(
            children: [
              Container(
                padding: EdgeInsets.symmetric(horizontal: 6.w, vertical: 2.h),
                decoration: BoxDecoration(
                  color: Colors.grey[100],
                  borderRadius: BorderRadius.circular(4.r),
                ),
                child: Text(
                  card.category,
                  style: TextStyle(fontSize: 10.sp, color: Colors.grey[700]),
                ),
              ),
              SizedBox(width: 8.w),
              if (card.tags.isNotEmpty)
                Text(
                  '#${card.tags.first}',
                  style: TextStyle(fontSize: 10.sp, color: Colors.blueGrey),
                ),
            ],
          ),
        ),
        childrenPadding: EdgeInsets.all(16.w),
        children: [
          Container(
            width: double.infinity,
            padding: EdgeInsets.all(12.w),
            decoration: BoxDecoration(
              color: const Color(0xFFFAFAFA),
              borderRadius: BorderRadius.circular(8.r),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(card.back, style: TextStyle(fontSize: 15.sp, height: 1.5)),
                if (card.keyPoints.isNotEmpty) ...[
                  SizedBox(height: 12.h),
                  Divider(height: 1, color: Colors.grey[300]),
                  SizedBox(height: 8.h),
                  ...card.keyPoints.map(
                    (kp) => Padding(
                      padding: EdgeInsets.only(bottom: 4.h),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            '• ',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Colors.blue,
                            ),
                          ),
                          Expanded(
                            child: RichText(
                              text: TextSpan(
                                style: TextStyle(
                                  fontSize: 13.sp,
                                  color: Colors.black87,
                                ),
                                children: [
                                  TextSpan(
                                    text: '${kp.term}: ',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  TextSpan(text: kp.definition),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
