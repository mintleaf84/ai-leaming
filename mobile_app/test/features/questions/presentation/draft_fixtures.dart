import 'package:mobile_app/features/questions/data/question_editor_repository.dart';
import 'package:mobile_app/features/questions/domain/question_draft.dart';

import '../fake_question_editor_repository.dart';

/// 草稿相关的测试夹具。
///
/// 单独放一个文件是因为列表页、校对页、控制器三处测试都要用同一批草稿形状；
/// 各自手写一份 JSON/对象，改字段时总会漏掉一处。
QuestionDraftSummary fakeDraftSummary({
  String id = 'd1',
  DraftStatus status = DraftStatus.ready,
  int itemCount = 1,
  int confirmedCount = 0,
  String? errorCode,
  String source = 'camera',
  String createdAt = '2026-11-20T10:00:00.000Z',
}) {
  return QuestionDraftSummary(
    id: id,
    status: status,
    source: source,
    errorCode: errorCode,
    createdAt: createdAt,
    itemCount: itemCount,
    confirmedCount: confirmedCount,
  );
}

QuestionDraftItem fakeDraftItem({
  int idx = 0,
  String content = 'AI 识别的题干',
  List<String> options = const <String>['选项甲', '选项乙'],
  String answer = 'A',
  String explanation = 'AI 识别的解析',
  List<String> tags = const <String>['教育学'],
  String type = 'single',
  bool confirmed = false,
}) {
  return QuestionDraftItem(
    idx: idx,
    content: content,
    options: options,
    answer: answer,
    explanation: explanation,
    tags: tags,
    type: type,
    confirmed: confirmed,
  );
}

QuestionDraft fakeDraft({
  String id = 'd1',
  DraftStatus status = DraftStatus.ready,
  String? errorCode,
  List<QuestionDraftItem>? items,
}) {
  return QuestionDraft(
    id: id,
    status: status,
    source: 'camera',
    errorCode: errorCode,
    createdAt: '2026-11-20T10:00:00.000Z',
    items:
        items ??
        <QuestionDraftItem>[
          fakeDraftItem(idx: 0, content: '第一题题干'),
          fakeDraftItem(idx: 1, content: '第二题题干'),
        ],
  );
}

/// 把仓库塞进 `questionEditorRepositoryProvider`。
Object questionEditorRepositoryOverride(FakeQuestionEditorRepository repository) {
  return questionEditorRepositoryProvider.overrideWithValue(repository);
}
