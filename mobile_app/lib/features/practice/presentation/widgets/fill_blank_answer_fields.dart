import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../practice_provider.dart';

/// 填空题的作答区：按空数渲染 N 个文本框，每改一次就把这一空写回练习控制器。
///
/// **为什么文本存在 `PracticeController` 而不是本控件里**：提交与判分读的是
/// `state.userAnswers`（逐空文本），练习屏还能用「上一题/下一题」回到这一题——
/// 作答得跟着这场练习走，而不是跟着这个 State 的寿命走。TextEditingController
/// 只持有当前显示的文本，真正的口径在控制器。
///
/// 空数由 `fillBlankSlotsFor` 决定（口径见 `domain/fill_blank_answer.dart`）；
/// 这里只负责渲染与逐空回写，不自己数空。
class FillBlankAnswerFields extends ConsumerStatefulWidget {
  const FillBlankAnswerFields({
    super.key,
    required this.questionId,
    required this.blankCount,
    required this.answers,
    required this.judged,
  });

  final String questionId;

  /// 要渲染的空数（至少 1）。
  final int blankCount;

  /// 本场已填的逐空文本（`state.userAnswers[questionId]`，可能比 [blankCount] 短）。
  final List<String> answers;

  /// 已判分：输入框转只读，文本留着让用户对照解析，但不再接受改动
  /// （改一处就出现「屏幕上的答案」与「已提交的答案」两个版本）。
  final bool judged;

  @override
  ConsumerState<FillBlankAnswerFields> createState() =>
      _FillBlankAnswerFieldsState();
}

class _FillBlankAnswerFieldsState extends ConsumerState<FillBlankAnswerFields> {
  late List<TextEditingController> _controllers;

  @override
  void initState() {
    super.initState();
    _controllers = _buildControllers();
  }

  List<TextEditingController> _buildControllers() {
    final saved = widget.answers;
    return List<TextEditingController>.generate(
      widget.blankCount,
      (index) => TextEditingController(
        // 没填过的空是空串：占位仍然存在，用户能看出还有几空要填。
        text: index < saved.length ? saved[index] : '',
      ),
    );
  }

  @override
  void didUpdateWidget(FillBlankAnswerFields oldWidget) {
    super.didUpdateWidget(oldWidget);
    // 换题、或空数变了：整批换掉控制器，否则上一题的文本会留在这一题的框里。
    // 不比对文本内容——那是本控件自己写回去的，回填会把光标顶到末尾。
    if (oldWidget.questionId != widget.questionId ||
        oldWidget.blankCount != widget.blankCount) {
      for (final controller in _controllers) {
        controller.dispose();
      }
      _controllers = _buildControllers();
    }
  }

  @override
  void dispose() {
    for (final controller in _controllers) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final practice = ref.read(practiceControllerProvider.notifier);
    final blankCount = _controllers.length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var index = 0; index < blankCount; index++) ...[
          Text(
            '空 ${index + 1}',
            style: TextStyle(
              fontSize: 12.sp,
              fontWeight: FontWeight.w600,
              color: colors.textSecondary,
            ),
          ),
          SizedBox(height: 6.h),
          TextFormField(
            controller: _controllers[index],
            readOnly: widget.judged,
            // 最后一空收键盘，前面的空跳到下一空：逐空填写不用手动点回输入框。
            textInputAction: index == blankCount - 1
                ? TextInputAction.done
                : TextInputAction.next,
            onChanged: (text) => practice.setBlankAnswer(index, text),
            style: TextStyle(fontSize: 15.sp, height: 1.5, color: colors.text),
            decoration: InputDecoration(
              hintText: '请输入第 ${index + 1} 个空的答案',
              hintStyle: TextStyle(
                fontSize: 14.sp,
                color: colors.textSecondary,
              ),
              filled: true,
              fillColor: colors.surfaceAlt,
              contentPadding: EdgeInsets.all(12.w),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10.r),
                borderSide: BorderSide.none,
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10.r),
                borderSide: BorderSide(color: colors.border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10.r),
                borderSide: BorderSide(color: colors.accent, width: 1.5),
              ),
            ),
          ),
          SizedBox(height: 16.h),
        ],
        if (widget.judged)
          Text(
            '已提交，不能再改。用「下一题」继续。',
            style: TextStyle(fontSize: 12.sp, color: colors.textSecondary),
          ),
      ],
    );
  }
}
