import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:go_router/go_router.dart';
import 'practice_provider.dart';

/// 练习配置页面（与 Web /practice/setup 功能对齐）
class PracticeSetupScreen extends ConsumerStatefulWidget {
  const PracticeSetupScreen({super.key});

  @override
  ConsumerState<PracticeSetupScreen> createState() =>
      _PracticeSetupScreenState();
}

class _PracticeSetupScreenState extends ConsumerState<PracticeSetupScreen> {
  // 练习模式定义
  static const _modes = [
    _PracticeMode(id: 'smart', label: '智能刷题', emoji: '🧠', desc: '40% 顽固 + 40% 盲区 + 20% 随机，AI 深度复盘'),
    _PracticeMode(id: 'review', label: '错题强化', emoji: '🔄', desc: '专练历史错题，按错误次数排序'),
    _PracticeMode(id: 'focus', label: '专项突破', emoji: '🎯', desc: '聚焦指定知识点，精准突破'),
    _PracticeMode(id: 'random', label: '随机挑战', emoji: '🎲', desc: '完全随机抽题，快速查漏补缺'),
  ];

  // 题目数量选项
  static const _limitOptions = [10, 15, 20, 25, 30, 50];

  String _selectedMode = 'smart';
  int _selectedLimit = 20;

  @override
  Widget build(BuildContext context) {
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
          '配置练习',
          style: TextStyle(
            fontSize: 18.sp,
            fontWeight: FontWeight.w600,
            color: const Color(0xFF37352F),
          ),
        ),
        centerTitle: true,
      ),
      body: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              padding: EdgeInsets.all(20.w),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // 模式选择
                  _buildSectionTitle('选择练习模式', Icons.tune),
                  SizedBox(height: 12.h),
                  _buildModeGrid(),
                  SizedBox(height: 28.h),
                  // 题目数量
                  _buildSectionTitle('题目数量', Icons.format_list_numbered),
                  SizedBox(height: 12.h),
                  _buildLimitSelector(),
                  SizedBox(height: 40.h),
                ],
              ),
            ),
          ),
          // 开始练习按钮
          _buildStartButton(),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title, IconData icon) {
    return Row(
      children: [
        Icon(icon, size: 18.sp, color: const Color(0xFF37352F)),
        SizedBox(width: 8.w),
        Text(
          title,
          style: TextStyle(
            fontSize: 16.sp,
            fontWeight: FontWeight.w600,
            color: const Color(0xFF37352F),
          ),
        ),
      ],
    );
  }

  Widget _buildModeGrid() {
    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 2,
      crossAxisSpacing: 12.w,
      mainAxisSpacing: 12.h,
      childAspectRatio: 1.5,
      children: _modes.map((mode) {
        final isSelected = _selectedMode == mode.id;
        return GestureDetector(
          onTap: () => setState(() => _selectedMode = mode.id),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            padding: EdgeInsets.all(12.w),
            decoration: BoxDecoration(
              color: isSelected ? const Color(0xFF37352F) : Colors.white,
              borderRadius: BorderRadius.circular(12.r),
              border: Border.all(
                color: isSelected
                    ? const Color(0xFF37352F)
                    : const Color(0xFFE8E8E5),
                width: isSelected ? 2 : 1,
              ),
              boxShadow: isSelected
                  ? [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.12),
                        blurRadius: 8,
                        offset: const Offset(0, 4),
                      ),
                    ]
                  : null,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(mode.emoji, style: TextStyle(fontSize: 22.sp)),
                Text(
                  mode.label,
                  style: TextStyle(
                    fontSize: 13.sp,
                    fontWeight: FontWeight.w600,
                    color: isSelected ? Colors.white : const Color(0xFF37352F),
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildLimitSelector() {
    return Wrap(
      spacing: 10.w,
      runSpacing: 10.h,
      children: _limitOptions.map((n) {
        final isSelected = _selectedLimit == n;
        return GestureDetector(
          onTap: () => setState(() => _selectedLimit = n),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            padding: EdgeInsets.symmetric(horizontal: 18.w, vertical: 10.h),
            decoration: BoxDecoration(
              color: isSelected ? const Color(0xFF37352F) : Colors.white,
              borderRadius: BorderRadius.circular(8.r),
              border: Border.all(
                color: isSelected
                    ? const Color(0xFF37352F)
                    : const Color(0xFFE8E8E5),
              ),
            ),
            child: Text(
              '$n 题',
              style: TextStyle(
                fontSize: 14.sp,
                fontWeight: FontWeight.w500,
                color: isSelected ? Colors.white : const Color(0xFF37352F),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildStartButton() {
    return Container(
      padding: EdgeInsets.fromLTRB(20.w, 16.h, 20.w, 32.h),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(
          top: BorderSide(color: Colors.black.withValues(alpha: 0.05)),
        ),
      ),
      child: SizedBox(
        width: double.infinity,
        height: 52.h,
        child: ElevatedButton(
          onPressed: _startPractice,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF37352F),
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10.r),
            ),
            elevation: 0,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('🚀', style: TextStyle(fontSize: 18)),
              SizedBox(width: 8.w),
              Text(
                '开始练习（$_selectedLimit 题）',
                style: TextStyle(
                  fontSize: 16.sp,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _startPractice() {
    // 重置练习状态，再跳转到练习页
    ref.read(practiceControllerProvider.notifier).reset();
    // 携带配置参数跳转练习页面（limit 通过路由参数传递）
    context.go('/practice', extra: {
      'mode': _selectedMode,
      'limit': _selectedLimit,
    });
  }
}

/// 练习模式数据模型
class _PracticeMode {
  final String id;
  final String label;
  final String emoji;
  final String desc;

  const _PracticeMode({
    required this.id,
    required this.label,
    required this.emoji,
    required this.desc,
  });
}
