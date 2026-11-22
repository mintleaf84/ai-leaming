import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:skeletonizer/skeletonizer.dart';

import '../../../core/a11y/status_announcer.dart';
import '../../../core/navigation/app_nav.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_icons.dart';
import '../../../shared/skeletons/skeleton_fakes.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/practice_resume.dart';
import 'practice_provider.dart';
import 'widgets/practice_bottom_nav.dart';
import 'widgets/practice_question_content.dart';
import 'widgets/practice_question_header.dart';

/// 练习屏。
///
/// 顶层骨架 / 错误 / 空态、判分播报与退出确认留在这里；题面区、顶部进度条与
/// 底部导航都在 `widgets/` 下（纯搬移，参数显式传入）。
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
    // 带 sessionId 时表示「从错题本进来 / 首页继续上次练习」，复用已建好的会话，
    // 不再新建；带 startIndex 时直接落到断点那一题（见 practice_resume.dart）。
    final sessionId = widget.config?['sessionId'] as String?;
    final startIndex = (widget.config?['startIndex'] as int?) ?? 0;
    // 断点里的已答记录（题号 + 对错）：恢复时回填结果、定位第一道未答题。
    final answered =
        (widget.config?['answered'] as List<ResumeAnswer>?) ??
        const <ResumeAnswer>[];
    // 旧格式断点的连续已答前缀（见 practice_resume.dart）：不传的话恢复即
    // 落盘会把进度写回 0。
    final legacyAnswered = (widget.config?['legacyAnswered'] as int?) ?? 0;
    final limit = (widget.config?['limit'] as int?) ?? 10;
    // 配置里没有模式就**别猜**：给 null，由会话自己（服务端 `practiceMode` /
    // 断点里的值）决定，只有新建会话时才用平台默认的 random。
    final mode = widget.config?['mode'] as String?;
    Future.microtask(() {
      final controller = ref.read(practiceControllerProvider.notifier);
      if (sessionId != null && sessionId.isNotEmpty) {
        controller.loadSession(
          sessionId,
          startIndex: startIndex,
          answered: answered,
          legacyAnswered: legacyAnswered,
          mode: mode,
        );
      } else {
        controller.createSession(limit: limit, mode: mode ?? 'random');
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

  /// 退出练习：确认后丢掉本场状态再离开（配置页还在栈里）。
  Future<void> _confirmExit() async {
    final shouldPop = await _showExitDialog();
    if (shouldPop ?? false) {
      if (mounted) {
        // 退出前丢掉本场状态：配置页还在栈里，不清空的话"再开一场"会与旧会话竞争
        ref.read(practiceControllerProvider.notifier).reset();
        context.backOrHome();
      }
    }
  }

  /// 提交当前作答，并把判分结果播报给读屏用户。
  ///
  /// 判分结果只体现在选项卡片的颜色上，读屏用户没有感知 → 主动播报。
  Future<void> _submitCurrentAnswer() async {
    // 服务端校验正确答案
    final questionId =
        ref.read(practiceControllerProvider).currentQuestion?.id;
    await ref.read(practiceControllerProvider.notifier).submitCurrentAnswer();
    if (!mounted || questionId == null) return;
    final verdict = ref.read(practiceControllerProvider).results[questionId];
    if (verdict == null) return;
    announceStatus(context, verdict ? '回答正确' : '回答错误');
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

    return Stack(
      children: [
        Column(
          children: [
            // Header
            PracticeQuestionHeader(state: state, onExit: _confirmExit),
            // Question Content
            Expanded(child: PracticeQuestionContent(state: state)),
          ],
        ),
        // Bottom Navigation
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: PracticeBottomNav(
            state: state,
            selectedAnswers: selectedAnswers,
            result: result,
            onConfirm: _submitCurrentAnswer,
          ),
        ),
      ],
    );
  }
}
