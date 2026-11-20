import 'package:freezed_annotation/freezed_annotation.dart';
import '../../core/utils/json_converters.dart';

part 'question.freezed.dart';
part 'question.g.dart';

@freezed
abstract class Question with _$Question {
  const factory Question({
    @StringIdConverter() required String id,
    required String content,
    required List<String> options,
    @Default('single') String type,
    @Default([]) List<String> tags,
    String? dimension,
    String? explanation,
    String? answer,

    /// 材料题原文（纯文本）。服务端 `practice.ts` 返回，只有材料题才有；
    /// 旧接口/离线缓存里没有该字段时为 null。
    String? material,

    /// 材料题的富文本版本（服务端已用 DOMPurify 按白名单清洗）。
    /// 优先于 [material] 渲染，因为表格/上下标/图片只有 HTML 才能表达。
    // freezed 把注解落在 getter 上，静态检查会误报（同 chat_message.dart）
    // ignore: invalid_annotation_target
    @JsonKey(name: 'material_html') String? materialHtml,
  }) = _Question;

  factory Question.fromJson(Map<String, dynamic> json) =>
      _$QuestionFromJson(json);
}

@freezed
abstract class QuestionListResponse with _$QuestionListResponse {
  const factory QuestionListResponse({
    required List<Question> items,
    required int total,
  }) = _QuestionListResponse;

  factory QuestionListResponse.fromJson(Map<String, dynamic> json) =>
      _$QuestionListResponseFromJson(json);
}
