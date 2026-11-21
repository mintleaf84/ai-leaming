import 'dart:async';

import 'package:dio/dio.dart';

import 'package:mobile_app/features/mastery/presentation/mastery_provider.dart';
import 'package:mobile_app/features/practice/domain/practice_resume.dart';
import 'package:mobile_app/features/practice/presentation/practice_provider.dart';
import 'package:mobile_app/features/practice/presentation/practice_resume_provider.dart';
import 'package:mobile_app/features/textbook/domain/textbook.dart';
import 'package:mobile_app/features/textbook/presentation/textbook_provider.dart';

import 'recording_adapter.dart';

/// B3/B4 批次（结果 / 历史 / 掌握度 / 教材 / 定价）专用装配。
///
/// 为什么不放进 `fake_providers.dart`：那份是公共装配，其他 lane 正在并行改；
/// 本文件只补这批屏需要、而公共文件里没有的三样东西——
/// 1. 结果页的会话状态注入（`PracticeController` 的作答结果是练习过程的产物，
///    用真控制器跑一遍判卷属于 practice lane，不该在这里重复）；
/// 2. 教材/掌握度的 JSON 与模型构造器（本批五条用例共用同一份）；
/// 3. 把 `dioProvider` 换成 [RecordingAdapter] 的薄封装（定价屏直接调 dio，
///    没有仓库层可 override）。

/// 一个只用于 widget 测试的 Dio：不联网，所有请求由 [adapter] 应答/记录。
Dio fakeDio(
  RecordingAdapter adapter, {
  String baseUrl = 'http://test.local/api',
}) {
  return Dio(BaseOptions(baseUrl: baseUrl))..httpClientAdapter = adapter;
}

// ---------------------------------------------------------------------------
// 结果页：会话状态
// ---------------------------------------------------------------------------

/// 直接给出结果页要读的会话状态，并记录 `reset()`。
///
/// 「返回首页」会调 `reset()`：断言它真的被调，才证明按钮除了导航还清了
/// 会话（否则回到首页点「继续上次练习」会飘回刚结束的这一场）。
class FakePracticeController extends PracticeController {
  FakePracticeController(this.initial);

  final PracticeSessionState initial;
  int resetCalls = 0;

  @override
  PracticeSessionState build() => initial;

  @override
  void reset() {
    resetCalls++;
    state = const PracticeSessionState();
  }
}

/// 断点控制器替身：只记 `clear()` 次数，不碰状态与磁盘。
///
/// 为什么需要它：`ResultScreen.initState` 里同步调了 `clear()`，而 Riverpod 3
/// 禁止在 build 阶段改 provider——真控制器会在进入结果页时直接 assert
/// （已作为缺陷回报，不改 lib/）。这里让 `clear()` 变成纯计数 + 异步让位，
/// 屏的契约（「进结果页就作废续练」）仍然可断言。
class FakePracticeResumeController extends PracticeResumeController {
  int clearCalls = 0;

  @override
  PracticeResume? build() => null;

  @override
  Future<void> clear() async {
    clearCalls++;
  }
}

List<Object> fakePracticeResume({FakePracticeResumeController? controller}) {
  final fake = controller ?? FakePracticeResumeController();
  return <Object>[
    practiceResumeControllerProvider.overrideWith(() => fake),
  ];
}

List<Object> fakeResult({
  FakePracticeController? controller,
  PracticeSessionState? state,
}) {
  final fake = controller ?? FakePracticeController(
    state ?? const PracticeSessionState(),
  );
  return <Object>[practiceControllerProvider.overrideWith(() => fake)];
}

// ---------------------------------------------------------------------------
// 教材
// ---------------------------------------------------------------------------

Map<String, dynamic> textbookJson({
  int id = 1,
  String title = '教育学教材',
  String? author = '张三',
  String? description = '教材简介正文',
  String createdAt = '2026-11-18T00:00:00.000Z',
  int chapterCount = 3,
}) {
  return <String, dynamic>{
    'id': id,
    'title': title,
    'author': author,
    'description': description,
    'cover_url': null,
    'chapterCount': chapterCount,
    'created_at': createdAt,
  };
}

Map<String, dynamic> chapterJson({
  int id = 1,
  int textbookId = 1,
  String title = '第一章 教育',
  int orderIndex = 1,
  int? parentId,
  int level = 0,
}) {
  return <String, dynamic>{
    'id': id,
    'textbook_id': textbookId,
    'title': title,
    'order_index': orderIndex,
    'parent_id': parentId,
    'level': level,
    'created_at': '2026-11-18T00:00:00.000Z',
  };
}

/// 教材详情响应：把章节拼在教材 JSON 上（`TextbookDetail.fromJson` 的期望形状）。
Map<String, dynamic> textbookDetailJson({
  Map<String, dynamic>? textbook,
  List<Map<String, dynamic>> chapters = const <Map<String, dynamic>>[],
}) {
  return <String, dynamic>{
    ...textbook ?? textbookJson(),
    'chapters': chapters,
  };
}

Textbook fakeTextbook({
  int id = 1,
  String title = '教育学教材',
  String? author = '张三',
  String? description = '教材简介正文',
  int chapterCount = 3,
}) {
  return Textbook(
    id: id,
    title: title,
    author: author,
    description: description,
    chapterCount: chapterCount,
    createdAt: '2026-11-18T00:00:00.000Z',
  );
}

TextbookChapter fakeChapter({
  int id = 1,
  int textbookId = 1,
  String title = '第一章 教育',
  int orderIndex = 1,
  int? parentId,
  int level = 0,
}) {
  return TextbookChapter(
    id: id,
    textbookId: textbookId,
    title: title,
    orderIndex: orderIndex,
    parentId: parentId,
    level: level,
    createdAt: '2026-11-18T00:00:00.000Z',
  );
}

/// 教材详情 provider 的三种态：loading / error / data。
///
/// 注意 `textbookDetailProvider` 自己 catch 后把失败写进 `state.error`，
/// 所以屏上有两条错误路径：provider 抛出（`AsyncError`）和状态字段非空。
/// 两条都要能渲染，否则断网时用户看到的可能是空白页。
List<Object> fakeTextbookDetail(
  int id, {
  TextbookDetailState? state,
  Object? error,
  bool loading = false,
}) {
  if (loading) {
    final pending = Completer<TextbookDetailState>();
    return <Object>[
      textbookDetailProvider(id).overrideWith((ref) => pending.future),
    ];
  }
  if (error != null) {
    return <Object>[
      textbookDetailProvider(
        id,
      ).overrideWith((ref) => Future<TextbookDetailState>.error(error)),
    ];
  }
  return <Object>[
    textbookDetailProvider(
      id,
    ).overrideWith((ref) => state ?? const TextbookDetailState()),
  ];
}

// ---------------------------------------------------------------------------
// 掌握度
// ---------------------------------------------------------------------------

MasteryNode fakeMasteryNode({
  String name = '教育学',
  String path = 'edu',
  num score = 85,
  int level = 0,
  List<MasteryNode> children = const <MasteryNode>[],
}) {
  return MasteryNode(
    name: name,
    path: path,
    score: score,
    level: level,
    children: children,
  );
}

Map<String, dynamic> masteryNodeJson({
  String name = '教育学',
  String path = 'edu',
  num score = 85,
  int level = 0,
  List<Map<String, dynamic>> children = const <Map<String, dynamic>>[],
}) {
  return <String, dynamic>{
    'name': name,
    'path': path,
    'score': score,
    'level': level,
    'children': children,
  };
}
