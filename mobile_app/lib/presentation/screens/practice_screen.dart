import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:go_router/go_router.dart';
import '../providers/practice_provider.dart';

class PracticeScreen extends ConsumerStatefulWidget {
  const PracticeScreen({super.key});

  @override
  ConsumerState<PracticeScreen> createState() => _PracticeScreenState();
}

class _PracticeScreenState extends ConsumerState<PracticeScreen> {
  @override
  void initState() {
    super.initState();
    // 页面加载时创建会话
    Future.microtask(() {
      ref.read(practiceControllerProvider.notifier).createSession(limit: 10);
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(practiceControllerProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFFFFFFF),
      body: SafeArea(
        bottom: false,
        child: state.isLoading
            ? const Center(child: CircularProgressIndicator())
            : state.error != null
            ? _buildErrorView(state.error!)
            : state.questions.isEmpty
            ? _buildEmptyView()
            : _buildQuestionView(state),
      ),
    );
  }

  Widget _buildErrorView(String error) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.error_outline, size: 48.sp, color: Colors.red),
          SizedBox(height: 16.h),
          Text(
            '加载失败',
            style: TextStyle(fontSize: 18.sp, fontWeight: FontWeight.bold),
          ),
          SizedBox(height: 8.h),
          Text(
            error,
            style: TextStyle(fontSize: 14.sp, color: Colors.grey),
          ),
          SizedBox(height: 24.h),
          ElevatedButton(
            onPressed: () =>
                ref.read(practiceControllerProvider.notifier).createSession(),
            child: const Text('重试'),
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
          Text('📚', style: TextStyle(fontSize: 64.sp)),
          SizedBox(height: 16.h),
          Text(
            '题库中暂无题目',
            style: TextStyle(fontSize: 18.sp, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }

  Widget _buildQuestionView(PracticeSessionState state) {
    final question = state.currentQuestion!;
    final selectedAnswer = state.userAnswers[question.id];
    final result = state.results[question.id];

    return Stack(
      children: [
        Column(
          children: [
            // Header
            _buildHeader(state),
            // Question Content
            Expanded(
              child: SingleChildScrollView(
                padding: EdgeInsets.symmetric(horizontal: 20.w),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(height: 16.h),
                    // Breadcrumb (placeholder)
                    _buildBreadcrumb(),
                    SizedBox(height: 24.h),
                    // Question Icon & Text
                    Text('📜', style: TextStyle(fontSize: 40.sp)),
                    SizedBox(height: 16.h),
                    Text(
                      question.content,
                      style: TextStyle(
                        fontSize: 22.sp,
                        fontWeight: FontWeight.w600,
                        height: 1.4,
                        color: const Color(0xFF37352F),
                        fontFamily: 'Noto Serif SC',
                      ),
                    ),
                    SizedBox(height: 32.h),
                    // Options
                    ...question.options.asMap().entries.map((entry) {
                      final index = entry.key;
                      final option = entry.value;
                      final optionLabel = String.fromCharCode(
                        65 + index,
                      ); // A, B, C, D
                      return _buildOptionCard(
                        label: optionLabel,
                        text: option,
                        isSelected: selectedAnswer == optionLabel,
                        isCorrect:
                            result == true && selectedAnswer == optionLabel,
                        isWrong:
                            result == false && selectedAnswer == optionLabel,
                        onTap: result == null
                            ? () => ref
                                  .read(practiceControllerProvider.notifier)
                                  .selectAnswer(optionLabel)
                            : null,
                      );
                    }),
                    SizedBox(height: 120.h), // Space for bottom nav
                  ],
                ),
              ),
            ),
          ],
        ),
        // Bottom Navigation
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: _buildBottomNav(state, selectedAnswer, result),
        ),
      ],
    );
  }

  Widget _buildHeader(PracticeSessionState state) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 12.h),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              IconButton(
                onPressed: () => context.pop(),
                icon: const Icon(Icons.close),
                color: const Color(0xFF37352F).withOpacity(0.6),
              ),
              Text(
                '刷题模式',
                style: TextStyle(
                  fontSize: 12.sp,
                  fontWeight: FontWeight.w500,
                  color: const Color(0xFF37352F).withOpacity(0.4),
                  letterSpacing: 2,
                ),
              ),
              IconButton(
                onPressed: () {},
                icon: const Icon(Icons.more_horiz),
                color: const Color(0xFF37352F).withOpacity(0.6),
              ),
            ],
          ),
          SizedBox(height: 8.h),
          // Progress Bar
          ClipRRect(
            borderRadius: BorderRadius.circular(4.r),
            child: LinearProgressIndicator(
              value: state.progress,
              backgroundColor: const Color(0xFF37352F).withOpacity(0.05),
              color: const Color(0xFF37352F),
              minHeight: 6.h,
            ),
          ),
          SizedBox(height: 6.h),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '${state.currentIndex + 1} / ${state.questions.length}',
                style: TextStyle(
                  fontSize: 10.sp,
                  color: const Color(0xFF37352F).withOpacity(0.4),
                  fontFamily: 'monospace',
                ),
              ),
              Text(
                '${(state.progress * 100).toInt()}%',
                style: TextStyle(
                  fontSize: 10.sp,
                  color: const Color(0xFF37352F).withOpacity(0.4),
                  fontFamily: 'monospace',
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildBreadcrumb() {
    return Row(
      children: [
        Text('🇨🇳', style: TextStyle(fontSize: 14.sp)),
        SizedBox(width: 4.w),
        Text(
          '综合练习',
          style: TextStyle(
            fontSize: 12.sp,
            color: const Color(0xFF37352F).withOpacity(0.5),
          ),
        ),
        Text(
          ' / ',
          style: TextStyle(
            fontSize: 12.sp,
            color: const Color(0xFF37352F).withOpacity(0.3),
          ),
        ),
        Text(
          '随机模式',
          style: TextStyle(
            fontSize: 12.sp,
            color: const Color(0xFF37352F).withOpacity(0.5),
          ),
        ),
      ],
    );
  }

  Widget _buildOptionCard({
    required String label,
    required String text,
    required bool isSelected,
    required bool isCorrect,
    required bool isWrong,
    VoidCallback? onTap,
  }) {
    Color bgColor = Colors.white;
    Color borderColor = const Color(0xFFE1E1E1);
    Color? ringColor;
    Widget? leadingIcon;

    if (isCorrect) {
      bgColor = const Color(0xFFEDF6EE);
      borderColor = const Color(0xFF5C9D6E).withOpacity(0.3);
      ringColor = const Color(0xFF5C9D6E).withOpacity(0.5);
      leadingIcon = Container(
        width: 20.w,
        height: 20.h,
        decoration: const BoxDecoration(
          color: Color(0xFF4EA05E),
          shape: BoxShape.circle,
        ),
        child: Icon(Icons.check, size: 14.sp, color: Colors.white),
      );
    } else if (isWrong) {
      bgColor = const Color(0xFFFBE4E4);
      borderColor = const Color(0xFFE06C75).withOpacity(0.3);
      ringColor = const Color(0xFFE06C75).withOpacity(0.5);
      leadingIcon = Container(
        width: 20.w,
        height: 20.h,
        decoration: const BoxDecoration(
          color: Color(0xFFD95656),
          shape: BoxShape.circle,
        ),
        child: Icon(Icons.close, size: 14.sp, color: Colors.white),
      );
    } else if (isSelected) {
      borderColor = const Color(0xFF37352F).withOpacity(0.4);
      leadingIcon = Container(
        width: 20.w,
        height: 20.h,
        decoration: BoxDecoration(
          color: const Color(0xFF37352F),
          shape: BoxShape.circle,
        ),
        child: Icon(Icons.circle, size: 10.sp, color: Colors.white),
      );
    } else {
      leadingIcon = Container(
        width: 20.w,
        height: 20.h,
        decoration: BoxDecoration(
          border: Border.all(color: const Color(0xFF37352F).withOpacity(0.2)),
          shape: BoxShape.circle,
        ),
      );
    }

    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: EdgeInsets.only(bottom: 12.h),
        padding: EdgeInsets.all(14.w),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(8.r),
          border: Border.all(color: borderColor),
          boxShadow: ringColor != null
              ? [BoxShadow(color: ringColor, blurRadius: 0, spreadRadius: 1)]
              : null,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: EdgeInsets.only(top: 2.h),
              child: leadingIcon,
            ),
            SizedBox(width: 12.w),
            Expanded(
              child: Text(
                '$label. $text',
                style: TextStyle(
                  fontSize: 15.sp,
                  fontWeight: FontWeight.w500,
                  color: const Color(0xFF37352F),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBottomNav(
    PracticeSessionState state,
    String? selectedAnswer,
    bool? result,
  ) {
    return Container(
      padding: EdgeInsets.only(
        left: 24.w,
        right: 24.w,
        top: 16.h,
        bottom: 32.h,
      ),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.85),
        border: Border(top: BorderSide(color: Colors.black.withOpacity(0.05))),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // 上一题
          _buildNavButton(
            icon: Icons.chevron_left,
            label: '上一题',
            onTap: state.hasPrev
                ? () => ref
                      .read(practiceControllerProvider.notifier)
                      .prevQuestion()
                : null,
          ),
          // 确认/下一题
          _buildCenterButton(
            selectedAnswer: selectedAnswer,
            result: result,
            hasNext: state.hasNext,
          ),
          // 下一题
          _buildNavButton(
            icon: Icons.chevron_right,
            label: '下一题',
            onTap: state.hasNext
                ? () => ref
                      .read(practiceControllerProvider.notifier)
                      .nextQuestion()
                : null,
          ),
        ],
      ),
    );
  }

  Widget _buildNavButton({
    required IconData icon,
    required String label,
    VoidCallback? onTap,
  }) {
    final isEnabled = onTap != null;
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 40.w,
            height: 40.h,
            decoration: BoxDecoration(
              color: const Color(
                0xFF37352F,
              ).withOpacity(isEnabled ? 0.05 : 0.02),
              borderRadius: BorderRadius.circular(12.r),
            ),
            child: Icon(
              icon,
              color: const Color(0xFF37352F).withOpacity(isEnabled ? 1 : 0.3),
            ),
          ),
          SizedBox(height: 4.h),
          Text(
            label,
            style: TextStyle(
              fontSize: 10.sp,
              fontWeight: FontWeight.w500,
              color: const Color(0xFF37352F).withOpacity(isEnabled ? 0.6 : 0.3),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCenterButton({
    required String? selectedAnswer,
    required bool? result,
    required bool hasNext,
  }) {
    // 已提交则显示下一题
    if (result != null) {
      return GestureDetector(
        onTap: hasNext
            ? () => ref.read(practiceControllerProvider.notifier).nextQuestion()
            : () => context.go('/dashboard'), // 完成所有题目
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56.w,
              height: 56.h,
              decoration: BoxDecoration(
                color: const Color(0xFF37352F),
                borderRadius: BorderRadius.circular(16.r),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.1),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Icon(
                hasNext ? Icons.arrow_forward : Icons.check,
                color: Colors.white,
                size: 28.sp,
              ),
            ),
            SizedBox(height: 4.h),
            Text(
              hasNext ? '下一题' : '完成',
              style: TextStyle(
                fontSize: 10.sp,
                fontWeight: FontWeight.w600,
                color: const Color(0xFF37352F),
              ),
            ),
          ],
        ),
      );
    }

    // 未选择则显示确认按钮 (禁用)
    // 已选择则显示确认按钮 (启用)
    return GestureDetector(
      onTap: selectedAnswer != null
          ? () {
              // 服务端校验正确答案
              ref
                  .read(practiceControllerProvider.notifier)
                  .submitCurrentAnswer();
            }
          : null,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 56.w,
            height: 56.h,
            decoration: BoxDecoration(
              color: selectedAnswer != null
                  ? const Color(0xFF37352F)
                  : const Color(0xFF37352F).withOpacity(0.2),
              borderRadius: BorderRadius.circular(16.r),
              boxShadow: selectedAnswer != null
                  ? [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.1),
                        blurRadius: 8,
                        offset: const Offset(0, 2),
                      ),
                    ]
                  : null,
            ),
            child: Icon(Icons.check, color: Colors.white, size: 28.sp),
          ),
          SizedBox(height: 4.h),
          Text(
            '确认',
            style: TextStyle(
              fontSize: 10.sp,
              fontWeight: FontWeight.w600,
              color: selectedAnswer != null
                  ? const Color(0xFF37352F)
                  : const Color(0xFF37352F).withOpacity(0.4),
            ),
          ),
        ],
      ),
    );
  }
}
