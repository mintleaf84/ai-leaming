import 'dart:async';
import 'package:flutter/material.dart';
import 'dart:math' as math;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:confetti/confetti.dart';
import '../../../core/navigation/app_nav.dart';
import 'practice_provider.dart';
import 'practice_resume_provider.dart';
import '../../../core/utils/haptic_util.dart';
import '../../../core/theme/app_colors.dart';

/// 练习结果页面
class ResultScreen extends ConsumerStatefulWidget {
  const ResultScreen({super.key});

  @override
  ConsumerState<ResultScreen> createState() => _ResultScreenState();
}

class _ResultScreenState extends ConsumerState<ResultScreen> {
  late ConfettiController _confettiController;

  @override
  void initState() {
    super.initState();
    _confettiController = ConfettiController(duration: const Duration(seconds: 3));

    // 已经到结果页：这场练习没有「续练」可言，断点立即作废。
    // 放在这里而不是「返回首页」按钮里，是因为用户也可能直接从结果页杀掉 App。
    unawaited(
      ref.read(practiceResumeControllerProvider.notifier).clear(),
    );

    // 页面加载后延迟触发庆祝
    Future.delayed(const Duration(milliseconds: 500), () {
      // 500 ms 内离开本页时 dispose 已执行，这里不能再碰 controller。
      if (!mounted) return;
      final state = ref.read(practiceControllerProvider);
      final totalQuestions = state.questions.length;
      final correctCount = state.results.values.where((v) => v).length;
      final accuracy = totalQuestions > 0 ? (correctCount / totalQuestions * 100).toInt() : 0;
      
      if (accuracy >= 80) {
        _confettiController.play();
        HapticUtil.success();
      }
    });
  }

  @override
  void dispose() {
    _confettiController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(practiceControllerProvider);

    // 计算统计数据
    final totalQuestions = state.questions.length;
    final correctCount = state.results.values.where((v) => v).length;
    final incorrectCount = state.results.values.where((v) => !v).length;
    final accuracy = totalQuestions > 0
        ? (correctCount / totalQuestions * 100).toInt()
        : 0;

    return Scaffold(
      backgroundColor: context.colors.background,
      body: Stack(
        children: [
          SafeArea(
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: 24.w),
              child: Column(
                children: [
                  SizedBox(height: 48.h),
                  // 成功图标
                  TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0.0, end: 1.0),
                    duration: const Duration(seconds: 1),
                    curve: Curves.elasticOut,
                    builder: (context, value, child) {
                      return Transform.scale(scale: value, child: child);
                    },
                    child: _buildResultIcon(accuracy),
                  ),
                  SizedBox(height: 24.h),
                  // 标题
                  Text(
                    _getResultTitle(accuracy),
                    style: TextStyle(
                      fontSize: 28.sp,
                      fontWeight: FontWeight.bold,
                      color: context.colors.text,
                    ),
                  ),
                  SizedBox(height: 8.h),
                  Text(
                    _getResultSubtitle(accuracy),
                    style: TextStyle(
                      fontSize: 14.sp,
                      color: context.colors.textSecondary,
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
          // 顶部对齐的纸屑
          Align(
            alignment: Alignment.topCenter,
            child: ConfettiWidget(
              confettiController: _confettiController,
              blastDirectionality: BlastDirectionality.explosive,
              shouldLoop: false,
              colors: const [
                Colors.green,
                Colors.blue,
                Colors.pink,
                Colors.orange,
                Colors.purple,
                Colors.yellow,
              ],
              createParticlePath: _drawStar,
            ),
          ),
        ],
      ),
    );
  }

  /// 绘制星形粒子
  Path _drawStar(Size size) {
    double degToRad(double deg) => deg * (3.1415926535897932 / 180.0);

    const numberOfPoints = 5;
    final halfWidth = size.width / 2;
    final externalRadius = halfWidth;
    final internalRadius = halfWidth / 2.5;
    final degreesPerStep = degToRad(360 / numberOfPoints);
    final halfDegreesPerStep = degreesPerStep / 2;
    final path = Path();
    final fullAngle = degToRad(360);
    path.moveTo(size.width, halfWidth);

    for (double step = 0; step < fullAngle; step += degreesPerStep) {
      path.lineTo(
        halfWidth + externalRadius * math.cos(step),
        halfWidth + externalRadius * math.sin(step),
      );
      path.lineTo(
        halfWidth + internalRadius * math.cos(step + halfDegreesPerStep),
        halfWidth + internalRadius * math.sin(step + halfDegreesPerStep),
      );
    }
    path.close();
    return path;
  }

  Widget _buildResultIcon(int accuracy) {
    String emoji;
    Color bgColor;

    if (accuracy >= 80) {
      emoji = '🎉';
      bgColor = context.colors.successContainer;
    } else if (accuracy >= 60) {
      emoji = '👍';
      bgColor = context.colors.warningContainer;
    } else {
      emoji = '💪';
      bgColor = context.colors.errorContainer;
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
        color: context.colors.surface,
        borderRadius: BorderRadius.circular(16.r),
        border: Border.all(color: context.colors.border),
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
                  color: context.colors.text,
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
                    color: context.colors.textSecondary,
                  ),
                ),
              ),
            ],
          ),
          SizedBox(height: 8.h),
          Text(
            '正确率',
            style: TextStyle(
              fontSize: 14.sp,
              color: context.colors.textSecondary,
            ),
          ),
          SizedBox(height: 24.h),
          Divider(color: context.colors.border),
          SizedBox(height: 16.h),
          // 详细统计
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildStatItem('总题数', '$total', context.colors.text),
              _buildStatItem('正确', '$correct', context.colors.success),
              _buildStatItem('错误', '$incorrect', context.colors.error),
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
          style: TextStyle(
            fontSize: 12.sp,
            color: context.colors.textSecondary,
          ),
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
              // 「返回首页」要丢掉练习/结果这层栈，不能 pop 回上一页
              context.replace(AppRoutes.dashboard);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: context.colors.primary,
              foregroundColor: context.colors.onPrimary,
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
              context.replace(AppRoutes.practice);
            },
            style: OutlinedButton.styleFrom(
              foregroundColor: context.colors.text,
              side: BorderSide(color: context.colors.border),
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
