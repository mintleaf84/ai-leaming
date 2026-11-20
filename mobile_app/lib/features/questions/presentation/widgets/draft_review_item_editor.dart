import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import '../../domain/question_draft.dart';
import '../../domain/question_form.dart';
import 'draft_review_keys.dart';

/// 一条识别结果：可编辑、可删除、可勾选确认。
///
/// 从 `draft_review_screen.dart` 原样搬出（§34.3），行为与文案零改动：
/// 每条的四个输入框、勾选与「保存本条」都是**逐条显式保存**的，
/// 自动保存会把「改到一半的错题」写进服务端。
class DraftItemEditor extends StatefulWidget {
  const DraftItemEditor({
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
  State<DraftItemEditor> createState() => _DraftItemEditorState();
}

class _DraftItemEditorState extends State<DraftItemEditor> {
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
