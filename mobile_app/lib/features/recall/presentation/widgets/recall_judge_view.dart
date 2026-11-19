import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../domain/recall_card.dart';
import '../../domain/recall_review.dart';
import 'recall_cloze_prompt.dart';
import 'recall_layout.dart';
import 'recall_result_card.dart';
import 'recall_tones.dart';

/// 判分屏：逐条 / 逐空的「写到 / 没写到」+ 改判 + 提交后的结论。
///
/// 只做展示与回调：预判（[algoVerdicts]）与最终判定（[verdicts]）都由状态机持有，
/// 本组件不推导任何 verdict——推导分散两处，改判标记就会和上送内容对不上。
///
/// 三个刻意的细节：
/// - 改判标记挂在**被点的那一条**上（不是整屏统一提示）；
/// - 提交中 / 已出结论 / 结果未知三种情形一律禁点：请求里带的是点击那一刻的判定，
///   再改只会让界面与已落库的结论打架；
/// - 不改颜色的文字：结论靠图标形状 + 底色表达，正文始终是高对比的 `onSurface`。
class RecallJudgeView extends StatelessWidget {
  const RecallJudgeView({
    super.key,
    required this.card,
    required this.presented,
    required this.algoVerdicts,
    required this.verdicts,
    required this.segments,
    required this.onToggle,
    this.result,
    this.submitting = false,
    this.retryLocked = false,
    this.submitError,
    this.resultKey,
  });

  final RecallCard card;

  /// 本次呈现的卡内下标（顺序即屏上顺序）。
  final List<int> presented;

  /// 本机预判：改判标记以它为基准。
  final List<RecallVerdict> algoVerdicts;

  /// 用户改判后的最终判定，与 [presented] 同序。
  final List<RecallVerdict> verdicts;

  /// 填空卡：作答按空切开后的文本，与 [presented] 同序。
  final List<String> segments;

  final ValueChanged<int> onToggle;
  final RecallReviewResult? result;
  final bool submitting;
  final bool retryLocked;
  final String? submitError;

  /// 结论块的位置：判分屏可能比一屏高，状态机据此把它滚进视野。
  final GlobalKey? resultKey;

  bool get _locked => submitting || retryLocked || result != null;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Padding(
      padding: EdgeInsets.fromLTRB(16.w, 0, 16.w, 16.h),
      child: RecallCardShell(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              card.deckTitle ?? '回忆卡',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12.sp,
                color: scheme.onSurface.withValues(alpha: 0.55),
              ),
            ),
            if (card.isRetest) ...[
              SizedBox(height: 6.h),
              Text(
                '下面 ${presented.length} 条就是上次没想起来的',
                style: TextStyle(
                  fontSize: 12.sp,
                  color: scheme.onSurface.withValues(alpha: 0.6),
                ),
              ),
            ],
            SizedBox(height: 10.h),
            if (card.kind.isCloze)
              RecallClozePrompt(
                prompt: card.prompt,
                presented: presented,
                fontSize: 15,
                compact: true,
              )
            else
              Text(
                card.prompt,
                style: theme.textTheme.bodyLarge?.copyWith(
                  fontSize: 15.sp,
                  height: 1.55,
                  color: scheme.onSurface,
                ),
              ),
            SizedBox(height: 14.h),
            if (card.kind.isCloze)
              Column(children: _buildClozeRows(context))
            else
              Column(children: _buildListRows(context)),
            if (result == null && card.kind != RecallCardKind.cloze) ...[
              SizedBox(height: 10.h),
              Text(
                retryLocked
                    ? '判定已经锁住了：重试会用同一份作答重发，不会多记一次。'
                    // 按形状而不是颜色指路：色弱用户看不出"偏黄"，
                    // 但能看出"空圈"和"对勾"的区别。
                    : '带空圈的条目是没写到的，点一下可以改成「已写」。',
                style: TextStyle(
                  fontSize: 12.sp,
                  height: 1.5,
                  color: scheme.onSurface.withValues(alpha: 0.55),
                ),
              ),
            ],
            if (submitError != null && result == null) ...[
              SizedBox(height: 12.h),
              _SubmitFailureNotice(message: submitError!),
            ],
            if (result != null) ...[
              SizedBox(height: 14.h),
              RecallResultCard(
                key: resultKey,
                result: result!,
                pendingItems: result!.pendingItems,
                dense: true,
              ),
            ],
          ],
        ),
      ),
    );
  }

  List<Widget> _buildListRows(BuildContext context) {
    final rows = <Widget>[];
    final items = card.items ?? const <RecallListItem>[];

    for (var position = 0; position < presented.length; position++) {
      final cardIndex = presented[position];
      if (cardIndex < 0 || cardIndex >= items.length) continue;
      final item = items[cardIndex];
      final verdict = position < verdicts.length
          ? verdicts[position]
          : RecallVerdict.miss;
      final changed = position < algoVerdicts.length
          ? algoVerdicts[position] != verdict
          : false;

      rows.add(
        Padding(
          padding: EdgeInsets.only(bottom: 8.h),
          child: _VerdictRow(
            onTap: _locked ? null : () => onToggle(position),
            ok: verdict.isOk,
            changed: changed,
            child: Text(
              item.text,
              style: TextStyle(
                fontSize: 15.sp,
                height: 1.55,
                color: Theme.of(context).colorScheme.onSurface,
              ),
            ),
          ),
        ),
      );
    }
    return rows;
  }

  List<Widget> _buildClozeRows(BuildContext context) {
    final rows = <Widget>[];
    final blanks = card.blanks ?? const <RecallBlank>[];
    final secondary = Theme.of(
      context,
    ).colorScheme.onSurface.withValues(alpha: 0.6);

    for (var position = 0; position < presented.length; position++) {
      final cardIndex = presented[position];
      if (cardIndex < 0 || cardIndex >= blanks.length) continue;
      final answers = blanks[cardIndex].answers;
      final written = position < segments.length ? segments[position] : '';
      final verdict = position < verdicts.length
          ? verdicts[position]
          : RecallVerdict.miss;
      final changed = position < algoVerdicts.length
          ? algoVerdicts[position] != verdict
          : false;

      rows.add(
        Padding(
          padding: EdgeInsets.only(bottom: 8.h),
          child: _VerdictRow(
            onTap: _locked ? null : () => onToggle(position),
            ok: verdict.isOk,
            changed: changed,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '第 ${position + 1} 空',
                  style: TextStyle(
                    fontSize: 11.sp,
                    color: secondary,
                    fontFeatures: recallTabularFigures,
                  ),
                ),
                SizedBox(height: 2.h),
                Text(
                  written.isEmpty ? '（空着）' : written,
                  style: TextStyle(
                    fontSize: 15.sp,
                    height: 1.5,
                    color: written.isEmpty
                        ? secondary
                        : Theme.of(context).colorScheme.onSurface,
                  ),
                ),
                if (!verdict.isOk && answers.isNotEmpty) ...[
                  SizedBox(height: 4.h),
                  Text(
                    '参考答案：${answers.join(' / ')}',
                    style: TextStyle(
                      fontSize: 12.sp,
                      height: 1.5,
                      color: secondary,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      );
    }
    return rows;
  }
}

/// 一条可改判的结果行：底色 + 图标表达判定，正文保持高对比。
class _VerdictRow extends StatelessWidget {
  const _VerdictRow({
    required this.child,
    required this.ok,
    required this.changed,
    required this.onTap,
  });

  final Widget child;
  final bool ok;
  final bool changed;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final tone = RecallTone.of(context, ok: ok);

    return Material(
      color: tone.background,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12.r),
        side: BorderSide(color: tone.border),
      ),
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: 48.h),
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 10.h),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: EdgeInsets.only(top: 2.h),
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 180),
                    transitionBuilder: (child, animation) =>
                        ScaleTransition(scale: animation, child: child),
                    child: Icon(
                      ok ? Icons.check_circle : Icons.radio_button_unchecked,
                      key: ValueKey<bool>(ok),
                      size: 19.sp,
                      color: tone.foreground,
                      semanticLabel: ok ? '已写到' : '没写到',
                    ),
                  ),
                ),
                SizedBox(width: 10.w),
                Expanded(child: child),
                if (changed) ...[
                  SizedBox(width: 8.w),
                  Padding(
                    padding: EdgeInsets.only(top: 2.h),
                    child: Text(
                      '已改判',
                      maxLines: 1,
                      style: TextStyle(
                        fontSize: 11.sp,
                        color: scheme.onSurface.withValues(alpha: 0.55),
                      ),
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
}

/// 提交失败（结果未知）的说明块。
///
/// 文案必须先说"没记下来"、再说"怎么办"：用户此刻最怕的是"到底记没记上"，
/// 而答案（重试只重放同一份载荷）恰好是可以承诺的。
class _SubmitFailureNotice extends StatelessWidget {
  const _SubmitFailureNotice({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 10.h),
      decoration: BoxDecoration(
        color: scheme.error.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(12.r),
        border: Border.all(color: scheme.error.withValues(alpha: 0.24)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: EdgeInsets.only(top: 1.h),
            child: Icon(
              Icons.cloud_off_outlined,
              size: 16.sp,
              color: scheme.error,
            ),
          ),
          SizedBox(width: 8.w),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '这次没有记下来',
                  style: TextStyle(
                    fontSize: 13.sp,
                    fontWeight: FontWeight.w600,
                    color: scheme.onSurface,
                  ),
                ),
                SizedBox(height: 2.h),
                Text(
                  message,
                  style: TextStyle(
                    fontSize: 12.sp,
                    height: 1.5,
                    color: scheme.onSurface.withValues(alpha: 0.68),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
