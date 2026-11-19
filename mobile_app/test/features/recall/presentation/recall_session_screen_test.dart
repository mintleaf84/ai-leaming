import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/recall/data/recall_repository.dart';
import 'package:mobile_app/features/recall/presentation/recall_session_screen.dart';

/// 用 Dio 的 `HttpClientAdapter` 桩住网络：断言的是**发出去的请求**（载荷、路径），
/// 不是服务端实现——所以这些测试不联网，也不会碰数据库。
///
/// 这里守的四条线：
/// 1. 空队列走空态，不许被错误态吞掉（那会让用户以为今天已经做完）；
/// 2. 提交失败后重试必须重放**同一个 `clientKey` + 同一份载荷**，
///    否则服务端会当成第二次作答，进度被推进两次；
/// 3. 改判随**唯一一次**提交上送，`overrides` 用的是卡内下标而不是屏上位置；
/// 4. 长内容 + 1.3 倍字号 + 键盘弹出时不溢出（主操作必须留在可见处）。
class _StubAdapter implements HttpClientAdapter {
  _StubAdapter(this.handler);

  final FutureOr<ResponseBody> Function(RequestOptions options) handler;
  final List<RequestOptions> requests = <RequestOptions>[];

  /// 只留数据请求，过滤 Dio 的日志/预检之类。
  List<RequestOptions> get posts =>
      requests.where((request) => request.method == 'POST').toList();

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(Object body, {int statusCode = 200}) {
  return ResponseBody.fromString(
    jsonEncode(body),
    statusCode,
    headers: const <String, List<String>>{
      Headers.contentTypeHeader: <String>['application/json; charset=utf-8'],
    },
  );
}

Map<String, dynamic> _queueBody({List<int> ids = const [11]}) {
  return <String, dynamic>{
    'ids': ids,
    'due': ids.length,
    'fresh': 0,
    'total': ids.length,
    'estimatedMinutes': 2,
    'streakDays': 3,
  };
}

/// 一张两条例目的列举卡。
Map<String, dynamic> _cardBody({
  int cardId = 11,
  int itemCount = 2,
  String mode = 'first',
  List<int>? pendingItems,
  String prompt = '简述教育目的的功能。',
}) {
  const texts = <String>['导向作用', '激励作用', '评价作用', '教育作用'];
  const keywords = <String>['导向', '激励', '评价', '教育'];
  final items = <Map<String, dynamic>>[
    for (var index = 0; index < itemCount; index++)
      <String, dynamic>{
        'text': '${texts[index % texts.length]}（第 ${index + 1} 条）',
        'keywords': <String>[keywords[index % keywords.length]],
      },
  ];
  return <String, dynamic>{
    'cardId': cardId,
    'cardKey': 'g1',
    'kind': 'list',
    'prompt': prompt,
    'items': items,
    'verbatim': false,
    'state': null,
    'deckKey': 'pedagogy',
    'deckTitle': '教育学原理 · 第一章',
    'mode': mode,
    'pendingItems': pendingItems,
  };
}

Map<String, dynamic> _reviewBody({
  List<String> verdicts = const ['ok', 'miss'],
  List<int>? pendingItems = const [1],
  String nextReviewText = '明天只重测这 1 条',
  String rating = 'again',
  bool duplicate = false,
}) {
  return <String, dynamic>{
    'verdicts': verdicts,
    'rating': rating,
    'nextDue': '2026-11-20T00:00:00.000Z',
    'pendingItems': pendingItems,
    'nextReviewText': nextReviewText,
    'duplicate': duplicate,
  };
}

void main() {
  late _StubAdapter adapter;

  /// 默认路由：队列 → 首卡 → 提交成功。
  Widget buildApp({TextScaler? textScaler}) {
    return ProviderScope(
      overrides: [
        recallRepositoryProvider.overrideWithValue(
          RecallRepository(
            Dio(BaseOptions(baseUrl: 'http://localhost:3000/api'))
              ..httpClientAdapter = adapter,
          ),
        ),
      ],
      child: MaterialApp(
        builder: (context, child) {
          final base = MediaQuery.of(context);
          return MediaQuery(
            data: textScaler == null
                ? base
                : base.copyWith(textScaler: textScaler),
            child: child ?? const SizedBox.shrink(),
          );
        },
        home: ScreenUtilInit(
          designSize: const Size(390, 884),
          builder: (context, child) => const RecallSessionScreen(onExit: _noop),
        ),
      ),
    );
  }

  /// 推进有限动画与微任务（不用 pumpAndSettle：输入框光标是无限动画）。
  Future<void> settle(WidgetTester tester) async {
    for (var index = 0; index < 8; index++) {
      await tester.pump(const Duration(milliseconds: 80));
    }
  }

  Future<void> goToQuestion(WidgetTester tester) async {
    await settle(tester);
    await tester.tap(find.text('开始'));
    await settle(tester);
  }

  Future<void> goToJudge(WidgetTester tester) async {
    await goToQuestion(tester);
    await tester.tap(find.text('看看对不对'));
    await settle(tester);
  }

  setUp(() {
    adapter = _StubAdapter((options) {
      final path = options.path;
      if (path.endsWith('/recall/queue')) return _json(_queueBody());
      if (path.contains('/recall/cards/')) return _json(_cardBody());
      if (path.endsWith('/recall/reviews')) return _json(_reviewBody());
      return _json(<String, dynamic>{'error': 'unexpected'}, statusCode: 500);
    });
  });

  testWidgets('空队列走空态：给出「今天没有要复习的卡片」和连续天数，不是错误态', (tester) async {
    adapter = _StubAdapter((options) {
      if (options.path.endsWith('/recall/queue')) {
        return _json(<String, dynamic>{
          'ids': <int>[],
          'due': 0,
          'fresh': 0,
          'total': 0,
          'estimatedMinutes': 0,
          'streakDays': 4,
        });
      }
      return _json(<String, dynamic>{}, statusCode: 500);
    });

    await tester.pumpWidget(buildApp());
    await settle(tester);

    expect(find.text('今天没有要复习的卡片'), findsOneWidget);
    expect(find.textContaining('已经连续 4 天'), findsOneWidget);
    // 空态与错误态必须互斥：错误态会给"重试"，空态给"再拉一次"
    expect(find.text('回忆没有加载出来'), findsNothing);
    expect(find.text('再拉一次'), findsOneWidget);
  });

  testWidgets('提交失败后重试：重放同一个 clientKey 与同一份载荷', (tester) async {
    var reviewCalls = 0;
    adapter = _StubAdapter((options) {
      final path = options.path;
      if (path.endsWith('/recall/queue')) return _json(_queueBody());
      if (path.contains('/recall/cards/')) return _json(_cardBody());
      if (path.endsWith('/recall/reviews')) {
        reviewCalls += 1;
        if (reviewCalls == 1) {
          // 第一次：结果未知（超时）
          throw DioException(
            requestOptions: options,
            type: DioExceptionType.receiveTimeout,
          );
        }
        return _json(_reviewBody());
      }
      return _json(<String, dynamic>{}, statusCode: 500);
    });

    await tester.pumpWidget(buildApp());
    await goToJudge(tester);

    await tester.tap(find.text('确认结果'));
    await settle(tester);

    // 失败后：判定锁住、给出可读原因、主操作变成「重试提交」
    expect(find.text('这次没有记下来'), findsOneWidget);
    expect(find.text('网络超时了，检查一下网络再试一次。'), findsOneWidget);
    expect(find.text('重试提交'), findsOneWidget);
    // 「全没想起」在结果未知时不该再出现：它会让服务端重放首次结果，
    // 界面却以为是另一种提交方式
    expect(find.text('全没想起'), findsNothing);
    // 超时属于"结果未知"，不能给「跳过这张」（那会把可能已落库的作答丢掉）
    expect(find.text('跳过这张'), findsNothing);

    await tester.tap(find.text('重试提交'));
    await settle(tester);

    expect(find.text('明天只重测这 1 条'), findsWidgets);

    final posts = adapter.posts;
    expect(posts.length, 2, reason: '重试必须是一条重发，不是第二次作答');
    final first = posts[0].data as Map<String, dynamic>;
    final second = posts[1].data as Map<String, dynamic>;
    expect(second['clientKey'], first['clientKey']);
    expect(jsonEncode(second), jsonEncode(first));
    expect(first['clientKey'], isA<String>());
  });

  testWidgets('改判随唯一一次提交上送：overrides 用卡内下标', (tester) async {
    adapter = _StubAdapter((options) {
      final path = options.path;
      if (path.endsWith('/recall/queue')) return _json(_queueBody());
      if (path.contains('/recall/cards/')) return _json(_cardBody());
      if (path.endsWith('/recall/reviews')) {
        return _json(
          _reviewBody(
            verdicts: const ['ok', 'ok'],
            pendingItems: null,
            nextReviewText: '下次 11 月 20 日',
            rating: 'good',
          ),
        );
      }
      return _json(<String, dynamic>{}, statusCode: 500);
    });

    await tester.pumpWidget(buildApp());
    await goToJudge(tester);

    // 预判：作答为空 → 两条都判没写到（屏上两条都是待补）
    expect(find.text('已写到'), findsNothing);

    // 点第 2 条（屏上位置 1 = 卡内下标 1）改成「已写」
    await tester.tap(find.textContaining('激励作用'));
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('已改判'), findsOneWidget);

    await tester.tap(find.text('确认结果'));
    await settle(tester);

    final posts = adapter.posts;
    expect(posts.length, 1, reason: '一次作答只能写一条日志');
    final payload = posts[0].data as Map<String, dynamic>;
    expect(payload['cardId'], 11);
    expect(payload['typed'], '');
    expect(payload['allBlank'], isNull);
    final overrides = payload['overrides'] as List<dynamic>;
    expect(overrides.length, 1);
    expect((overrides.single as Map<String, dynamic>)['index'], 1);
    expect((overrides.single as Map<String, dynamic>)['to'], 'ok');
    expect(find.text('下次 11 月 20 日'), findsOneWidget);
  });

  testWidgets('加载失败走错误态：给出可读原因，重试后能进到今天', (tester) async {
    var queueCalls = 0;
    adapter = _StubAdapter((options) {
      if (options.path.endsWith('/recall/queue')) {
        queueCalls += 1;
        if (queueCalls == 1) {
          throw DioException(
            requestOptions: options,
            type: DioExceptionType.connectionError,
          );
        }
        return _json(_queueBody());
      }
      if (options.path.contains('/recall/cards/')) return _json(_cardBody());
      return _json(<String, dynamic>{}, statusCode: 500);
    });

    await tester.pumpWidget(buildApp());
    await settle(tester);

    expect(find.text('回忆没有加载出来'), findsOneWidget);
    // 错误态必须说清原因，不能只写"加载失败"
    expect(find.text('连不上服务器，检查一下网络或服务器地址。'), findsOneWidget);
    // 也不许退化成"今天没有要复习的卡片"（那会把故障说成没事）
    expect(find.text('今天没有要复习的卡片'), findsNothing);

    await tester.tap(find.text('重试'));
    await settle(tester);

    expect(find.text('开始'), findsOneWidget);
    expect(find.text('回忆没有加载出来'), findsNothing);
    expect(queueCalls, 2);
  });

  testWidgets('提交被服务端拒绝（404）：给「跳过这张」而不是「重试提交」，跳过后进入下一张', (tester) async {
    adapter = _StubAdapter((options) {
      final path = options.path;
      if (path.endsWith('/recall/queue')) {
        return _json(_queueBody(ids: [11, 12]));
      }
      if (path.contains('/recall/cards/')) {
        final id = int.parse(path.split('/').last);
        return _json(_cardBody(cardId: id, prompt: '第 $id 张的题干。'));
      }
      if (path.endsWith('/recall/reviews')) {
        return _json(<String, dynamic>{
          'error': <String, dynamic>{'message': '卡片不存在'},
        }, statusCode: 404);
      }
      return _json(<String, dynamic>{}, statusCode: 500);
    });

    await tester.pumpWidget(buildApp());
    await goToJudge(tester);
    expect(find.text('第 11 张的题干。'), findsOneWidget);

    await tester.tap(find.text('确认结果'));
    await settle(tester);

    // 明确拒绝：不许再给"重试"（同一份载荷必然再被拒），要给真正的出口
    expect(find.text('这张卡提交不上'), findsOneWidget);
    expect(find.text('这张卡在服务器上已经不存在了。'), findsOneWidget);
    expect(find.text('跳过这张'), findsOneWidget);
    expect(find.text('留在这里'), findsOneWidget);
    expect(find.text('重试提交'), findsNothing);
    // 判定没有被锁住：这份载荷已经作废，改判不会和"发出去的内容"打架
    expect(find.textContaining('判定已经锁住了'), findsNothing);

    await tester.tap(find.text('跳过这张'));
    await settle(tester);

    expect(find.text('第 12 张的题干。'), findsOneWidget);
    expect(find.text('看看对不对'), findsOneWidget);
    // 跳过不写任何东西：被拒的载荷没有被再发一次
    expect(adapter.posts.length, 1);
    // 也不许伪造结论
    expect(find.textContaining('下次'), findsNothing);
  });

  testWidgets('被拒绝后「留在这里」→ 再提交：换新的 clientKey，不重放被拒载荷', (tester) async {
    adapter = _StubAdapter((options) {
      final path = options.path;
      if (path.endsWith('/recall/queue')) return _json(_queueBody());
      if (path.contains('/recall/cards/')) return _json(_cardBody());
      if (path.endsWith('/recall/reviews')) {
        return _json(<String, dynamic>{}, statusCode: 400);
      }
      return _json(<String, dynamic>{}, statusCode: 500);
    });

    await tester.pumpWidget(buildApp());
    await goToJudge(tester);

    await tester.tap(find.text('确认结果'));
    await settle(tester);
    expect(find.text('留在这里'), findsOneWidget);

    await tester.tap(find.text('留在这里'));
    await settle(tester);
    expect(find.text('这张卡提交不上'), findsNothing);
    expect(find.text('确认结果'), findsOneWidget);

    await tester.tap(find.text('确认结果'));
    await settle(tester);

    final posts = adapter.posts;
    expect(posts.length, 2);
    final first = posts[0].data as Map<String, dynamic>;
    final second = posts[1].data as Map<String, dynamic>;
    expect(second['clientKey'], isNot(first['clientKey']));
  });

  testWidgets('提交遇到 5xx：仍按"结果未知"处理，给「重试提交」而不是「跳过这张」', (tester) async {
    adapter = _StubAdapter((options) {
      final path = options.path;
      if (path.endsWith('/recall/queue')) return _json(_queueBody());
      if (path.contains('/recall/cards/')) return _json(_cardBody());
      if (path.endsWith('/recall/reviews')) {
        return _json(<String, dynamic>{}, statusCode: 503);
      }
      return _json(<String, dynamic>{}, statusCode: 500);
    });

    await tester.pumpWidget(buildApp());
    await goToJudge(tester);

    await tester.tap(find.text('确认结果'));
    await settle(tester);

    expect(find.text('重试提交'), findsOneWidget);
    expect(find.text('跳过这张'), findsNothing);
    // 5xx 可能已经写进去了：判定锁住，提示重试会重发同一份
    expect(find.textContaining('判定已经锁住了'), findsOneWidget);
  });

  testWidgets('长内容 + 1.3 倍字号 + 键盘弹出：作答屏不溢出，主操作仍在', (tester) async {
    tester.view.physicalSize = const Size(360, 720);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    adapter = _StubAdapter((options) {
      final path = options.path;
      if (path.endsWith('/recall/queue')) return _json(_queueBody());
      if (path.contains('/recall/cards/')) {
        return _json(_cardBody(itemCount: 8));
      }
      return _json(<String, dynamic>{}, statusCode: 500);
    });

    await tester.pumpWidget(buildApp(textScaler: const TextScaler.linear(1.3)));
    await goToQuestion(tester);

    // 模拟输入法占掉 300dp
    tester.view.viewInsets = const FakeViewPadding(bottom: 300);
    await settle(tester);

    expect(tester.takeException(), isNull);

    // 键盘弹出后主操作依然可见（在底栏里，不被输入法压住）
    final primary = find.text('看看对不对');
    expect(primary, findsOneWidget);
    final bottomBar = tester.getRect(primary);
    expect(bottomBar.bottom, lessThanOrEqualTo(720 - 300 + 1));

    // 作答 → 判分：8 条逐条结果同样不溢出
    await tester.tap(primary);
    await settle(tester);
    expect(tester.takeException(), isNull);
    expect(find.text('确认结果'), findsOneWidget);
  });
}

void _noop() {}
