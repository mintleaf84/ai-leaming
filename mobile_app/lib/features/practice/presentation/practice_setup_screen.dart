import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../../../core/navigation/app_nav.dart';
import 'practice_provider.dart';
import '../../../core/theme/app_icons.dart';
import '../../../core/theme/app_colors.dart';

/// 练习配置页面（与 Web /practice/setup 功能对齐）
class PracticeSetupScreen extends ConsumerStatefulWidget {
  const PracticeSetupScreen({super.key});

  @override
  ConsumerState<PracticeSetupScreen> createState() =>
      _PracticeSetupScreenState();
}

class _PracticeSetupScreenState extends ConsumerState<PracticeSetupScreen> {
  // 练习模式定义（后端 API 目前只支持 random，其余入口置灰待开放）
  static const _modes = [
    _PracticeMode(id: 'smart', label: '智能刷题', emoji: '🧠', desc: '40% 顽固 + 40% 盲区 + 20% 随机，AI 深度复盘', enabled: false),
    _PracticeMode(id: 'review', label: '错题强化', emoji: '🔄', desc: '专练历史错题，按错误次数排序', enabled: false),
    _PracticeMode(id: 'focus', label: '专项突破', emoji: '🎯', desc: '聚焦指定知识点，精准突破', enabled: false),
    _PracticeMode(id: 'random', label: '随机挑战', emoji: '🎲', desc: '完全随机抽题，快速查漏补缺', enabled: true),
  ];

  // 题目数量选项
  static const _limitOptions = [10, 15, 20, 25, 30, 50];

  String _selectedMode = 'random';
  int _selectedLimit = 20;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.colors.background,
      appBar: AppBar(
        elevation: 0,
        leading: IconButton(
          icon: Icon(AppIcons.arrowBack, color: context.colors.text),
          onPressed: () => context.backOrHome(),
        ),
        title: Text(
          '配置练习',
          style: TextStyle(
            fontSize: 18.sp,
            fontWeight: FontWeight.w600,
            color: context.colors.text,
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
                  _buildSectionTitle('选择练习模式', AppIcons.tune),
                  SizedBox(height: 12.h),
                  _buildModeGrid(),
                  SizedBox(height: 28.h),
                  // 题目数量
                  _buildSectionTitle('题目数量', AppIcons.formatListNumbered),
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
        Icon(icon, size: 18.sp, color: context.colors.text),
        SizedBox(width: 8.w),
        Text(
          title,
          style: TextStyle(
            fontSize: 16.sp,
            fontWeight: FontWeight.w600,
            color: context.colors.text,
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
        final card = AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: EdgeInsets.all(12.w),
          decoration: BoxDecoration(
            color: isSelected
                ? context.colors.primary
                : context.colors.surface,
            borderRadius: BorderRadius.circular(12.r),
            border: Border.all(
              color: isSelected
                  ? context.colors.primary
                  : context.colors.border,
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
                mode.enabled ? mode.label : '${mode.label}（暂未开放）',
                style: TextStyle(
                  fontSize: 13.sp,
                  fontWeight: FontWeight.w600,
                  color: isSelected
                      ? context.colors.onPrimary
                      : mode.enabled
                      ? context.colors.text
                      : context.colors.textSecondary,
                ),
              ),
            ],
          ),
        );
        if (!mode.enabled) {
          return Opacity(opacity: 0.45, child: card);
        }
        return GestureDetector(
          onTap: () => setState(() => _selectedMode = mode.id),
          child: card,
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
              color: isSelected
                  ? context.colors.primary
                  : context.colors.surface,
              borderRadius: BorderRadius.circular(8.r),
              border: Border.all(
                color: isSelected
                    ? context.colors.primary
                    : context.colors.border,
              ),
            ),
            child: Text(
              '$n 题',
              style: TextStyle(
                fontSize: 14.sp,
                fontWeight: FontWeight.w500,
                color: isSelected
                    ? context.colors.onPrimary
                    : context.colors.text,
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
        color: context.colors.surface,
        border: Border(
          top: BorderSide(
            color: context.colors.border.withValues(alpha: 0.5),
          ),
        ),
      ),
      child: SizedBox(
        width: double.infinity,
        height: 52.h,
        child: ElevatedButton(
          onPressed: _startPractice,
          style: ElevatedButton.styleFrom(
            backgroundColor: context.colors.primary,
            foregroundColor: context.colors.onPrimary,
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

  /// 防止"开始练习"被连点：连点会 push 出多条 /practice 路由，
  /// 每条的 initState 都会 createSession，最后落到哪个会话取决于返回顺序。
  bool _navigating = false;

  void _startPractice() {
    if (_navigating) return;
    _navigating = true;
    // 重置练习状态，再跳转到练习页
    ref.read(practiceControllerProvider.notifier).reset();
    // 携带配置参数跳转练习页面（limit 通过路由参数传递）
    context.pushDetail(
      AppRoutes.practice,
      extra: {'mode': _selectedMode, 'limit': _selectedLimit},
      // 从练习页回来（或返回键取消）时解锁，否则这个页面就再也点不动了
      onReturn: () => _navigating = false,
    );
  }
}

/// 练习模式数据模型
class _PracticeMode {
  final String id;
  final String label;
  final String emoji;
  final String desc;
  final bool enabled;

  const _PracticeMode({
    required this.id,
    required this.label,
    required this.emoji,
    required this.desc,
    required this.enabled,
  });
}
