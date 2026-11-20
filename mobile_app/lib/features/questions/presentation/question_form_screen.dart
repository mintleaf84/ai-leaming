import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../core/error/user_message.dart';
import '../../../core/navigation/app_nav.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_icons.dart';
import '../../../shared/events/data_change_events.dart';
import '../../../shared/widgets/state_views.dart';
import '../data/question_editor_repository.dart';
import '../domain/question_form.dart';

/// 建题 / 改题表单（§35）。
///
/// [questionId] 为 null 是新建，否则先 `GET /questions/:id` 预填再 `PATCH`。
///
/// 校验与请求体都不在本文件里：规则在 `domain/question_form.dart`，这样
/// 「必填校验」「选择题至少一个选项」「材料为空不报错」可以脱开 widget 单测。
class QuestionFormScreen extends ConsumerStatefulWidget {
  const QuestionFormScreen({super.key, this.questionId});

  /// 为 null 时是新建。
  final String? questionId;

  bool get isEditing => questionId != null;

  // 测试用的稳定定位（按文案找控件在改文案时会连带改测试）。
  static const contentFieldKey = Key('question-form-content');
  static const answerFieldKey = Key('question-form-answer');
  static const explanationFieldKey = Key('question-form-explanation');
  static const tagsFieldKey = Key('question-form-tags');
  static const materialFieldKey = Key('question-form-material');
  static const saveButtonKey = Key('question-form-save');
  static const addOptionButtonKey = Key('question-form-add-option');

  static Key optionFieldKey(int index) =>
      Key('question-form-option-$index');

  @override
  ConsumerState<QuestionFormScreen> createState() => _QuestionFormScreenState();
}

class _QuestionFormScreenState extends ConsumerState<QuestionFormScreen> {
  final _content = TextEditingController();
  final _answer = TextEditingController();
  final _explanation = TextEditingController();
  final _tags = TextEditingController();
  final _material = TextEditingController();

  /// 选项行：默认给 4 行（单选/多选的常见形态），可增可删。
  List<TextEditingController> _options = <TextEditingController>[
    for (var i = 0; i < 4; i++) TextEditingController(),
  ];

  QuestionType _type = QuestionType.single;
  QuestionFormValidation _validation = const QuestionFormValidation();

  bool _loading = false;
  bool _saving = false;
  String? _loadError;
  String? _saveError;

  @override
  void initState() {
    super.initState();
    if (widget.isEditing) {
      // 先挂一帧再发请求：initState 里直接 await 会让首帧没有 loading 态。
      Future.microtask(_loadQuestion);
    }
  }

  @override
  void dispose() {
    _content.dispose();
    _answer.dispose();
    _explanation.dispose();
    _tags.dispose();
    _material.dispose();
    for (final option in _options) {
      option.dispose();
    }
    super.dispose();
  }

  Future<void> _loadQuestion() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final question = await ref
          .read(questionEditorRepositoryProvider)
          .fetchQuestion(widget.questionId!);
      if (!mounted) return;
      final values = QuestionFormValues.fromQuestion(question);
      setState(() {
        _type = values.type;
        _content.text = values.content;
        _answer.text = values.answer;
        _explanation.text = values.explanation;
        _tags.text = formatTags(values.tags);
        _material.text = values.material;
        _replaceOptions(values.options);
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadError = userMessageOf(error);
      });
    }
  }

  /// 用给定选项重建输入行；空列表补一行，避免「一个选项输入框都没有」。
  void _replaceOptions(List<String> values) {
    for (final option in _options) {
      option.dispose();
    }
    final next = values.isEmpty ? <String>[''] : values;
    _options = <TextEditingController>[
      for (final value in next) TextEditingController(text: value),
    ];
  }

  void _addOption() {
    setState(() => _options.add(TextEditingController()));
  }

  void _removeOption(int index) {
    setState(() {
      final removed = _options.removeAt(index);
      removed.dispose();
    });
  }

  QuestionFormValues _currentValues() {
    return QuestionFormValues(
      content: _content.text,
      options: _options.map((option) => option.text).toList(),
      answer: _answer.text,
      type: _type,
      explanation: _explanation.text,
      tags: parseTags(_tags.text),
      material: _material.text,
    );
  }

  Future<void> _save() async {
    final values = _currentValues();
    final validation = validateQuestionForm(values);
    setState(() {
      _validation = validation;
      _saveError = null;
    });
    if (validation.hasError) return;

    setState(() => _saving = true);
    final repository = ref.read(questionEditorRepositoryProvider);
    try {
      if (widget.isEditing) {
        await repository.updateQuestion(widget.questionId!, values.toPayload());
      } else {
        await repository.createQuestion(values.toPayload());
      }
      if (!mounted) return;

      // 题库列表是另一屏（practice feature）的 state：新建/改题后它必须重新拉，
      // 否则返回列表看不到刚保存的这道题。
      //
      // 这里只 bump 版本号，不直接 `invalidate` 对方的 provider——那样 questions
      // 就依赖了 practice 的表现层。列表页自己 listen 这个版本号并刷新。
      ref.read(questionBankEpochProvider.notifier).bump();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(widget.isEditing ? '已保存修改' : '已创建题目')),
      );
      context.backOrHome(fallback: AppRoutes.questions);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _saveError = userMessageOf(error);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        leading: IconButton(
          tooltip: '返回',
          icon: const Icon(AppIcons.arrowBack),
          onPressed: () => context.backOrHome(fallback: AppRoutes.questions),
        ),
        title: Text(widget.isEditing ? '编辑题目' : '新建题目'),
      ),
      body: _buildBody(colors),
    );
  }

  Widget _buildBody(AppColors colors) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_loadError != null) {
      return AppErrorView(
        message: _loadError!,
        onRetry: _loadQuestion,
        secondaryLabel: '返回题库',
        onSecondary: () => context.backOrHome(fallback: AppRoutes.questions),
      );
    }

    return SafeArea(
      child: Column(
        children: [
          Expanded(
            child: ListView(
              padding: EdgeInsets.fromLTRB(20.w, 16.h, 20.w, 24.h),
              children: [
                _sectionLabel('题型'),
                SizedBox(height: 8.h),
                Wrap(
                  spacing: 8.w,
                  runSpacing: 8.h,
                  children: [
                    for (final type in QuestionType.values)
                      ChoiceChip(
                        label: Text(type.label),
                        selected: _type == type,
                        onSelected: (_) => setState(() => _type = type),
                      ),
                  ],
                ),
                SizedBox(height: 20.h),
                _field(
                  key: QuestionFormScreen.contentFieldKey,
                  controller: _content,
                  label: '题干（必填）',
                  hint: '粘贴或输入题干原文',
                  maxLines: 6,
                  errorText: _validation.contentError,
                ),
                if (_type.isChoice) ...[
                  SizedBox(height: 20.h),
                  _sectionLabel('选项'),
                  SizedBox(height: 8.h),
                  for (var i = 0; i < _options.length; i++)
                    Padding(
                      padding: EdgeInsets.only(bottom: 8.h),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Padding(
                            padding: EdgeInsets.only(top: 12.h, right: 8.w),
                            child: Text(
                              String.fromCharCode(65 + i),
                              style: TextStyle(
                                fontSize: 14.sp,
                                fontWeight: FontWeight.w600,
                                color: colors.textSecondary,
                              ),
                            ),
                          ),
                          Expanded(
                            child: _field(
                              key: QuestionFormScreen.optionFieldKey(i),
                              controller: _options[i],
                              label: '选项 ${String.fromCharCode(65 + i)}',
                              maxLines: 2,
                            ),
                          ),
                          IconButton(
                            tooltip: '删除选项 ${String.fromCharCode(65 + i)}',
                            onPressed: _options.length > 1
                                ? () => _removeOption(i)
                                : null,
                            icon: const Icon(AppIcons.deleteOutline),
                          ),
                        ],
                      ),
                    ),
                  if (_validation.optionsError != null)
                    Padding(
                      padding: EdgeInsets.only(bottom: 8.h),
                      child: Text(
                        _validation.optionsError!,
                        style: TextStyle(fontSize: 12.sp, color: colors.error),
                      ),
                    ),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      key: QuestionFormScreen.addOptionButtonKey,
                      onPressed: _addOption,
                      icon: const Icon(AppIcons.add, size: 18),
                      label: const Text('添加选项'),
                    ),
                  ),
                ],
                SizedBox(height: 20.h),
                _field(
                  key: QuestionFormScreen.answerFieldKey,
                  controller: _answer,
                  label: '答案（必填）',
                  hint: _type.isChoice ? '如 A 或 AB' : '填空题/判断题填正确答案文本',
                  errorText: _validation.answerError,
                ),
                SizedBox(height: 20.h),
                _field(
                  key: QuestionFormScreen.explanationFieldKey,
                  controller: _explanation,
                  label: '解析',
                  hint: '可留空',
                  maxLines: 4,
                ),
                SizedBox(height: 20.h),
                _field(
                  key: QuestionFormScreen.tagsFieldKey,
                  controller: _tags,
                  label: '标签',
                  hint: '用逗号分隔，如：教育学，教育目的',
                ),
                SizedBox(height: 20.h),
                _field(
                  key: QuestionFormScreen.materialFieldKey,
                  controller: _material,
                  label: '材料（纯文本）',
                  hint: '材料题原文，可留空',
                  maxLines: 5,
                ),
              ],
            ),
          ),
          _buildSaveBar(colors),
        ],
      ),
    );
  }

  Widget _buildSaveBar(AppColors colors) {
    return Container(
      padding: EdgeInsets.fromLTRB(20.w, 12.h, 20.w, 16.h),
      decoration: BoxDecoration(
        color: Theme.of(context).scaffoldBackgroundColor,
        border: Border(top: BorderSide(color: colors.border)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // 失败原因贴着操作按钮放：放在列表末尾时，用户点了保存却看不到
          // 任何反馈（错误文案在视口之外）。
          if (_saveError != null) ...[
            Row(
              children: [
                Icon(AppIcons.errorOutline, size: 16.sp, color: colors.error),
                SizedBox(width: 6.w),
                Expanded(
                  child: Text(
                    _saveError!,
                    style: TextStyle(fontSize: 13.sp, color: colors.error),
                  ),
                ),
              ],
            ),
            SizedBox(height: 8.h),
          ],
          SizedBox(
            width: double.infinity,
            height: 48.h,
            child: FilledButton(
              key: QuestionFormScreen.saveButtonKey,
              onPressed: _saving ? null : _save,
              style: FilledButton.styleFrom(
                backgroundColor: colors.accent,
                foregroundColor: colors.onAccent,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8.r),
                ),
              ),
              child: _saving
                  ? SizedBox(
                      width: 20.sp,
                      height: 20.sp,
                      child: const CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(
                      widget.isEditing ? '保存修改' : '创建题目',
                      style: TextStyle(
                        fontSize: 16.sp,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionLabel(String text) {
    return Text(
      text,
      style: TextStyle(
        fontSize: 14.sp,
        fontWeight: FontWeight.w600,
        color: context.colors.text,
      ),
    );
  }

  /// 统一风格的输入框。`errorText` 由纯校验函数给，不在 widget 里另写规则。
  Widget _field({
    required Key key,
    required TextEditingController controller,
    required String label,
    String? hint,
    String? errorText,
    int maxLines = 1,
  }) {
    final colors = context.colors;
    return TextField(
      key: key,
      controller: controller,
      maxLines: maxLines,
      style: TextStyle(fontSize: 14.sp, color: colors.text),
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        errorText: errorText,
        hintStyle: TextStyle(fontSize: 13.sp, color: colors.textSecondary),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8.r),
        ),
      ),
    );
  }
}
