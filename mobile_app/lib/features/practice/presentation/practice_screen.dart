import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_app/features/practice/presentation/practice_provider.dart';
import 'package:mobile_app/features/practice/domain/question.dart';
import 'package:mobile_app/core/theme/app_theme.dart';
import 'package:mobile_app/shared/widgets/animated_option_card.dart';
import 'package:mobile_app/shared/widgets/skeleton_widgets.dart';
import 'package:mobile_app/features/practice/presentation/widgets/first_principles_panel.dart';

class PracticeScreen extends ConsumerStatefulWidget {
  /// 来自配置页的练习参数（可选，默认随机10题）
  final Map<String, dynamic>? config;

  const PracticeScreen({super.key, this.config});

  @override
  ConsumerState<PracticeScreen> createState() => _PracticeScreenState();
}

class _PracticeScreenState extends ConsumerState<PracticeScreen> {
  @override
  void initState() {
    super.initState();
    // 页面加载时创建会话，优先使用配置参数
    final limit = (widget.config?['limit'] as int?) ?? 10;
    final mode = (widget.config?['mode'] as String?) ?? 'random';
    Future.microtask(() {
      ref.read(practiceControllerProvider.notifier).createSession(
        limit: limit,
        mode: mode,
      );
    });
  }

  Future<bool?> _showExitDialog() {
    return showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('退出练习'),
        content: const Text('当前的练习进度将会丢失，确认退出吗？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('继续练习'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('确认退出'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(practiceControllerProvider);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
        final shouldPop = await _showExitDialog();
        if (shouldPop ?? false) {
          if (context.mounted) context.pop();
        }
      },
      child: Scaffold(
        backgroundColor: const Color(0xFFFFFFFF),
        body: SafeArea(
          bottom: false,
          child: state.isLoading && state.questions.isEmpty
              ? const PracticeSkeleton()
              : state.error != null && state.questions.isEmpty
              ? _buildErrorView(state.error!)
              : state.questions.isEmpty
              ? _buildEmptyView()
              : _buildQuestionView(state),
        ),
      ),
    );
  }

  Widget _buildErrorView(String error) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.error_outline, size: 48.sp, color: Colors.red[300]),
          SizedBox(height: 16.h),
          Text(
            '加载失败',
            style: TextStyle(fontSize: 18.sp, fontWeight: FontWeight.bold),
          ),
          SizedBox(height: 8.h),
          Text(
            '请检查网络后重试',
            style: TextStyle(fontSize: 14.sp, color: Colors.grey),
          ),
          SizedBox(height: 24.h),
          ElevatedButton.icon(
            onPressed: () =>
                ref.read(practiceControllerProvider.notifier).createSession(),
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
          SizedBox(height: 12.h),
          TextButton(
            onPressed: () => context.go('/dashboard'),
            child: Text(
              '返回首页',
              style: TextStyle(fontSize: 14.sp, color: Colors.grey),
            ),
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
          SizedBox(height: 8.h),
          Text(
            '请稍后再试',
            style: TextStyle(fontSize: 14.sp, color: Colors.grey),
          ),
          SizedBox(height: 24.h),
          TextButton.icon(
            onPressed: () => context.go('/dashboard'),
            icon: const Icon(Icons.arrow_back, size: 18),
            label: const Text('返回首页'),
            style: TextButton.styleFrom(
              foregroundColor: const Color(0xFF37352F),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuestionView(PracticeSessionState state) {
    final question = state.currentQuestion!;
    final selectedAnswers = state.userAnswers[question.id] ?? [];
    final result = state.results[question.id];
    final isMulti = question.type == 'multi';
    final isTrueFalse = question.type == 'truefalse';
    // 正确答案列表（多选可能是 JSON 数组）
    final correctAnswerRaw = state.correctAnswers[question.id];
    List<String> correctAnswerList = [];
    if (correctAnswerRaw != null) {
      try {
        correctAnswerList = List<String>.from(jsonDecode(correctAnswerRaw));
      } catch (_) {
        correctAnswerList = [correctAnswerRaw];
      }
    }

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
                    // 题型标签
                    Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: 8.w,
                        vertical: 3.h,
                      ),
                      decoration: BoxDecoration(
                        color: isTrueFalse
                            ? const Color(0xFFFFF3E0) // 判断题：橙色背景
                            : isMulti
                                ? const Color(0xFFF3E5F5)
                                : const Color(0xFFE3F2FD),
                        borderRadius: BorderRadius.circular(4.r),
                      ),
                      child: Text(
                        isTrueFalse ? '判断题' : isMulti ? '多选题' : '单选题',
                        style: TextStyle(
                          fontSize: 11.sp,
                          fontWeight: FontWeight.w600,
                          color: isTrueFalse
                              ? const Color(0xFFE65100) // 判断题：橙色文字
                              : isMulti
                                  ? const Color(0xFF7B1FA2)
                                  : const Color(0xFF1976D2),
                        ),
                      ),
                    ),
                    SizedBox(height: 12.h),
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
                    // 选项卡片（带动效）
                    ...question.options.asMap().entries.map((entry) {
                      final index = entry.key;
                      final option = entry.value;
                      final optionLabel = String.fromCharCode(
                        65 + index,
                      ); // A, B, C, D
                      final isSelected = selectedAnswers.contains(optionLabel);
                      // 多选时：高亮所有正确选项
                      final isCorrectOption =
                          result != null &&
                          correctAnswerList.contains(optionLabel);
                      return AnimatedOptionCard(
                        label: optionLabel,
                        text: option,
                        isSelected: isSelected,
                        isMultiSelect: isMulti,
                        isCorrect: isCorrectOption && isSelected,
                        isWrong:
                            result == false && isSelected && !isCorrectOption,
                        showCorrectHint: result != null && isCorrectOption,
                        onTap: result == null
                            ? () => ref
                                  .read(practiceControllerProvider.notifier)
                                  .toggleAnswer(optionLabel)
                            : null,
                      );
                    }),
                    if (result != null) ...[
                      SizedBox(height: 32.h),
                      _buildExplanationPanel(state, question, result),
                    ],
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
          child: _buildBottomNav(state, selectedAnswers, result),
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
                onPressed: () async {
                  final shouldPop = await _showExitDialog();
                  if (shouldPop ?? false) {
                    if (context.mounted) context.pop();
                  }
                },
                icon: const Icon(Icons.close),
                color: const Color(0xFF37352F).withValues(alpha: 0.6),
              ),
              Text(
                '刷题模式',
                style: TextStyle(
                  fontSize: 12.sp,
                  fontWeight: FontWeight.w500,
                  color: const Color(0xFF37352F).withValues(alpha: 0.4),
                  letterSpacing: 2,
                ),
              ),
              IconButton(
                onPressed: () {},
                icon: const Icon(Icons.more_horiz),
                color: const Color(0xFF37352F).withValues(alpha: 0.6),
              ),
            ],
          ),
          SizedBox(height: 8.h),
          // Progress Bar
          ClipRRect(
            borderRadius: BorderRadius.circular(4.r),
            child: LinearProgressIndicator(
              value: state.progress,
              backgroundColor: const Color(0xFF37352F).withValues(alpha: 0.05),
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
                  color: const Color(0xFF37352F).withValues(alpha: 0.4),
                  fontFamily: 'monospace',
                ),
              ),
              Text(
                '${(state.progress * 100).toInt()}%',
                style: TextStyle(
                  fontSize: 10.sp,
                  color: const Color(0xFF37352F).withValues(alpha: 0.4),
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
            color: const Color(0xFF37352F).withValues(alpha: 0.5),
          ),
        ),
        Text(
          ' / ',
          style: TextStyle(
            fontSize: 12.sp,
            color: const Color(0xFF37352F).withValues(alpha: 0.3),
          ),
        ),
        Text(
          '随机模式',
          style: TextStyle(
            fontSize: 12.sp,
            color: const Color(0xFF37352F).withValues(alpha: 0.5),
          ),
        ),
      ],
    );
  }

  Widget _buildExplanationPanel(
    PracticeSessionState state,
    Question question,
    bool isCorrect,
  ) {
    final correctAnswerRaw = state.correctAnswers[question.id] ?? '...';
    // 多选题格式化显示
    String displayAnswer;
    try {
      final parsed = jsonDecode(correctAnswerRaw);
      if (parsed is List) {
        displayAnswer = parsed.join(', ');
      } else {
        displayAnswer = correctAnswerRaw;
      }
    } catch (_) {
      displayAnswer = correctAnswerRaw;
    }
    final explanation = state.explanations[question.id];

    return Container(
      width: double.infinity,
      padding: EdgeInsets.all(16.w),
      decoration: BoxDecoration(
        color: isCorrect ? const Color(0xFFF6FFED) : const Color(0xFFFEF2F2),
        borderRadius: BorderRadius.circular(8.r),
        border: Border.all(
          color: isCorrect ? const Color(0xFFB7EB8F) : const Color(0xFFFECACA),
          width: 0.5,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: EdgeInsets.only(top: 2.h),
            child: Text(
              isCorrect ? '💡' : '⚠️',
              style: TextStyle(fontSize: 18.sp),
            ),
          ),
          SizedBox(width: 12.w),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isCorrect ? '回答正确' : '回答错误',
                  style: TextStyle(
                    fontSize: 15.sp,
                    fontWeight: FontWeight.w600,
                    color: isCorrect
                        ? const Color(0xFF237804)
                        : const Color(0xFFB91C1C),
                  ),
                ),
                SizedBox(height: 8.h),
                Text(
                  '正确答案：$displayAnswer',
                  style: TextStyle(
                    fontSize: 14.sp,
                    fontWeight: FontWeight.w600,
                    color: const Color(0xFF37352F),
                  ),
                ),
                if (state.isLoading || explanation != null) ...[
                  SizedBox(height: 12.h),
                  Container(
                    width: double.infinity,
                    padding: EdgeInsets.all(12.w),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.6),
                      borderRadius: BorderRadius.circular(6.r),
                    ),
                    child: state.isLoading
                        ? Row(
                            children: [
                              SizedBox(
                                height: 14.w,
                                width: 14.w,
                                child: const CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Color(0xFF135BEC),
                                ),
                              ),
                              SizedBox(width: 8.w),
                              Text(
                                '正在生成解析...',
                                style: TextStyle(
                                  fontSize: 13.sp,
                                  color: const Color(0xFF787774),
                                ),
                              ),
                            ],
                          )
                        : Text(
                            explanation!,
                            style: TextStyle(
                              fontSize: 14.sp,
                              height: 1.6,
                              color: const Color(
                                0xFF37352F,
                              ).withValues(alpha: 0.9),
                            ),
                          ),
                  ),
                ],
                SizedBox(height: 16.h),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () {
                      // 触发并显示 AI 分析
                      ref.read(practiceControllerProvider.notifier).fetchFirstPrinciples(question.id);
                      showModalBottomSheet(
                        context: context,
                        isScrollControlled: true,
                        backgroundColor: Colors.transparent,
                        builder: (context) => FirstPrinciplesPanel(questionId: question.id),
                      );
                    },
                    icon: Icon(
                      Icons.smart_toy,
                      color: const Color(0xFF135BEC),
                      size: 16.sp,
                    ),
                    label: Text(
                      'AI 第一性原理解读',
                      style: TextStyle(
                        color: const Color(0xFF135BEC),
                        fontSize: 13.sp,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    style: OutlinedButton.styleFrom(
                      backgroundColor: Colors.white,
                      side: const BorderSide(
                        color: Color(0xFF135BEC),
                        width: 1,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(6.r),
                      ),
                      padding: EdgeInsets.symmetric(vertical: 10.h),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomNav(
    PracticeSessionState state,
    List<String> selectedAnswers,
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
        color: Colors.white.withValues(alpha: 0.85),
        border: Border(
          top: BorderSide(color: Colors.black.withValues(alpha: 0.05)),
        ),
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
            selectedAnswers: selectedAnswers,
            result: result,
            hasNext: state.hasNext,
            isConfirming: state.isLoading,
            isMulti: state.currentQuestion?.type == 'multi',
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
              ).withValues(alpha: isEnabled ? 0.05 : 0.02),
              borderRadius: BorderRadius.circular(12.r),
            ),
            child: Icon(
              icon,
              color: const Color(
                0xFF37352F,
              ).withValues(alpha: isEnabled ? 1 : 0.3),
            ),
          ),
          SizedBox(height: 4.h),
          Text(
            label,
            style: TextStyle(
              fontSize: 10.sp,
              fontWeight: FontWeight.w500,
              color: const Color(
                0xFF37352F,
              ).withValues(alpha: isEnabled ? 0.6 : 0.3),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCenterButton({
    required List<String> selectedAnswers,
    required bool? result,
    required bool hasNext,
    required bool isConfirming,
    bool isMulti = false,
  }) {
    // 判断是否可以提交
    final bool canSubmit;
    if (isMulti) {
      canSubmit = selectedAnswers.length >= 2; // 多选至少选2项
    } else {
      canSubmit = selectedAnswers.isNotEmpty;
    }
    // 已提交则显示下一题
    if (result != null) {
      return GestureDetector(
        onTap: hasNext
            ? () => ref.read(practiceControllerProvider.notifier).nextQuestion()
            : () => context.go('/result'), // 完成所有题目，跳转结果页
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
                    color: Colors.black.withValues(alpha: 0.1),
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
    // 已选择则显示确认按钮 (启用，如果不在判卷中)
    return GestureDetector(
      onTap: (canSubmit && !isConfirming)
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
              color: canSubmit
                  ? const Color(0xFF37352F)
                  : const Color(0xFF37352F).withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(16.r),
              boxShadow: (canSubmit && !isConfirming)
                  ? [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.1),
                        blurRadius: 8,
                        offset: const Offset(0, 2),
                      ),
                    ]
                  : null,
            ),
            child: isConfirming
                ? Padding(
                    padding: EdgeInsets.all(16.w),
                    child: const CircularProgressIndicator(
                      color: Colors.white,
                      strokeWidth: 2,
                    ),
                  )
                : Icon(Icons.check, color: Colors.white, size: 28.sp),
          ),
          SizedBox(height: 4.h),
          Text(
            isConfirming ? '判卷中...' : '确认',
            style: TextStyle(
              fontSize: 10.sp,
              fontWeight: FontWeight.w600,
              color: canSubmit
                  ? const Color(0xFF37352F)
                  : const Color(0xFF37352F).withValues(alpha: 0.4),
            ),
          ),
        ],
      ),
    );
  }
}
