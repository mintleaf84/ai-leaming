import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../core/navigation/app_nav.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_icons.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/question_draft.dart';
import 'draft_providers.dart';

/// AI 草稿列表（§34.3）。
///
/// 一屏只回答两件事：**每份草稿现在到哪一步了**（状态）和**里面有几条**。
/// 识别是服务端异步跑的，所以「识别中」必须能在列表上看到，否则用户会以为
/// 上传失败了反复重拍。
class DraftsScreen extends ConsumerStatefulWidget {
  const DraftsScreen({super.key});

  static const refreshButtonKey = Key('drafts-refresh');

  @override
  ConsumerState<DraftsScreen> createState() => _DraftsScreenState();
}

class _DraftsScreenState extends ConsumerState<DraftsScreen> {
  @override
  void initState() {
    super.initState();
    // 每次进入都重新拉：用户可能在后台等识别结果。
    Future.microtask(() => ref.read(draftListControllerProvider.notifier).load());
  }

  Future<void> _reload() => ref.read(draftListControllerProvider.notifier).load();

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(draftListControllerProvider);
    final colors = context.colors;

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        leading: IconButton(
          tooltip: '返回',
          icon: const Icon(AppIcons.arrowBack),
          onPressed: () => context.backOrHome(),
        ),
        title: const Text('AI 草稿'),
        actions: [
          IconButton(
            key: DraftsScreen.refreshButtonKey,
            tooltip: '刷新',
            onPressed: _reload,
            icon: const Icon(AppIcons.refresh),
          ),
          IconButton(
            tooltip: '手动建题',
            // 草稿流与手动建题是两条入口，放在同一屏不必再回题库页。
            onPressed: () => context.pushDetail(
              AppRoutes.questionNew,
              onReturn: _reload,
            ),
            icon: const Icon(AppIcons.add),
          ),
        ],
      ),
      body: _buildBody(state, colors),
    );
  }

  Widget _buildBody(DraftListState state, AppColors colors) {
    if (state.items.isEmpty && state.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state.items.isEmpty && state.error != null) {
      return AppErrorView(
        message: state.error!,
        onRetry: _reload,
        secondaryLabel: '返回',
        onSecondary: () => context.backOrHome(),
      );
    }

    return RefreshIndicator(
      onRefresh: _reload,
      color: colors.accent,
      child: state.items.isEmpty
          ? ListView(
              // 空态也要可下拉刷新，否则「刚拍完还没入库」时刷不出来。
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                SizedBox(height: 120.h),
                const AppEmptyView(
                  emoji: '📷',
                  title: '暂无草稿',
                  hint: '拍照识别后，识别结果会先出现在这里，逐条校对后再入库',
                ),
              ],
            )
          : ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 12.h),
              itemCount: state.items.length,
              separatorBuilder: (context, index) => SizedBox(height: 12.h),
              itemBuilder: (context, index) => _DraftCard(
                draft: state.items[index],
                // 从校对页返回时列表要重新拉：状态可能已经从 ready 变成 confirmed。
                onReturn: _reload,
              ),
            ),
    );
  }
}

class _DraftCard extends StatelessWidget {
  const _DraftCard({required this.draft, required this.onReturn});

  final QuestionDraftSummary draft;
  final VoidCallback onReturn;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final theme = Theme.of(context);

    return Container(
      decoration: BoxDecoration(
        color: theme.cardColor,
        borderRadius: BorderRadius.circular(8.r),
        border: Border.all(color: theme.dividerColor),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(8.r),
          onTap: () => context.pushDetail(
            AppRoutes.draftDetail(draft.id),
            onReturn: onReturn,
          ),
          child: Padding(
            padding: EdgeInsets.all(16.w),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Wrap(
                      crossAxisAlignment: WrapCrossAlignment.center,
                      spacing: 8.w,
                      children: [
                        _StatusChip(status: draft.status),
                        Text(
                          draft.sourceLabel,
                          style: TextStyle(
                            fontSize: 12.sp,
                            color: colors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                    const Spacer(),
                    Text(
                      '共 ${draft.itemCount} 条',
                      style: TextStyle(
                        fontSize: 13.sp,
                        fontWeight: FontWeight.w600,
                        color: colors.text,
                      ),
                    ),
                  ],
                ),
                SizedBox(height: 8.h),
                Text(
                  _subtitle,
                  style: TextStyle(fontSize: 13.sp, color: colors.textSecondary),
                ),
                if (draft.createdAt.isNotEmpty) ...[
                  SizedBox(height: 4.h),
                  Text(
                    draft.createdAt,
                    style: TextStyle(
                      fontSize: 11.sp,
                      color: colors.textSecondary.withValues(alpha: 0.7),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  String get _subtitle {
    switch (draft.status) {
      case DraftStatus.failed:
        return '识别失败${draft.errorCode == null ? '' : '（${draft.errorCode}）'}，点开可重试';
      case DraftStatus.analyzing:
        return '正在识别，可以稍后回来查看';
      case DraftStatus.ready:
        return draft.confirmedCount > 0
            ? '待校对 · 已确认 ${draft.confirmedCount} 条'
            : '待校对，点开逐条确认';
      case DraftStatus.confirmed:
        return '已入库 ${draft.confirmedCount > 0 ? draft.confirmedCount : draft.itemCount} 条';
      case DraftStatus.discarded:
        return '已丢弃';
      case DraftStatus.captured:
        return '已上传，等待识别';
      case DraftStatus.unknown:
        return '状态未知，点开查看';
    }
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final DraftStatus status;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final (background, foreground) = _palette(colors);
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 2.h),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(4.r),
      ),
      child: Text(
        status.label,
        style: TextStyle(
          fontSize: 12.sp,
          fontWeight: FontWeight.w600,
          color: foreground,
        ),
      ),
    );
  }

  /// 状态颜色只表达「能不能继续」：能继续=hue 强调色，出错=错误色，
  /// 其余用次要文字色，避免一屏出现五种高饱和色块。
  (Color, Color) _palette(AppColors colors) {
    return switch (status) {
      DraftStatus.ready => (colors.accentContainer, colors.accent),
      DraftStatus.confirmed => (colors.successContainer, colors.onSuccess),
      DraftStatus.failed => (colors.errorContainer, colors.onError),
      DraftStatus.analyzing || DraftStatus.captured => (
        colors.warningContainer,
        colors.warning,
      ),
      _ => (colors.surfaceAlt, colors.textSecondary),
    };
  }
}
