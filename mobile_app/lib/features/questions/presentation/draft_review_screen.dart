import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../core/navigation/app_nav.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_icons.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/question_draft.dart';
import '../domain/question_form.dart';
import 'draft_providers.dart';

/// 校对页里可被测试稳定定位的控件。
///
/// 放在独立类而不是写在 private widget 里：测试只 import 这一个文件，
/// 不需要为了拿 Key 去 import 私有类型。
abstract final class DraftReviewKeys {
  static Key itemCard(int idx) => Key('draft-item-$idx');
  static Key itemContent(int idx) => Key('draft-item-$idx-content');
  static Key itemAnswer(int idx) => Key('draft-item-$idx-answer');
  static Key itemSave(int idx) => Key('draft-item-$idx-save');
  static Key itemDelete(int idx) => Key('draft-item-$idx-delete');
  static Key itemConfirmed(int idx) => Key('draft-item-$idx-confirmed');

  static const confirmAll = Key('draft-confirm-all');
  static const retryAnalyze = Key('draft-retry-analyze');
  static const reloadStatus = Key('draft-reload-status');
  static const discard = Key('draft-discard');
}

/// AI 草稿校对页（§34.3）。
///
/// 四种状态各有各的界面，**没有一种会让人卡住**：
/// - `analyzing` / `captured`：说明还在识别 + 「刷新状态」（离开再回来也会重新 GET）；
/// - `failed`：显示 `error_code` + 「重新识别」；
/// - `ready` / `confirmed`：逐条编辑/删除/勾选确认，底部一次性入库。
///
/// 编辑是**逐条显式保存**的：草稿内容来自 AI，自动保存会把「改到一半的错题」
/// 写进服务端，用户再打开时已经分不清哪条是 AI 给的、哪条是自己改的。
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
        _Banner(
          background: colors.successContainer,
          foreground: colors.onSuccess,
          icon: AppIcons.checkCircleOutline,
          message: state.confirmResult!.summary,
        ),
      if (state.actionError != null)
        _Banner(
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
              return _DraftItemEditor(
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

/// 一条识别结果：可编辑、可删除、可勾选确认。
class _DraftItemEditor extends StatefulWidget {
  const _DraftItemEditor({
    super.key,
    required this.item,
    required this.busy,
    required this.onSave,
    required this.onDelete,
    required this.onToggleConfirmed,
  });

  final QuestionDraftItem item;
  final bool busy;
  final ValueChanged<QuestionDraftItem> onSave;
  final VoidCallback onDelete;
  final ValueChanged<bool> onToggleConfirmed;

  @override
  State<_DraftItemEditor> createState() => _DraftItemEditorState();
}

class _DraftItemEditorState extends State<_DraftItemEditor> {
  late final TextEditingController _content;
  late final TextEditingController _options;
  late final TextEditingController _answer;
  late final TextEditingController _explanation;
  late QuestionType _type;
  late bool _confirmed;

  @override
  void initState() {
    super.initState();
    _content = TextEditingController(text: widget.item.content);
    _options = TextEditingController(text: widget.item.options.join('\n'));
    _answer = TextEditingController(text: widget.item.answer);
    _explanation = TextEditingController(text: widget.item.explanation);
    _type = QuestionType.fromWire(widget.item.type);
    _confirmed = widget.item.confirmed;
  }

  @override
  void dispose() {
    _content.dispose();
    _options.dispose();
    _answer.dispose();
    _explanation.dispose();
    super.dispose();
  }

  /// 用输入框里的当前值拼回一条草稿项。
  ///
  /// 选项按「每行一个」解析：AI 返回的是列表，但手机上逐行编辑比维护
  /// N 个动态输入框更稳（也不会出现删行时焦点乱跳）。
  QuestionDraftItem get _edited {
    return widget.item.copyWith(
      content: _content.text,
      options: _options.text
          .split('\n')
          .map((line) => line.trim())
          .where((line) => line.isNotEmpty)
          .toList(),
      answer: _answer.text,
      explanation: _explanation.text,
      type: _type.wire,
      confirmed: _confirmed,
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final theme = Theme.of(context);

    return Container(
      decoration: BoxDecoration(
        color: theme.cardColor,
        borderRadius: BorderRadius.circular(8.r),
        border: Border.all(
          color: _confirmed ? colors.accent : theme.dividerColor,
        ),
      ),
      padding: EdgeInsets.all(12.w),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                '第 ${widget.item.idx + 1} 条',
                style: TextStyle(
                  fontSize: 13.sp,
                  fontWeight: FontWeight.w600,
                  color: colors.text,
                ),
              ),
              SizedBox(width: 8.w),
              Text(
                _type.label,
                style: TextStyle(fontSize: 12.sp, color: colors.textSecondary),
              ),
              const Spacer(),
              Checkbox(
                key: DraftReviewKeys.itemConfirmed(widget.item.idx),
                value: _confirmed,
                onChanged: widget.busy
                    ? null
                    : (value) {
                        final next = value ?? false;
                        setState(() => _confirmed = next);
                        widget.onToggleConfirmed(next);
                      },
              ),
              Text(
                '确认入库',
                style: TextStyle(fontSize: 12.sp, color: colors.textSecondary),
              ),
            ],
          ),
          SizedBox(height: 8.h),
          TextField(
            key: DraftReviewKeys.itemContent(widget.item.idx),
            controller: _content,
            maxLines: 4,
            style: TextStyle(fontSize: 14.sp, color: colors.text),
            decoration: _decoration(colors, '题干'),
          ),
          SizedBox(height: 8.h),
          TextField(
            controller: _options,
            maxLines: 4,
            style: TextStyle(fontSize: 14.sp, color: colors.text),
            decoration: _decoration(colors, '选项（每行一个）'),
          ),
          SizedBox(height: 8.h),
          TextField(
            key: DraftReviewKeys.itemAnswer(widget.item.idx),
            controller: _answer,
            style: TextStyle(fontSize: 14.sp, color: colors.text),
            decoration: _decoration(colors, '答案'),
          ),
          SizedBox(height: 8.h),
          TextField(
            controller: _explanation,
            maxLines: 3,
            style: TextStyle(fontSize: 14.sp, color: colors.text),
            decoration: _decoration(colors, '解析'),
          ),
          SizedBox(height: 4.h),
          Row(
            children: [
              TextButton.icon(
                key: DraftReviewKeys.itemDelete(widget.item.idx),
                onPressed: widget.busy ? null : widget.onDelete,
                icon: const Icon(AppIcons.deleteOutline, size: 18),
                label: const Text('删除'),
              ),
              const Spacer(),
              TextButton(
                key: DraftReviewKeys.itemSave(widget.item.idx),
                onPressed: widget.busy
                    ? null
                    : () => widget.onSave(_edited),
                child: const Text('保存本条'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  InputDecoration _decoration(AppColors colors, String label) {
    return InputDecoration(
      labelText: label,
      isDense: true,
      labelStyle: TextStyle(fontSize: 12.sp),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(6.r)),
      contentPadding: EdgeInsets.symmetric(horizontal: 10.w, vertical: 10.h),
    );
  }
}

/// 页内的成功/失败提示条（不留 SnackBar 的 4 秒，确认结果要一直看得见）。
class _Banner extends StatelessWidget {
  const _Banner({
    required this.background,
    required this.foreground,
    required this.icon,
    required this.message,
  });

  final Color background;
  final Color foreground;
  final IconData icon;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: EdgeInsets.fromLTRB(16.w, 8.h, 16.w, 0),
      padding: EdgeInsets.all(12.w),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(8.r),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18.sp, color: foreground),
          SizedBox(width: 8.w),
          Expanded(
            child: Text(
              message,
              style: TextStyle(fontSize: 13.sp, color: foreground),
            ),
          ),
        ],
      ),
    );
  }
}
