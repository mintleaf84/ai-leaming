import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:mobile_app/features/practice/presentation/practice_provider.dart';
import 'package:mobile_app/features/practice/domain/question.dart';
import 'package:mobile_app/shared/widgets/animated_option_card.dart';
import 'package:mobile_app/shared/skeletons/skeleton_fakes.dart';
import 'package:mobile_app/features/practice/presentation/widgets/first_principles_panel.dart';
import 'package:mobile_app/features/practice/presentation/widgets/question_material_card.dart';
import '../../../core/a11y/status_announcer.dart';
import '../../../core/navigation/app_nav.dart';
import 'package:skeletonizer/skeletonizer.dart';
import 'package:mobile_app/core/theme/app_icons.dart';
import 'package:mobile_app/core/theme/app_colors.dart';
import 'package:mobile_app/shared/widgets/state_views.dart';

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
    // 页面加载时创建会话，优先使用配置参数。
    // 带 sessionId 时表示「从错题本进来」，复用已建好的会话，不再新建。
    final sessionId = widget.config?['sessionId'] as String?;
    final limit = (widget.config?['limit'] as int?) ?? 10;
    final mode = (widget.config?['mode'] as String?) ?? 'random';
    Future.microtask(() {
      final controller = ref.read(practiceControllerProvider.notifier);
      if (sessionId != null && sessionId.isNotEmpty) {
        controller.loadSession(sessionId);
      } else {
        controller.createSession(limit: limit, mode: mode);
      }
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
            style: TextButton.styleFrom(foregroundColor: context.colors.error),
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
          if (context.mounted) {
            // 退出前丢掉本场状态：配置页还在栈里，不清空的话"再开一场"会与旧会话竞争
            ref.read(practiceControllerProvider.notifier).reset();
            context.backOrHome();
          }
        }
      },
      child: Scaffold(
        backgroundColor: context.colors.background,
        body: SafeArea(
          bottom: false,
          child: state.isLoading && state.questions.isEmpty
              ? _buildSkeleton()
              : state.error != null && state.questions.isEmpty
              ? _buildErrorView()
              : state.questions.isEmpty
              ? _buildEmptyView()
              : Column(
                  children: [
                    if (state.isOffline) _buildOfflineBanner(),
                    Expanded(child: _buildQuestionView(state)),
                  ],
                ),
        ),
      ),
    );
  }

  /// 整题视图骨架：用假状态驱动真实布局，再由 Skeletonizer 抹成骨块，
  /// 保证「加载中」与「加载完成」的版式完全一致（见 docs/mobile-ui-kit.md D-2）。
  Widget _buildSkeleton() {
    return Skeletonizer(
      enabled: true,
      child: _buildQuestionView(fakePracticeSessionState()),
    );
  }

  Widget _buildErrorView() {
    return AppErrorView(
      message: '请检查网络后重试',
      onRetry: () =>
          ref.read(practiceControllerProvider.notifier).createSession(),
      // 这一屏没有 AppBar：不给第二个出口，失败后只能靠系统返回键（还会弹退出确认）
      secondaryLabel: '返回首页',
      onSecondary: () => context.replace(AppRoutes.dashboard),
    );
  }

  /// 离线提示条：说明本次作答会在恢复网络后自动补交。
  Widget _buildOfflineBanner() {
    return Container(
      width: double.infinity,
      color: context.colors.warningContainer,
      padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 8.h),
      child: Row(
        children: [
          Icon(
            AppIcons.cloudOffOutlined,
            size: 16.sp,
            color: context.colors.warning,
          ),
          SizedBox(width: 8.w),
          Expanded(
            child: Text(
              '离线模式：作答会先存在本地，恢复网络后自动同步',
              style: TextStyle(
                fontSize: 12.sp,
                color: context.colors.warning,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyView() {
    return AppEmptyView(
      emoji: '\u{1F4DA}',
      title: '题库中暂无题目',
      hint: '请稍后再试',
      actionLabel: '返回首页',
      onAction: () => context.replace(AppRoutes.dashboard),
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
                            ? context.colors.warningContainer // 判断题：橙色背景
                            : isMulti
                                ? const Color(0xFFF3E5F5)
                                : const Color(0xFFE3F2FD),
                        borderRadius: BorderRadius.circular(4.r),
                      ),
                      child: Text(
                        isTrueFalse ? '判断题' : isMulti ? '多选题' : '单选题',
                        style: TextStyle(
                          fontSize: 12.sp,
                          fontWeight: FontWeight.w600,
                          color: isTrueFalse
                              ? context.colors.warning // 判断题：橙色文字
                              : isMulti
                                  ? const Color(0xFF7B1FA2)
                                  : const Color(0xFF1976D2),
                        ),
                      ),
                    ),
                    SizedBox(height: 12.h),
                    // 材料题：材料卡在题干上方（无材料时整块不占位）
                    QuestionMaterialCard(
                      material: question.material,
                      materialHtml: question.materialHtml,
                    ),
                    // Question Icon & Text
                    Text('📜', style: TextStyle(fontSize: 40.sp)),
                    SizedBox(height: 16.h),
                    Text(
                      question.content,
                      style: TextStyle(
                        fontSize: 22.sp,
                        fontWeight: FontWeight.w600,
                        height: 1.4,
                        color: context.colors.text,
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
                tooltip: '退出练习',
                onPressed: () async {
                  final shouldPop = await _showExitDialog();
                  if (shouldPop ?? false) {
                    if (context.mounted) {
                      ref.read(practiceControllerProvider.notifier).reset();
                      context.backOrHome();
                    }
                  }
                },
                icon: const Icon(AppIcons.close),
                color: context.colors.text.withValues(alpha: 0.6),
              ),
              Text(
                '刷题模式',
                style: TextStyle(
                  fontSize: 12.sp,
                  fontWeight: FontWeight.w500,
                  color: context.colors.text.withValues(alpha: 0.4),
                  letterSpacing: 2,
                ),
              ),
              IconButton(
                tooltip: '更多操作',
                onPressed: () {},
                icon: const Icon(AppIcons.moreHoriz),
                color: context.colors.text.withValues(alpha: 0.6),
              ),
            ],
          ),
          SizedBox(height: 8.h),
          // Progress Bar
          ClipRRect(
            borderRadius: BorderRadius.circular(4.r),
            child: LinearProgressIndicator(
              value: state.progress,
              backgroundColor: context.colors.text.withValues(alpha: 0.05),
              color: context.colors.text,
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
                  color: context.colors.text.withValues(alpha: 0.4),
                  fontFamily: 'monospace',
                ),
              ),
              Text(
                '${(state.progress * 100).toInt()}%',
                style: TextStyle(
                  fontSize: 10.sp,
                  color: context.colors.text.withValues(alpha: 0.4),
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
            color: context.colors.text.withValues(alpha: 0.5),
          ),
        ),
        Text(
          ' / ',
          style: TextStyle(
            fontSize: 12.sp,
            color: context.colors.text.withValues(alpha: 0.3),
          ),
        ),
        Text(
          '随机模式',
          style: TextStyle(
            fontSize: 12.sp,
            color: context.colors.text.withValues(alpha: 0.5),
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
        color: isCorrect
            ? context.colors.successContainer
            : context.colors.errorContainer,
        borderRadius: BorderRadius.circular(8.r),
        border: Border.all(
          color: isCorrect
              ? context.colors.success.withValues(alpha: 0.4)
              : context.colors.error.withValues(alpha: 0.4),
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
                        ? context.colors.success
                        : context.colors.error,
                  ),
                ),
                SizedBox(height: 8.h),
                Text(
                  '正确答案：$displayAnswer',
                  style: TextStyle(
                    fontSize: 14.sp,
                    fontWeight: FontWeight.w600,
                    color: context.colors.text,
                  ),
                ),
                if (state.isLoading || explanation != null) ...[
                  SizedBox(height: 12.h),
                  Container(
                    width: double.infinity,
                    padding: EdgeInsets.all(12.w),
                    decoration: BoxDecoration(
                      color: context.colors.surface.withValues(alpha: 0.6),
                      borderRadius: BorderRadius.circular(6.r),
                    ),
                    child: state.isLoading
                        ? Row(
                            children: [
                              SizedBox(
                                height: 14.w,
                                width: 14.w,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: context.colors.accent,
                                ),
                              ),
                              SizedBox(width: 8.w),
                              Text(
                                '正在生成解析...',
                                style: TextStyle(
                                  fontSize: 13.sp,
                                  color: context.colors.textSecondary,
                                ),
                              ),
                            ],
                          )
                        : Text(
                            explanation!,
                            style: TextStyle(
                              fontSize: 14.sp,
                              height: 1.6,
                              color: context.colors.text.withValues(alpha: 0.9),
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
                      AppIcons.smartToy,
                      color: context.colors.accent,
                      size: 16.sp,
                    ),
                    label: Text(
                      'AI 第一性原理解读',
                      style: TextStyle(
                        color: context.colors.accent,
                        fontSize: 13.sp,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    style: OutlinedButton.styleFrom(
                      backgroundColor: context.colors.surface,
                      side: BorderSide(
                        color: context.colors.accent,
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
        color: context.colors.surface.withValues(alpha: 0.85),
        border: Border(
          top: BorderSide(color: Colors.black.withValues(alpha: 0.05)),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // 上一题
          _buildNavButton(
            icon: AppIcons.chevronLeft,
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
            icon: AppIcons.chevronRight,
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
              color: context.colors.text.withValues(
                alpha: isEnabled ? 0.05 : 0.02,
              ),
              borderRadius: BorderRadius.circular(12.r),
            ),
            child: Icon(
              icon,
              color: context.colors.text.withValues(
                alpha: isEnabled ? 1 : 0.3,
              ),
            ),
          ),
          SizedBox(height: 4.h),
          Text(
            label,
            style: TextStyle(
              fontSize: 12.sp,
              fontWeight: FontWeight.w500,
              color: context.colors.text.withValues(
                alpha: isEnabled ? 0.6 : 0.3,
              ),
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
            : () => context.replace(AppRoutes.result), // 完成所有题目，跳转结果页
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56.w,
              height: 56.h,
              decoration: BoxDecoration(
                color: context.colors.primary,
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
                hasNext ? AppIcons.arrowForward : AppIcons.check,
                color: context.colors.onPrimary,
                size: 28.sp,
              ),
            ),
            SizedBox(height: 4.h),
            Text(
              hasNext ? '下一题' : '完成',
              style: TextStyle(
                fontSize: 12.sp,
                fontWeight: FontWeight.w600,
                color: context.colors.text,
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
          ? () async {
              // 服务端校验正确答案
              final questionId =
                  ref.read(practiceControllerProvider).currentQuestion?.id;
              await ref
                  .read(practiceControllerProvider.notifier)
                  .submitCurrentAnswer();
              if (!mounted || questionId == null) return;
              // 判分结果只体现在选项卡片的颜色上，读屏用户没有感知 → 主动播报。
              final verdict =
                  ref.read(practiceControllerProvider).results[questionId];
              if (verdict == null) return;
              announceStatus(context, verdict ? '回答正确' : '回答错误');
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
                  ? context.colors.primary
                  : context.colors.primary.withValues(alpha: 0.2),
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
                    child: CircularProgressIndicator(
                      color: context.colors.onPrimary,
                      strokeWidth: 2,
                    ),
                  )
                : Icon(
                    AppIcons.check,
                    color: context.colors.onPrimary,
                    size: 28.sp,
                  ),
          ),
          SizedBox(height: 4.h),
          Text(
            isConfirming ? '判卷中...' : '确认',
            style: TextStyle(
              fontSize: 12.sp,
              fontWeight: FontWeight.w600,
              color: canSubmit
                  ? context.colors.text
                  : context.colors.text.withValues(alpha: 0.4),
            ),
          ),
        ],
      ),
    );
  }
}
