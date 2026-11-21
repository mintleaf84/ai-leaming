import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_app/features/agent_sets/presentation/agent_set_practice_screen.dart';
import 'package:mobile_app/features/practice/data/practice_repository_impl.dart';

import '../../../support/fakes_agent_sets.dart';
import '../../../support/pump_router.dart';

/// 题集练习屏：逐题作答与判分、报错二次确认与移除、一键成卷、转正入库、
/// 完成态与失败重试。
///
/// 判分走练习仓库替身（真网络留给 repository 用例），所以这里断言的是
/// **屏发出的请求形状**与**屏对结果的渲染**，不是服务端实现。
void main() {
  Future<void> settle(WidgetTester tester) async {
    for (var index = 0; index < 8; index++) {
      await tester.pump(const Duration(milliseconds: 120));
    }
  }

  /// 题集的两个问题：单选 11（第一题）、多选 12（第二题）。
  Map<String, dynamic> detailJson({
    int questionCount = 2,
    int flaggedCount = 0,
  }) {
    return agentSetDetailJson(
      set: agentSetJson(
        id: 12,
        title: '教育目的专项',
        questionCount: questionCount,
        pendingCount: questionCount,
      ),
      flaggedCount: flaggedCount,
      questions: <Map<String, dynamic>>[
        agentQuestionJson(id: 11, content: '第一题'),
        agentQuestionJson(id: 12, type: 'multi', content: '第二题'),
      ],
    );
  }

  AgentSetsStubAdapter practiceAdapter({
    int remaining = 1,
    bool detailFails = false,
  }) {
    return AgentSetsStubAdapter((options) {
      final path = options.path;
      if (path == '/agent-sets/12') {
        if (detailFails) {
          return agentSetsJson(<String, dynamic>{
            'message': '这套题没了',
          }, statusCode: 404);
        }
        return agentSetsJson(detailJson());
      }
      if (path.endsWith('/attempts')) {
        return agentSetsJson(
          agentSetAttemptJson(
            sessionId: '901',
            questions: <Map<String, dynamic>>[
              agentQuestionJson(id: 11, content: '第一题'),
              agentQuestionJson(id: 12, type: 'multi', content: '第二题'),
            ],
          ),
        );
      }
      if (path.endsWith('/flag')) {
        return agentSetsJson(agentFlagJson(remaining: remaining));
      }
      if (path.endsWith('/paper')) {
        return agentSetsJson(agentPaperJson(id: 77, totalQuestions: 2));
      }
      if (path.endsWith('/promote')) {
        return agentSetsJson(agentPromoteJson(promotedCount: 2));
      }
      return agentSetsJson(<String, dynamic>{
        'message': '未预置的路径',
      }, statusCode: 500);
    });
  }

  Future<GoRouter> pumpPractice(
    WidgetTester tester, {
    required AgentSetsStubAdapter adapter,
    required RecordingPracticeRepository practice,
  }) async {
    final router = await pumpRouter(
      tester,
      initialLocation: '/agent-sets/12',
      routes: <String, WidgetBuilder>{
        '/agent-sets/12': (_) => const AgentSetPracticeScreen(setId: 12),
        '/exam/paper/:id': (_) => const Scaffold(body: Text('试卷预览')),
      },
      overrides: <Object>[
        ...fakeAgentSets(adapter),
        practiceRepositoryProvider.overrideWithValue(practice),
      ],
    );
    await settle(tester);
    return router;
  }

  Future<void> tapKey(WidgetTester tester, String key) async {
    await tester.tap(find.byKey(ValueKey<String>(key)));
    await tester.pump();
  }

  testWidgets('首屏：进度与题面来自服务端，建会话用的是题集接口', (tester) async {
    final adapter = practiceAdapter();
    final practice = RecordingPracticeRepository();

    await pumpPractice(tester, adapter: adapter, practice: practice);

    expect(find.text('第一题'), findsOneWidget);
    expect(find.text('第 1/2 题'), findsOneWidget);
    expect(find.text('剩 2 题'), findsOneWidget);
    expect(find.text('单选题'), findsOneWidget);

    // 详情 + 建会话各一次，顺序就是契约写的两步
    expect(adapter.gets.single.path, '/agent-sets/12');
    expect(adapter.posts.single.path, '/agent-sets/12/attempts');
  });

  testWidgets('单选判分：请求带题号/作答/整场题序，结果条给出对错与正确答案', (tester) async {
    final adapter = practiceAdapter();
    final practice = RecordingPracticeRepository()
      ..submitResponse = <String, dynamic>{
        'isCorrect': false,
        'correctAnswer': 'B',
      };

    await pumpPractice(tester, adapter: adapter, practice: practice);

    await tester.tap(find.text('A. 培养人'));
    await tester.pump();
    await tapKey(tester, 'agent_set_primary_button');
    await settle(tester);

    expect(practice.submittedAnswers, <String>['A']);
    // 判分打到 attempts 建出来的那一场会话（901），不是别的
    expect(practice.submittedSessionIds, <String>['901']);
    // 断网降级要靠整场题序重建本地会话
    expect(practice.submittedSessionQuestionIds.single, <String>['11', '12']);

    expect(find.text('答错了'), findsOneWidget);
    expect(find.text('正确答案：B'), findsOneWidget);
  });

  testWidgets('多选提交 JSON 数组；最后一题答完进入完成态并报本轮战绩', (tester) async {
    final adapter = practiceAdapter();
    final practice = RecordingPracticeRepository();

    await pumpPractice(tester, adapter: adapter, practice: practice);

    // 第一题：答对
    await tester.tap(find.text('A. 培养人'));
    await tester.pump();
    await tapKey(tester, 'agent_set_primary_button');
    await settle(tester);
    await tapKey(tester, 'agent_set_primary_button'); // 下一题
    await settle(tester);

    expect(find.text('第二题'), findsOneWidget);
    expect(find.text('多选题'), findsOneWidget);
    expect(find.text('第 2/2 题'), findsOneWidget);

    // 第二题：多选 A + C（顺序按字母排好再发）
    await tester.tap(find.text('C. 选拔人才'));
    await tester.pump();
    await tester.tap(find.text('A. 培养人'));
    await tester.pump();
    await tapKey(tester, 'agent_set_primary_button');
    await settle(tester);

    expect(practice.submittedAnswers.last, '["A","C"]');

    // 最后一题判完，主按钮变成「完成这套题」
    await tapKey(tester, 'agent_set_primary_button');
    await settle(tester);

    expect(find.text('这套题做完了'), findsOneWidget);
    expect(find.text('这轮做了 2 题，答对 2 题。'), findsOneWidget);
  });

  testWidgets('这题有问题：二次确认带原因 → 请求体带 reason → 提示剩余并移除该题', (tester) async {
    final adapter = practiceAdapter(remaining: 1);
    final practice = RecordingPracticeRepository();

    await pumpPractice(tester, adapter: adapter, practice: practice);

    await tapKey(tester, 'agent_set_flag_button');
    await tester.pump();

    expect(find.text('这题有什么问题？'), findsOneWidget);
    await tester.enterText(
      find.byKey(const ValueKey<String>('agent_set_flag_reason')),
      '答案有误',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('agent_set_flag_confirm')),
    );
    await settle(tester);

    final flag = adapter.posts.last;
    expect(flag.path, '/agent-sets/12/questions/11/flag');
    expect(flag.data, <String, dynamic>{'reason': '答案有误'});

    expect(find.text('已移出这道题，还剩 1 题'), findsOneWidget);
    // 被移出的题不再出现，页面落到第二题
    expect(find.text('第一题'), findsNothing);
    expect(find.text('第二题'), findsOneWidget);
    expect(find.text('第 1/1 题'), findsOneWidget);
  });

  testWidgets('只剩一题时标错：进入完成态并报「另有 N 道被移出」', (tester) async {
    final adapter = AgentSetsStubAdapter((options) {
      final path = options.path;
      if (path == '/agent-sets/12') {
        // 详情里已经有 2 道被移出（flaggedCount），只剩 1 道可做
        return agentSetsJson(
          agentSetDetailJson(
            set: agentSetJson(
              id: 12,
              title: '教育目的专项',
              questionCount: 3,
              pendingCount: 1,
            ),
            questions: <Map<String, dynamic>>[
              agentQuestionJson(id: 11, content: '第一题'),
            ],
            flaggedCount: 2,
          ),
        );
      }
      if (path.endsWith('/attempts')) {
        return agentSetsJson(
          agentSetAttemptJson(
            questions: <Map<String, dynamic>>[
              agentQuestionJson(id: 11, content: '第一题'),
            ],
          ),
        );
      }
      if (path.endsWith('/flag')) {
        return agentSetsJson(agentFlagJson(questionId: 11, remaining: 0));
      }
      return agentSetsJson(<String, dynamic>{
        'message': '未预置',
      }, statusCode: 500);
    });
    final practice = RecordingPracticeRepository();

    await pumpPractice(tester, adapter: adapter, practice: practice);

    await tapKey(tester, 'agent_set_flag_button');
    await tester.pump();
    await tester.tap(
      find.byKey(const ValueKey<String>('agent_set_flag_confirm')),
    );
    await settle(tester);

    expect(find.text('已移出这道题，这套题没有可做的题了'), findsOneWidget);
    expect(find.text('这套题已经做完了'), findsOneWidget);
    // 2（详情里已有）+ 1（本轮）——完成态要把累计数报出来，别让人以为是凭空少了题
    expect(find.textContaining('另有 3 道题标了「有问题」被移出'), findsOneWidget);
  });

  testWidgets('这题有问题：点取消不发请求，题还在', (tester) async {
    final adapter = practiceAdapter();
    final practice = RecordingPracticeRepository();

    await pumpPractice(tester, adapter: adapter, practice: practice);
    final before = adapter.posts.length;

    await tapKey(tester, 'agent_set_flag_button');
    await tester.pump();
    await tester.tap(find.text('取消'));
    await settle(tester);

    expect(adapter.posts, hasLength(before));
    expect(find.text('第一题'), findsOneWidget);
  });

  testWidgets('一键成卷：确认后调题集成卷接口，并直接进试卷预览', (tester) async {
    final adapter = practiceAdapter();
    final practice = RecordingPracticeRepository();

    await pumpPractice(tester, adapter: adapter, practice: practice);

    await tapKey(tester, 'agent_set_paper_button');
    await tester.pump();

    expect(find.text('把剩下的题组成一张卷？'), findsOneWidget);
    await tester.tap(
      find.byKey(const ValueKey<String>('agent_set_paper_confirm')),
    );
    await settle(tester);

    expect(
      adapter.posts.map((request) => request.path),
      contains('/agent-sets/12/paper'),
    );
    expect(find.text('试卷预览'), findsOneWidget);
  });

  testWidgets('转正入库：确认后调转正接口，按钮变「已转正」并提示题数', (tester) async {
    final adapter = practiceAdapter();
    final practice = RecordingPracticeRepository();

    await pumpPractice(tester, adapter: adapter, practice: practice);

    await tapKey(tester, 'agent_set_promote_button');
    await tester.pump();

    expect(find.text('把题转进题库？'), findsOneWidget);
    await tester.tap(
      find.byKey(const ValueKey<String>('agent_set_promote_confirm')),
    );
    await settle(tester);

    expect(
      adapter.posts.map((request) => request.path),
      contains('/agent-sets/12/promote'),
    );
    expect(find.text('已转正 2 道题，可以在题库里找到它们了'), findsOneWidget);
    expect(find.text('已转正'), findsOneWidget);
  });

  testWidgets('题集已无待做题：不建空会话，直接给完成态', (tester) async {
    final adapter = AgentSetsStubAdapter(
      (_) => agentSetsJson(
        agentSetDetailJson(
          set: agentSetJson(id: 12, questionCount: 2, pendingCount: 0),
          questions: const <Map<String, dynamic>>[],
        ),
      ),
    );
    final practice = RecordingPracticeRepository();

    await pumpPractice(tester, adapter: adapter, practice: practice);

    expect(find.text('这套题已经做完了'), findsOneWidget);
    // 没有可做的题就不该开会话（否则是一张空卷）
    expect(adapter.posts, isEmpty);
  });

  testWidgets('加载失败：错误页可重试，重试成功就能做题', (tester) async {
    var failNext = true;
    final base = practiceAdapter();
    final adapter = AgentSetsStubAdapter((options) {
      if (options.path == '/agent-sets/12' && failNext) {
        failNext = false;
        return agentSetsJson(<String, dynamic>{
          'message': '稍后再试',
        }, statusCode: 503);
      }
      return base.handler(options);
    });
    final practice = RecordingPracticeRepository();

    await pumpPractice(tester, adapter: adapter, practice: practice);

    expect(find.text('加载失败'), findsOneWidget);
    expect(find.textContaining('503'), findsOneWidget);

    await tester.tap(find.text('重试'));
    await settle(tester);

    expect(find.text('第一题'), findsOneWidget);
  });

  testWidgets('判分失败：失败原因就地展示，不把作答吞掉', (tester) async {
    final adapter = practiceAdapter();
    final practice = RecordingPracticeRepository()
      ..submitError = Exception('boom');

    await pumpPractice(tester, adapter: adapter, practice: practice);

    await tester.tap(find.text('A. 培养人'));
    await tester.pump();
    await tapKey(tester, 'agent_set_primary_button');
    await settle(tester);

    expect(find.text('出了一点问题，稍后再试。'), findsOneWidget);
    // 判分没成功：结果条不出现，选项仍可改
    expect(find.text('答错了'), findsNothing);
    expect(find.text('正确答案：B'), findsNothing);
  });
}
