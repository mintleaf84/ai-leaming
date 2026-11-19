import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../../../core/navigation/app_nav.dart';
import 'package:skeletonizer/skeletonizer.dart';

import 'knowledge_provider.dart';
import '../../../shared/skeletons/skeleton_fakes.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../core/theme/app_icons.dart';

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
          icon: const Icon(AppIcons.arrowBack, color: Color(0xFF37352F)),
          onPressed: () => context.backOrHome(),
        ),
        titleTextStyle: TextStyle(
          color: const Color(0xFF37352F),
          fontSize: 18.sp,
          fontWeight: FontWeight.bold,
        ),
        iconTheme: const IconThemeData(color: Color(0xFF37352F)),
        actions: [
          IconButton(
            icon: const Icon(AppIcons.refresh),
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
                ? _buildSkeleton()
                : state.error != null
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          AppIcons.errorOutline,
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
                          icon: const Icon(AppIcons.refresh, size: 18),
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
        onPressed: _openCreateCardDialog,
        backgroundColor: const Color(0xFF37352F),
        child: const Icon(AppIcons.add),
      ),
    );
  }

  /// 打开新建卡片对话框。提交成功后 controller 内部已刷新全部卡片列表，
  /// 这里清空分类筛选，保证刚创建的卡片一定出现在列表里（否则筛选其它
  /// 分类时用户会看不到自己刚建的卡片）。
  Future<void> _openCreateCardDialog() async {
    final controller = ref.read(knowledgeControllerProvider.notifier);
    final created = await showDialog<bool>(
      context: context,
      builder: (_) => _CreateCardDialog(
        onSubmit: (payload) => controller.createCard(payload),
      ),
    );

    if (!mounted) return;
    if (created != true) return;

    setState(() {
      selectedCategory = null;
    });

    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('知识卡片创建成功')));
  }

  /// 加载态骨架：用 Skeletonizer 包裹真实卡片渲染器，骨架布局与真实列表
  /// 永远不会脱节（改 `_buildCardItem` 不需要同步改骨架）。
  Widget _buildSkeleton() {
    return Skeletonizer(
      enabled: true,
      child: ListView.builder(
        padding: EdgeInsets.all(16.w),
        itemCount: 3,
        // 真实列表用 ListView.separated + 12.h 间隔；卡片自身无 margin，
        // 这里用等量底部留白复刻同一间距。
        itemBuilder: (context, index) => Padding(
          padding: EdgeInsets.only(bottom: 12.h),
          child: _buildCardItem(fakeKnowledgeCard(index: index)),
        ),
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

/// 新建知识卡片对话框。
///
/// 请求体字段与后端 `my-next-app/src/lib/api/routes/knowledge.ts` 的
/// `POST /knowledge/cards`（`CreateCardSchema`）对齐：title / category /
/// tags / front / back / key_points。
class _CreateCardDialog extends StatefulWidget {
  const _CreateCardDialog({required this.onSubmit});

  final Future<void> Function(Map<String, dynamic> payload) onSubmit;

  @override
  State<_CreateCardDialog> createState() => _CreateCardDialogState();
}

class _CreateCardDialogState extends State<_CreateCardDialog> {
  final TextEditingController _frontController = TextEditingController();
  final TextEditingController _backController = TextEditingController();
  final TextEditingController _categoryController = TextEditingController();

  bool _isSubmitting = false;
  String? _errorText;

  @override
  void dispose() {
    _frontController.dispose();
    _backController.dispose();
    _categoryController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final front = _frontController.text.trim();
    final back = _backController.text.trim();

    if (front.isEmpty || back.isEmpty) {
      setState(() {
        _errorText = '正面和背面不能为空';
      });
      return;
    }

    final category = _categoryController.text.trim();
    // 后端 title 可选（缺省为「未命名卡片」），这里用正面文本兜底，
    // 保证列表与 RAG 索引里显示的是有意义的标题。
    final title = front.length > 50 ? front.substring(0, 50) : front;

    setState(() {
      _isSubmitting = true;
      _errorText = null;
    });

    try {
      await widget.onSubmit(<String, dynamic>{
        'title': title,
        'front': front,
        'back': back,
        'category': category.isEmpty ? '未分类' : category,
        'tags': const <String>[],
      });

      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isSubmitting = false;
        _errorText = '创建失败，请检查网络后重试';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('新建知识卡片'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: _frontController,
              enabled: !_isSubmitting,
              minLines: 1,
              maxLines: 2,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: '正面（问题）',
                hintText: '例如：什么是最近发展区？',
              ),
            ),
            SizedBox(height: 12.h),
            TextField(
              controller: _backController,
              enabled: !_isSubmitting,
              minLines: 3,
              maxLines: 6,
              decoration: const InputDecoration(
                labelText: '背面（答案）',
                hintText: '写下定义与关键要点',
              ),
            ),
            SizedBox(height: 12.h),
            TextField(
              controller: _categoryController,
              enabled: !_isSubmitting,
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _submit(),
              decoration: const InputDecoration(
                labelText: '分类（可选）',
                hintText: '例如：教育心理学',
              ),
            ),
            if (_errorText != null) ...[
              SizedBox(height: 12.h),
              Text(
                _errorText!,
                style: TextStyle(fontSize: 12.sp, color: Colors.red[600]),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isSubmitting
              ? null
              : () => Navigator.of(context).pop(false),
          child: const Text('取消'),
        ),
        ElevatedButton(
          onPressed: _isSubmitting ? null : _submit,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF37352F),
            foregroundColor: Colors.white,
          ),
          child: _isSubmitting
              ? SizedBox(
                  width: 16.w,
                  height: 16.w,
                  child: const CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Text('保存'),
        ),
      ],
    );
  }
}
