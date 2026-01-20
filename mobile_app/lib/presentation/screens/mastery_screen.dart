import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../providers/mastery_provider.dart';

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
      backgroundColor: const Color(0xFFF7F7F5),
      appBar: AppBar(
        title: const Text('学习掌握度'),
        backgroundColor: Colors.white,
        elevation: 0,
        titleTextStyle: TextStyle(
          color: const Color(0xFF37352F),
          fontSize: 18.sp,
          fontWeight: FontWeight.bold,
        ),
        iconTheme: const IconThemeData(color: Color(0xFF37352F)),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () =>
                ref.read(masteryControllerProvider.notifier).loadTree(),
          ),
        ],
      ),
      body: state.isLoading
          ? const Center(child: CircularProgressIndicator())
          : state.error != null
          ? Center(child: Text('Error: ${state.error}'))
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
        side: BorderSide(color: Colors.grey[200]!),
      ),
      child: ExpansionTile(
        initiallyExpanded: node.level < 1, // Expand top level by default
        leading: CircularProgressIndicator(
          value: score / 100,
          backgroundColor: Colors.grey[100],
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
          'Depth: ${node.level}',
          style: TextStyle(fontSize: 10.sp, color: Colors.grey),
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
    if (score >= 80) return Colors.green;
    if (score >= 60) return Colors.orange;
    return Colors.red;
  }
}
