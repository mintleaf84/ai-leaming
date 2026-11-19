import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../domain/recall_card.dart';
import 'recall_cloze_prompt.dart';
import 'recall_layout.dart';

/// 作答屏：题干 + 输入框（归档入口在题干右上角）。
///
/// 整张卡有自己的 `TextEditingController`，并由调用方用 `ValueKey(cardId)` 换实例：
/// 换卡就换输入框，不需要在换卡时手工清空文本（手工清空最容易漏，漏了就出现
/// "新卡带着上一张的答案"）。
class RecallQuestionView extends StatefulWidget {
  const RecallQuestionView({
    super.key,
    required this.card,
    required this.initialTyped,
    required this.onTypedChanged,
    required this.onArchive,
    this.archiving = false,
  });

  final RecallCard card;

  /// 进入这张卡时的作答原文（正常为空；返回上一屏再回来也不会丢）。
  final String initialTyped;

  final ValueChanged<String> onTypedChanged;

  /// 归档入口（时间成本高，二次确认在调用方做）。
  final VoidCallback onArchive;

  final bool archiving;

  @override
  State<RecallQuestionView> createState() => _RecallQuestionViewState();
}

class _RecallQuestionViewState extends State<RecallQuestionView> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialTyped);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String get _hint {
    if (widget.card.kind.isCloze) {
      return widget.card.presentedIndexes.length > 1
          ? '按空位序号一行写一个空，只写关键词也可以'
          : '写你记得的答案，只写关键词也可以';
    }
    return '写下你记得的要点，关键词也可以';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final card = widget.card;
    final presented = card.presentedIndexes;
    final retest = card.isRetest;

    return Padding(
      padding: EdgeInsets.fromLTRB(16.w, 0, 16.w, 16.h),
      child: RecallCardShell(
        padding: EdgeInsets.fromLTRB(16.w, 8.h, 16.w, 16.h),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 卡组名 + 归档：归档是可撤销的写操作，但仍然"很贵"，
            // 所以只给图标入口，二次确认放在调用方的对话框里。
            Row(
              children: [
                Expanded(
                  child: Text(
                    card.deckTitle ?? '回忆卡',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 12.sp,
                      color: scheme.onSurface.withValues(alpha: 0.55),
                    ),
                  ),
                ),
                IconButton(
                  onPressed: widget.archiving ? null : widget.onArchive,
                  tooltip: '归档这张卡',
                  iconSize: 20.sp,
                  constraints: BoxConstraints(minWidth: 48.w, minHeight: 48.h),
                  icon: Icon(
                    Icons.archive_outlined,
                    color: scheme.onSurface.withValues(alpha: 0.45),
                  ),
                ),
              ],
            ),
            if (retest) ...[
              // 中性小标签而不是强调色：这句话是"这一屏是什么"，不是待办提醒，
              // 染成主色会和题干抢注意力，深色模式下还会掉到 3:1 以下。
              Align(
                alignment: Alignment.centerLeft,
                child: Container(
                  padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 3.h),
                  decoration: BoxDecoration(
                    color: scheme.onSurface.withValues(alpha: 0.05),
                    borderRadius: BorderRadius.circular(8.r),
                  ),
                  child: Text(
                    '只重测上次没想起来的 ${presented.length} 条',
                    style: TextStyle(
                      fontSize: 11.sp,
                      height: 1.4,
                      color: scheme.onSurface.withValues(alpha: 0.7),
                    ),
                  ),
                ),
              ),
              SizedBox(height: 10.h),
            ],
            if (card.kind.isCloze)
              RecallClozePrompt(prompt: card.prompt, presented: presented)
            else
              Text(
                card.prompt,
                style: theme.textTheme.bodyLarge?.copyWith(
                  fontSize: 19.sp,
                  height: 1.6,
                  letterSpacing: 0.2,
                  color: scheme.onSurface,
                ),
              ),
            SizedBox(height: 16.h),
            TextField(
              controller: _controller,
              onChanged: widget.onTypedChanged,
              minLines: 6,
              maxLines: 10,
              keyboardType: TextInputType.multiline,
              textInputAction: TextInputAction.newline,
              textAlignVertical: TextAlignVertical.top,
              style: TextStyle(
                fontSize: 16.sp,
                height: 1.6,
                color: scheme.onSurface,
              ),
              cursorColor: scheme.secondary,
              decoration: InputDecoration(
                hintText: _hint,
                hintStyle: TextStyle(
                  fontSize: 14.sp,
                  height: 1.6,
                  color: scheme.onSurface.withValues(alpha: 0.38),
                ),
                filled: true,
                fillColor: scheme.onSurface.withValues(alpha: 0.03),
                contentPadding: EdgeInsets.symmetric(
                  horizontal: 12.w,
                  vertical: 12.h,
                ),
                border: _border(theme.dividerColor),
                enabledBorder: _border(theme.dividerColor),
                focusedBorder: _border(
                  scheme.secondary.withValues(alpha: 0.55),
                  width: 1.4,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  OutlineInputBorder _border(Color color, {double width = 1}) {
    return OutlineInputBorder(
      borderRadius: BorderRadius.circular(12.r),
      borderSide: BorderSide(color: color, width: width),
    );
  }
}
