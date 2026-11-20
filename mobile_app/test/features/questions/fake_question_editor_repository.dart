import 'package:dio/dio.dart';
import 'package:mobile_app/features/practice/domain/question.dart';
import 'package:mobile_app/features/questions/domain/question_draft.dart';
import 'package:mobile_app/features/questions/data/question_editor_repository.dart';

/// 建题/草稿仓库的替身（继承 + override，同 `FakeWrongBookRepository` 的做法）。
///
/// 只做两件事：**返回预设数据** + **把收到的请求记下来**。断言留在各用例里，
/// 这样同一个替身既能给建题表单用（看 `createdPayloads`），也能给校对页用
/// （看 `itemPatches` / `confirmCalls`）。
///
/// 注意 `fetchDraft` 每次都会把 `draft` 原样返回：控制器在保存/确认后会回读
/// 服务端，测试里「回读结果 == 预设草稿」正是我们想验证的稳定行为。
class FakeQuestionEditorRepository extends QuestionEditorRepository {
  FakeQuestionEditorRepository({
    this.question,
    this.draft,
    this.drafts = const <QuestionDraftSummary>[],
    this.analyzeResult,
    this.confirmResult = const DraftConfirmResult(created: 2, skipped: 1),
  }) : super(Dio());

  /// `fetchQuestion` 的返回（改题页预填）。
  Question? question;

  /// `fetchDraft` 的返回。
  QuestionDraft? draft;

  /// `listDrafts` 的返回。
  List<QuestionDraftSummary> drafts;

  /// `analyzeDraft` 的返回；为 null 时按「服务端没回体」处理（控制器会再 GET 一次）。
  QuestionDraft? analyzeResult;

  DraftConfirmResult confirmResult;

  Object? loadError;
  Object? saveError;

  final List<Map<String, dynamic>> createdPayloads = <Map<String, dynamic>>[];
  final List<String> updatedIds = <String>[];
  final List<Map<String, dynamic>> updatedPayloads = <Map<String, dynamic>>[];
  final List<(String draftId, int idx, Map<String, dynamic> patch)> itemPatches =
      <(String, int, Map<String, dynamic>)>[];
  final List<int> deletedItems = <int>[];
  final List<String> confirmedDrafts = <String>[];
  final List<String> analyzedDrafts = <String>[];
  final List<String> discardedDrafts = <String>[];
  int listCalls = 0;
  int fetchDraftCalls = 0;

  @override
  Future<Question> fetchQuestion(String id) async {
    final error = loadError;
    if (error != null) throw error;
    final value = question;
    if (value == null) {
      throw StateError('FakeQuestionEditorRepository.question 未设置');
    }
    return value;
  }

  @override
  Future<Question?> createQuestion(Map<String, dynamic> payload) async {
    final error = saveError;
    if (error != null) throw error;
    createdPayloads.add(payload);
    return null;
  }

  @override
  Future<Question?> updateQuestion(
    String id,
    Map<String, dynamic> payload,
  ) async {
    final error = saveError;
    if (error != null) throw error;
    updatedIds.add(id);
    updatedPayloads.add(payload);
    return null;
  }

  @override
  Future<List<QuestionDraftSummary>> listDrafts() async {
    listCalls++;
    final error = loadError;
    if (error != null) throw error;
    return drafts;
  }

  @override
  Future<QuestionDraft> fetchDraft(String id) async {
    fetchDraftCalls++;
    final error = loadError;
    if (error != null) throw error;
    final value = draft;
    if (value == null) {
      throw StateError('FakeQuestionEditorRepository.draft 未设置');
    }
    return value;
  }

  @override
  Future<QuestionDraftItem?> updateDraftItem(
    String draftId,
    int idx,
    Map<String, dynamic> patch,
  ) async {
    final error = saveError;
    if (error != null) throw error;
    itemPatches.add((draftId, idx, patch));
    return null;
  }

  @override
  Future<void> deleteDraftItem(String draftId, int idx) async {
    final error = saveError;
    if (error != null) throw error;
    deletedItems.add(idx);
  }

  @override
  Future<DraftConfirmResult> confirmDraft(String draftId) async {
    final error = saveError;
    if (error != null) throw error;
    confirmedDrafts.add(draftId);
    return confirmResult;
  }

  @override
  Future<QuestionDraft?> analyzeDraft(String draftId) async {
    final error = saveError;
    if (error != null) throw error;
    analyzedDrafts.add(draftId);
    return analyzeResult;
  }

  @override
  Future<void> discardDraft(String draftId) async {
    discardedDrafts.add(draftId);
  }
}
