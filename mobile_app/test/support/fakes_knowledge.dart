import 'package:dio/dio.dart';
import 'package:mobile_app/core/network/dio_client.dart';

import 'recording_adapter.dart';

/// 知识卡片屏（`knowledge_screen`）的接口替身。
///
/// 知识卡片的控制器直接拿 `ApiClient(dioProvider)`（没有可注入的仓库层），所以
/// 屏测试只能从 Dio 这一层替：把 [RecordingAdapter] 挂到 `dioProvider` 上，
/// **控制器仍然是真的**——「加载中 → 数据态」「提交失败留在对话框」这些状态由真
/// 状态机跑出来，而不是测试自己塞进去的（见 `fake_providers.dart` 顶部原则）。
///
/// 断言对象是**发出去的请求**（路径、动词、query、body），不是渲染文案。
List<Object> fakeKnowledgeApi(RecordingAdapter adapter) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:3000/api'))
    ..httpClientAdapter = adapter;
  return <Object>[dioProvider.overrideWithValue(dio)];
}

/// 一张知识卡片的服务端载荷（字段名与服务端 `GET /knowledge/cards` 对齐）。
Map<String, dynamic> fakeKnowledgeCardJson({
  int id = 1,
  String front = '卡片正面',
  String back = '卡片背面',
  String category = '教育学',
  List<String> tags = const <String>['教育目的'],
  List<Map<String, String>> keyPoints = const <Map<String, String>>[
    <String, String>{'term': '教育目的', 'definition': '培养人的总要求'},
  ],
}) {
  return <String, dynamic>{
    'id': id,
    'title': front,
    'category': category,
    'tags': tags,
    'front': front,
    'back': back,
    'key_points': keyPoints,
    'created_at': '2026-11-20',
  };
}

/// 列表响应。`categories` 决定筛选条上有哪些 chip。
Map<String, dynamic> fakeKnowledgeListJson({
  List<Map<String, dynamic>> cards = const <Map<String, dynamic>>[],
  List<String> categories = const <String>[],
}) {
  return <String, dynamic>{'cards': cards, 'categories': categories};
}
