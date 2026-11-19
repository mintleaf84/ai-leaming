import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../../../core/navigation/app_nav.dart';
import 'mastery_provider.dart';
import '../../../core/theme/app_icons.dart';
import '../../../core/theme/app_colors.dart';

class MasteryScreen extends ConsumerStatefulWidget {
  const MasteryScreen({super.key});

  @override
  ConsumerState<MasteryScreen> createState() => _MasteryScreenState();
}

class _MasteryScreenState extends ConsumerState<MasteryScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(
      () => ref.read(masteryControllerProvider.notifier).loadTree(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(masteryControllerProvider);

    return Scaffold(
      backgroundColor: context.colors.background,
      appBar: AppBar(
        title: const Text('学习掌握度'),
        elevation: 0,
        leading: IconButton(
          tooltip: '返回',
          icon: Icon(AppIcons.arrowBack, color: context.colors.text),
          onPressed: () => context.backOrHome(),
        ),
        titleTextStyle: TextStyle(
          color: context.colors.text,
          fontSize: 18.sp,
          fontWeight: FontWeight.bold,
        ),
        iconTheme: IconThemeData(color: context.colors.text),
        actions: [
          IconButton(
            tooltip: '刷新掌握度',
            icon: const Icon(AppIcons.refresh),
            onPressed: () =>
                ref.read(masteryControllerProvider.notifier).loadTree(),
          ),
        ],
      ),
      body: state.isLoading
          ? Center(
              child: CircularProgressIndicator(color: context.colors.accent),
            )
          : state.error != null
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
                    '加载失败',
                    style: TextStyle(
                      fontSize: 18.sp,
                      fontWeight: FontWeight.w600,
                      color: context.colors.text,
                    ),
                  ),
                  SizedBox(height: 8.h),
                  Text(
                    '请检查网络后重试',
                    style: TextStyle(
                      fontSize: 14.sp,
                      color: context.colors.textSecondary,
                    ),
                  ),
                  SizedBox(height: 24.h),
                  ElevatedButton.icon(
                    onPressed: () =>
                        ref.read(masteryControllerProvider.notifier).loadTree(),
                    icon: const Icon(AppIcons.refresh, size: 18),
                    label: const Text('重试'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: context.colors.accent,
                      foregroundColor: context.colors.onAccent,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8.r),
                      ),
                    ),
                  ),
                ],
              ),
            )
          : state.tree.isEmpty
          ? const Center(child: Text('暂无数据'))
          : ListView.builder(
              padding: EdgeInsets.all(16.w),
              itemCount: state.tree.length,
              itemBuilder: (context, index) {
                return _buildNode(state.tree[index]);
              },
            ),
    );
  }

  Widget _buildNode(MasteryNode node) {
    // 递归构建树形展示
    // 简单的 ExpansionTile用于展示层级
    final hasChildren = node.children.isNotEmpty;
    final score = node.score.toDouble();
    final color = _getScoreColor(score);

    return Card(
      elevation: 0,
      margin: EdgeInsets.only(bottom: 8.h),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8.r),
        side: BorderSide(color: context.colors.border),
      ),
      child: ExpansionTile(
        initiallyExpanded: node.level < 1, // Expand top level by default
        leading: CircularProgressIndicator(
          value: score / 100,
          backgroundColor: context.colors.surfaceAlt,
          color: color,
          strokeWidth: 4,
        ),
        title: Row(
          children: [
            Expanded(
              child: Text(
                node.name,
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16.sp),
              ),
            ),
            Text(
              '${score.toStringAsFixed(1)}%',
              style: TextStyle(color: color, fontWeight: FontWeight.bold),
            ),
          ],
        ),
        subtitle: Text(
          '层级: ${node.level}',
          style: TextStyle(
            fontSize: 12.sp,
            color: context.colors.textSecondary,
          ),
        ),
        children: hasChildren
            ? node.children
                  .map(
                    (child) => Padding(
                      padding: EdgeInsets.only(left: 16.w),
                      child: _buildNode(child),
                    ),
                  )
                  .toList()
            : [],
      ),
    );
  }

  Color _getScoreColor(double score) {
    if (score >= 80) return context.colors.success;
    if (score >= 60) return context.colors.warning;
    return context.colors.error;
  }
}
