import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../practice/presentation/widgets/question_material_card.dart';
import '../../../../shared/widgets/animated_option_card.dart';
import '../../domain/exam_question.dart';

/// 作答屏里的一道题：题干 + 按题型切换的作答控件。
///
/// 为什么复用 `AnimatedOptionCard`：单选/多选的选中态、点按缩放、读屏语义在练习页
/// 已经被测过一遍，试卷再造一套只会让两处手感慢慢分叉。
class ExamQuestionView extends StatelessWidget {
  const ExamQuestionView({
    super.key,
    required this.question,
    required this.position,
    required this.selected,
    required this.onSelectOption,
    required this.onTyped,
  });

  final ExamQuestion question;

  /// 题号（从 1 开始），显示在题型标签旁。
  final int position;

  /// 当前作答：选项字母（多选是排好序的 `AB`）或填空原文。
  final String selected;

  /// 点选项。多选题由上层负责增删。
  final ValueChanged<String> onSelectOption;

  /// 填空输入。
  final ValueChanged<String> onTyped;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final options = question.displayOptions;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              padding: EdgeInsets.symmetric(horizontal: 6.w, vertical: 2.h),
              decoration: BoxDecoration(
                color: colors.surfaceAlt,
                borderRadius: BorderRadius.circular(4.r),
              ),
              child: Text(
                '第 $position 题',
                style: TextStyle(
                  fontSize: 11.sp,
                  fontWeight: FontWeight.w600,
                  color: colors.textSecondary,
                  fontFeatures: const <FontFeature>[
                    FontFeature.tabularFigures(),
                  ],
                ),
              ),
            ),
            SizedBox(width: 6.w),
            Text(
              question.typeLabel,
              style: TextStyle(
                fontSize: 11.sp,
                fontWeight: FontWeight.w600,
                color: colors.accent,
                letterSpacing: 0.4,
              ),
            ),
            if (question.isMulti) ...[
              SizedBox(width: 6.w),
              Text(
                '少选、多选都不算对',
                style: TextStyle(fontSize: 10.sp, color: colors.textSecondary),
              ),
            ],
          ],
        ),
        SizedBox(height: 12.h),
        QuestionMaterialCard(
          material: question.material,
          materialHtml: question.materialHtml,
        ),
        if (question.isFillBlank) ...[
          Text(
            question.content,
            style: TextStyle(
              fontSize: 18.sp,
              fontWeight: FontWeight.w600,
              height: 1.55,
              color: colors.text,
              letterSpacing: -0.1,
            ),
          ),
          SizedBox(height: 16.h),
          _buildFillBlank(colors),
        ] else ...[
          Text(
            question.content,
            style: TextStyle(
              fontSize: 18.sp,
              fontWeight: FontWeight.w600,
              height: 1.55,
              color: colors.text,
              letterSpacing: -0.1,
            ),
          ),
          SizedBox(height: 20.h),
          if (options.isEmpty)
            Text(
              '这道题没有选项，暂时做不了。可以先跳过。',
              style: TextStyle(fontSize: 12.sp, color: colors.textSecondary),
            )
          else
            for (var index = 0; index < options.length; index++) ...[
              AnimatedOptionCard(
                label: String.fromCharCode(65 + index),
                text: options[index],
                isSelected: _isSelected(String.fromCharCode(65 + index)),
                isCorrect: false,
                isWrong: false,
                isMultiSelect: question.isMulti,
                onTap: () => onSelectOption(String.fromCharCode(65 + index)),
              ),
              SizedBox(height: 10.h),
            ],
        ],
      ],
    );
  }

  bool _isSelected(String label) {
    if (question.isMulti) return selected.contains(label);
    return selected == label;
  }

  Widget _buildFillBlank(AppColors colors) {
    return TextFormField(
      // key 跟着题走：切题时换一个 field，initialValue 才会被重新读取。
      key: ValueKey<String>('exam_fill_${question.id}'),
      initialValue: selected,
      minLines: 2,
      maxLines: 4,
      textInputAction: TextInputAction.done,
      onChanged: onTyped,
      style: TextStyle(fontSize: 15.sp, height: 1.5, color: colors.text),
      decoration: InputDecoration(
        hintText: '在这里填写答案',
        hintStyle: TextStyle(fontSize: 14.sp, color: colors.textSecondary),
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
    );
  }
}
