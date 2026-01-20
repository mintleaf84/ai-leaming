import 'package:freezed_annotation/freezed_annotation.dart';

part 'history_item.freezed.dart';
part 'history_item.g.dart';

/// 历史记录项
@freezed
abstract class HistoryItem with _$HistoryItem {
  const factory HistoryItem({
    required String id,
    String? sessionName,
    required int totalQuestions,
    required int correctCount,
    @Default(0) int reviewCount,
    required String createdAt,
    required int accuracy,
    String? practiceMode,
  }) = _HistoryItem;

  factory HistoryItem.fromJson(Map<String, dynamic> json) =>
      _$HistoryItemFromJson(json);
}
