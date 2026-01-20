import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:go_router/go_router.dart';
import '../providers/practice_provider.dart';

/// 练习结果页面
class ResultScreen extends ConsumerWidget {
  const ResultScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(practiceControllerProvider);

    // 计算统计数据
    final totalQuestions = state.questions.length;
    final correctCount = state.results.values.where((v) => v).length;
    final incorrectCount = state.results.values.where((v) => !v).length;
    final accuracy = totalQuestions > 0
        ? (correctCount / totalQuestions * 100).toInt()
        : 0;

    return Scaffold(
      backgroundColor: const Color(0xFFF7F7F5),
      body: SafeArea(
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: 24.w),
          child: Column(
            children: [
              SizedBox(height: 48.h),
              // 成功图标
              _buildResultIcon(accuracy),
              SizedBox(height: 24.h),
              // 标题
              Text(
                _getResultTitle(accuracy),
                style: TextStyle(
                  fontSize: 28.sp,
                  fontWeight: FontWeight.bold,
                  color: const Color(0xFF37352F),
                ),
              ),
              SizedBox(height: 8.h),
              Text(
                _getResultSubtitle(accuracy),
                style: TextStyle(
                  fontSize: 14.sp,
                  color: const Color(0xFF9B9A97),
                ),
                textAlign: TextAlign.center,
              ),
              SizedBox(height: 48.h),
              // 统计卡片
              _buildStatsCard(
                totalQuestions,
                correctCount,
                incorrectCount,
                accuracy,
              ),
              const Spacer(),
              // 操作按钮
              _buildActionButtons(context, ref),
              SizedBox(height: 32.h),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildResultIcon(int accuracy) {
    String emoji;
    Color bgColor;

    if (accuracy >= 80) {
      emoji = '🎉';
      bgColor = const Color(0xFFEDF6EE);
    } else if (accuracy >= 60) {
      emoji = '👍';
      bgColor = const Color(0xFFFFF4E5);
    } else {
      emoji = '💪';
      bgColor = const Color(0xFFFEF2F2);
    }

    return Container(
      width: 120.w,
      height: 120.h,
      decoration: BoxDecoration(color: bgColor, shape: BoxShape.circle),
      alignment: Alignment.center,
      child: Text(emoji, style: TextStyle(fontSize: 60.sp)),
    );
  }

  String _getResultTitle(int accuracy) {
    if (accuracy >= 80) return '太棒了！';
    if (accuracy >= 60) return '不错哦！';
    return '继续加油！';
  }

  String _getResultSubtitle(int accuracy) {
    if (accuracy >= 80) return '你的表现非常出色，继续保持！';
    if (accuracy >= 60) return '再多练习几次，你会更好的！';
    return '熟能生巧，多练习一定能进步！';
  }

  Widget _buildStatsCard(int total, int correct, int incorrect, int accuracy) {
    return Container(
      padding: EdgeInsets.all(24.w),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16.r),
        border: Border.all(color: const Color(0xFFE0E0E0)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.02),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          // 正确率大数字
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '$accuracy',
                style: TextStyle(
                  fontSize: 64.sp,
                  fontWeight: FontWeight.bold,
                  color: const Color(0xFF37352F),
                  height: 1,
                ),
              ),
              Padding(
                padding: EdgeInsets.only(bottom: 8.h),
                child: Text(
                  '%',
                  style: TextStyle(
                    fontSize: 24.sp,
                    fontWeight: FontWeight.bold,
                    color: const Color(0xFF9B9A97),
                  ),
                ),
              ),
            ],
          ),
          SizedBox(height: 8.h),
          Text(
            '正确率',
            style: TextStyle(fontSize: 14.sp, color: const Color(0xFF9B9A97)),
          ),
          SizedBox(height: 24.h),
          Divider(color: Colors.grey[200]),
          SizedBox(height: 16.h),
          // 详细统计
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildStatItem('总题数', '$total', const Color(0xFF37352F)),
              _buildStatItem('正确', '$correct', const Color(0xFF4EA05E)),
              _buildStatItem('错误', '$incorrect', const Color(0xFFD95656)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatItem(String label, String value, Color valueColor) {
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(
            fontSize: 24.sp,
            fontWeight: FontWeight.bold,
            color: valueColor,
          ),
        ),
        SizedBox(height: 4.h),
        Text(
          label,
          style: TextStyle(fontSize: 12.sp, color: const Color(0xFF9B9A97)),
        ),
      ],
    );
  }

  Widget _buildActionButtons(BuildContext context, WidgetRef ref) {
    return Column(
      children: [
        // 返回首页按钮
        SizedBox(
          width: double.infinity,
          height: 52.h,
          child: ElevatedButton(
            onPressed: () {
              ref.read(practiceControllerProvider.notifier).reset();
              context.go('/dashboard');
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF37352F),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12.r),
              ),
              elevation: 0,
            ),
            child: Text(
              '返回首页',
              style: TextStyle(fontSize: 16.sp, fontWeight: FontWeight.w600),
            ),
          ),
        ),
        SizedBox(height: 12.h),
        // 再来一轮按钮
        SizedBox(
          width: double.infinity,
          height: 52.h,
          child: OutlinedButton(
            onPressed: () {
              ref.read(practiceControllerProvider.notifier).reset();
              context.go('/practice');
            },
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFF37352F),
              side: const BorderSide(color: Color(0xFFE0E0E0)),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12.r),
              ),
            ),
            child: Text(
              '再来一轮',
              style: TextStyle(fontSize: 16.sp, fontWeight: FontWeight.w600),
            ),
          ),
        ),
      ],
    );
  }
}
