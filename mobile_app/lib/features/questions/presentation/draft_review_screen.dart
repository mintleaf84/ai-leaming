import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../core/navigation/app_nav.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_icons.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/question_draft.dart';
import 'draft_providers.dart';
import 'widgets/draft_review_banner.dart';
import 'widgets/draft_review_item_editor.dart';
import 'widgets/draft_review_keys.dart';

/// 校对页的测试 Key 从这里继续可见：调用方（含测试）只 import 本文件即可。
export 'widgets/draft_review_keys.dart';

/// AI 草稿校对页（§34.3）。
///
/// 四种状态各有各的界面，**没有一种会让人卡住**：
/// - `analyzing` / `captured`：说明还在识别 + 「刷新状态」（离开再回来也会重新 GET）；
/// - `failed`：显示 `error_code` + 「重新识别」；
/// - `ready` / `confirmed`：逐条编辑/删除/勾选确认，底部一次性入库。
///
/// 编辑是**逐条显式保存**的：草稿内容来自 AI，自动保存会把「改到一半的错题」
/// 写进服务端，用户再打开时已经分不清哪条是 AI 给的、哪条是自己改的。
///
/// 单条编辑器与页内提示条已搬到 `widgets/`（纯搬移，参数显式传入）；
/// 本文件只剩状态分派与底部确认栏。
class DraftReviewScreen extends ConsumerWidget {
  const DraftReviewScreen({super.key, required this.draftId});

  final String draftId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final provider = draftReviewControllerProvider(draftId);
    final state = ref.watch(provider);
    final controller = ref.read(provider.notifier);
    final colors = context.colors;
    final draft = state.draft;

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        leading: IconButton(
          tooltip: '返回',
          icon: const Icon(AppIcons.arrowBack),
          onPressed: () => context.backOrHome(fallback: AppRoutes.drafts),
        ),
        title: const Text('草稿校对'),
        actions: [
          if (draft != null)
            IconButton(
              key: DraftReviewKeys.reloadStatus,
              tooltip: '刷新状态',
              onPressed: state.isLoading ? null : controller.load,
              icon: const Icon(AppIcons.refresh),
            ),
          PopupMenuButton<String>(
            key: DraftReviewKeys.discard,
            tooltip: '更多',
            onSelected: (value) async {
              if (value != 'discard') return;
              final discarded = await controller.discard();
              if (context.mounted && discarded) {
                context.backOrHome(fallback: AppRoutes.drafts);
              }
            },
            itemBuilder: (context) => const [
              PopupMenuItem<String>(value: 'discard', child: Text('丢弃这份草稿')),
            ],
          ),
        ],
      ),
      body: SafeArea(child: _buildBody(context, state, controller, colors)),
    );
  }

  Widget _buildBody(
    BuildContext context,
    DraftReviewState state,
    DraftReviewController controller,
    AppColors colors,
  ) {
    final draft = state.draft;

    if (draft == null) {
      if (state.isLoading) {
        return const Center(child: CircularProgressIndicator());
      }
      return AppErrorView(
        message: state.error ?? '找不到这份草稿',
        onRetry: controller.load,
        secondaryLabel: '返回草稿列表',
        onSecondary: () => context.backOrHome(fallback: AppRoutes.drafts),
      );
    }

    final banners = <Widget>[
      if (state.confirmResult != null)
        DraftBanner(
          background: colors.successContainer,
          foreground: colors.onSuccess,
          icon: AppIcons.checkCircleOutline,
          message: state.confirmResult!.summary,
        ),
      if (state.actionError != null)
        DraftBanner(
          background: colors.errorContainer,
          foreground: colors.onError,
          icon: AppIcons.errorOutline,
          message: state.actionError!,
        ),
    ];

    switch (draft.status) {
      case DraftStatus.analyzing:
      case DraftStatus.captured:
        return ListView(
          padding: EdgeInsets.all(16.w),
          children: [
            ...banners,
            SizedBox(height: 40.h),
            Center(
              child: Column(
                children: [
                  SizedBox(
                    width: 28.sp,
                    height: 28.sp,
                    child: const CircularProgressIndicator(strokeWidth: 3),
                  ),
                  SizedBox(height: 16.h),
                  Text(
                    'AI 正在识别这部分内容',
                    style: TextStyle(fontSize: 15.sp, color: colors.text),
                  ),
                  SizedBox(height: 8.h),
                  Text(
                    '可以先离开，稍后回来自动重新加载',
                    style: TextStyle(
                      fontSize: 13.sp,
                      color: colors.textSecondary,
                    ),
                  ),
                  SizedBox(height: 16.h),
                  OutlinedButton(
                    onPressed: controller.load,
                    child: const Text('刷新状态'),
                  ),
                ],
              ),
            ),
          ],
        );

      case DraftStatus.failed:
        return ListView(
          padding: EdgeInsets.all(16.w),
          children: [
            ...banners,
            SizedBox(height: 40.h),
            AppErrorView(
              title: '识别失败',
              message: draft.errorCode == null
                  ? 'AI 没能识别出题目，可以重新尝一次'
                  : '识别失败（${draft.errorCode}），可以重新尝一次',
              onRetry: controller.retryAnalyze,
            ),
          ],
        );

      case DraftStatus.discarded:
        return Center(
          child: AppEmptyView(
            emoji: '🗑️',
            title: '这份草稿已丢弃',
            hint: '回到列表看看其他草稿',
            actionLabel: '返回草稿列表',
            onAction: () => context.backOrHome(fallback: AppRoutes.drafts),
          ),
        );

      case DraftStatus.ready:
      case DraftStatus.confirmed:
      case DraftStatus.unknown:
        break;
    }

    if (draft.items.isEmpty) {
      return Column(
        children: [
          ...banners,
          const Expanded(
            child: AppEmptyView(
              emoji: '📄',
              title: '没有识别出题目',
              hint: '可以丢弃这份草稿后重新拍摄',
            ),
          ),
        ],
      );
    }

    return Column(
      children: [
        ...banners,
        Expanded(
          child: ListView.separated(
            padding: EdgeInsets.fromLTRB(16.w, 12.h, 16.w, 12.h),
            itemCount: draft.items.length,
            separatorBuilder: (context, index) => SizedBox(height: 12.h),
            itemBuilder: (context, index) {
              final item = draft.items[index];
              return DraftItemEditor(
                key: DraftReviewKeys.itemCard(item.idx),
                item: item,
                busy: state.savingIdx == item.idx || state.isConfirming,
                onSave: (edited) => controller.saveItem(edited),
                onDelete: () => controller.deleteItem(item.idx),
                onToggleConfirmed: (confirmed) =>
                    controller.toggleConfirmed(item, confirmed),
              );
            },
          ),
        ),
        _buildConfirmBar(context, draft, state, controller, colors),
      ],
    );
  }

  Widget _buildConfirmBar(
    BuildContext context,
    QuestionDraft draft,
    DraftReviewState state,
    DraftReviewController controller,
    AppColors colors,
  ) {
    final confirmed = draft.confirmedCount;

    return Container(
      padding: EdgeInsets.fromLTRB(16.w, 10.h, 16.w, 14.h),
      decoration: BoxDecoration(
        color: Theme.of(context).scaffoldBackgroundColor,
        border: Border(top: BorderSide(color: colors.border)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              confirmed > 0 ? '已勾选 $confirmed 条待入库' : '先勾选要入库的条目',
              style: TextStyle(fontSize: 13.sp, color: colors.textSecondary),
            ),
          ),
          SizedBox(width: 12.w),
          SizedBox(
            height: 44.h,
            child: FilledButton(
              key: DraftReviewKeys.confirmAll,
              onPressed: confirmed == 0 || state.isBusy
                  ? null
                  : controller.confirmAll,
              style: FilledButton.styleFrom(
                backgroundColor: colors.accent,
                foregroundColor: colors.onAccent,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8.r),
                ),
              ),
              child: state.isConfirming
                  ? SizedBox(
                      width: 18.sp,
                      height: 18.sp,
                      child: const CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text('全部确认入库', style: TextStyle(fontSize: 14.sp)),
            ),
          ),
        ],
      ),
    );
  }
}
