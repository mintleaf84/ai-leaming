import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import '../../domain/exam_generate_rules.dart';
import '../../domain/exam_paper.dart';
import '../exam_list_controller.dart';

/// 弹出「自动组卷」表单。生成成功时返回新卷，取消返回 null。
///
/// 为什么是底部表单而不是新页面：组卷只有五个决定（题量/时限/考点/权重/标题），
/// 填完就关；开一条路由会把「返回列表」变成一次额外的系统返回。
Future<ExamPaper?> showExamGenerateSheet(BuildContext context) {
  return showModalBottomSheet<ExamPaper>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.colors.surface,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20.r)),
    ),
    builder: (sheetContext) {
      final bottomInset = MediaQuery.viewInsetsOf(sheetContext).bottom;
      return Padding(
        // 键盘弹起时把整张表单顶上去，而不是让输入框被键盘盖住。
        padding: EdgeInsets.only(bottom: bottomInset),
        child: const ExamGenerateSheet(),
      );
    },
  );
}

/// 自动组卷表单。
///
/// 表单只组装 [ExamGenerateRules]，请求与错误由 [ExamListController] 负责；
/// 生成失败**不关表单**——用户刚填的题量/考点还在，关掉等于让他重填一遍。
class ExamGenerateSheet extends ConsumerStatefulWidget {
  const ExamGenerateSheet({super.key});

  @override
  ConsumerState<ExamGenerateSheet> createState() => _ExamGenerateSheetState();
}

class _ExamGenerateSheetState extends ConsumerState<ExamGenerateSheet> {
  static const List<int> _countOptions = <int>[10, 20, 30, 40, 50];
  static const List<int?> _minuteOptions = <int?>[null, 15, 30, 60, 90];

  late final TextEditingController _titleController;
  late final TextEditingController _tagsController;
  int _count = 20;
  int? _minutes = 30;
  ExamWeightPreset _preset = ExamWeightPreset.balanced;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _titleController = TextEditingController(
      text: '教综模考 ${now.month}月${now.day}日',
    );
    _tagsController = TextEditingController();
  }

  @override
  void dispose() {
    _titleController.dispose();
    _tagsController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (ref.read(examListControllerProvider).generating) return;
    final title = _titleController.text.trim();
    final rules = ExamGenerateRules(
      title: title.isEmpty ? '教综模考' : title,
      kind: _minutes == null ? 'fixed' : 'timed',
      durationMinutes: _minutes,
      count: _count,
      tags: parseExamTags(_tagsController.text),
      wrongWeight: _preset.wrong,
      weakWeight: _preset.weak,
      freshWeight: _preset.fresh,
    );
    final paper = await ref
        .read(examListControllerProvider.notifier)
        .generate(rules);
    if (!mounted || paper == null) return;
    Navigator.of(context).pop(paper);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(examListControllerProvider);
    final colors = context.colors;

    return ConstrainedBox(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.9,
      ),
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20.w, 12.h, 20.w, 20.h),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildHeader(context, colors),
            SizedBox(height: 20.h),
            _buildTitleField(colors),
            SizedBox(height: 20.h),
            _buildLabel(colors, '题量'),
            SizedBox(height: 8.h),
            Wrap(
              spacing: 8.w,
              runSpacing: 8.h,
              children: [
                for (final count in _countOptions)
                  _ChoicePill(
                    label: '$count 题',
                    selected: _count == count,
                    onTap: () => setState(() => _count = count),
                  ),
              ],
            ),
            SizedBox(height: 20.h),
            _buildLabel(colors, '时限'),
            SizedBox(height: 8.h),
            Wrap(
              spacing: 8.w,
              runSpacing: 8.h,
              children: [
                for (final minutes in _minuteOptions)
                  _ChoicePill(
                    label: minutes == null ? '不限时' : '$minutes 分钟',
                    selected: _minutes == minutes,
                    onTap: () => setState(() => _minutes = minutes),
                  ),
              ],
            ),
            SizedBox(height: 20.h),
            _buildLabel(colors, '考点（可不填）'),
            SizedBox(height: 8.h),
            TextField(
              controller: _tagsController,
              textInputAction: TextInputAction.done,
              style: TextStyle(fontSize: 14.sp, color: colors.text),
              decoration: _inputDecoration(colors, hint: '如 教育学、心理学'),
            ),
            SizedBox(height: 20.h),
            _buildLabel(colors, '抽题权重'),
            SizedBox(height: 8.h),
            Wrap(
              spacing: 8.w,
              runSpacing: 8.h,
              children: [
                for (final preset in ExamWeightPreset.presets)
                  _ChoicePill(
                    label: preset.label,
                    selected: _preset.key == preset.key,
                    onTap: () => setState(() => _preset = preset),
                  ),
              ],
            ),
            SizedBox(height: 8.h),
            Text(
              '${_preset.hint}（${_preset.summary}）',
              style: TextStyle(
                fontSize: 12.sp,
                height: 1.5,
                color: colors.textSecondary,
              ),
            ),
            if (state.generateError != null) ...[
              SizedBox(height: 16.h),
              _InlineError(message: state.generateError!),
            ],
            SizedBox(height: 24.h),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: state.generating ? null : _submit,
                style: FilledButton.styleFrom(
                  backgroundColor: colors.primary,
                  foregroundColor: colors.onPrimary,
                  // 触摸目标不乘 .h：48dp 是可达性指标，不随屏高缩放。
                  minimumSize: const Size.fromHeight(48),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10.r),
                  ),
                ),
                child: Text(
                  state.generating ? '正在组卷…' : '生成试卷',
                  style: TextStyle(
                    fontSize: 15.sp,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context, AppColors colors) {
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '自动组卷',
                style: TextStyle(
                  fontSize: 19.sp,
                  fontWeight: FontWeight.w700,
                  color: colors.text,
                ),
              ),
              SizedBox(height: 4.h),
              Text(
                '按错题、弱项和新题的比例抽题，生成一张可以反复作答的卷子。',
                style: TextStyle(
                  fontSize: 12.sp,
                  height: 1.5,
                  color: colors.textSecondary,
                ),
              ),
            ],
          ),
        ),
        IconButton(
          tooltip: '关闭',
          onPressed: () => Navigator.of(context).pop(),
          icon: Icon(AppIcons.close, size: 20.sp, color: colors.textSecondary),
        ),
      ],
    );
  }

  Widget _buildTitleField(AppColors colors) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildLabel(colors, '卷名'),
        SizedBox(height: 8.h),
        TextField(
          controller: _titleController,
          textInputAction: TextInputAction.next,
          style: TextStyle(fontSize: 14.sp, color: colors.text),
          decoration: _inputDecoration(colors, hint: '给这张卷子起个名字'),
        ),
      ],
    );
  }

  Widget _buildLabel(AppColors colors, String text) {
    return Text(
      text,
      style: TextStyle(
        fontSize: 13.sp,
        fontWeight: FontWeight.w600,
        color: colors.text,
      ),
    );
  }

  InputDecoration _inputDecoration(AppColors colors, {required String hint}) {
    return InputDecoration(
      hintText: hint,
      hintStyle: TextStyle(fontSize: 14.sp, color: colors.textSecondary),
      filled: true,
      fillColor: colors.surfaceAlt,
      isDense: true,
      contentPadding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 12.h),
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
    );
  }
}

/// 单选胶囊（题量/时限/权重共用）。
///
/// 用自绘而不是 `ChoiceChip`：Chip 在 1.3 倍字号下会把文字挤成两行并撑高整行，
/// 这里的文字都是 2–4 个字，固定内边距 + 单行更稳。
class _ChoicePill extends StatelessWidget {
  const _ChoicePill({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Semantics(
      button: true,
      selected: selected,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8.r),
        child: Container(
          // 44dp 是最小触摸区；不乘 .h，矮屏上也点得到。
          constraints: const BoxConstraints(minHeight: 44, minWidth: 64),
          alignment: Alignment.center,
          padding: EdgeInsets.symmetric(horizontal: 14.w),
          decoration: BoxDecoration(
            color: selected ? colors.accentContainer : colors.surfaceAlt,
            borderRadius: BorderRadius.circular(8.r),
            border: Border.all(
              color: selected ? colors.accent : colors.border,
              width: selected ? 1.4 : 1,
            ),
          ),
          child: Text(
            label,
            maxLines: 1,
            style: TextStyle(
              fontSize: 13.sp,
              fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
              color: selected ? colors.accent : colors.textSecondary,
            ),
          ),
        ),
      ),
    );
  }
}

class _InlineError extends StatelessWidget {
  const _InlineError({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Container(
      width: double.infinity,
      padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 10.h),
      decoration: BoxDecoration(
        color: colors.errorContainer,
        borderRadius: BorderRadius.circular(8.r),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(AppIcons.errorOutline, size: 16.sp, color: colors.error),
          SizedBox(width: 8.w),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                fontSize: 12.sp,
                height: 1.5,
                color: colors.onError,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
