import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/wrong_book/data/wrong_book_repository.dart';
import 'package:mobile_app/features/wrong_book/domain/wrong_question.dart';
import 'package:mobile_app/features/wrong_book/presentation/wrong_book_provider.dart';

/// 这个测试守的是错题本的**聚合加载状态机**和**选择/批量练习的边界**：
///
/// 1. **三路并发的成败必须合成一个结论**：列表、按标签分组、统计是一起拉的，
///    任意一路失败都不能让界面停在「加载中」，也不能用「空列表」冒充成功——
///    否则用户看到的是「你没有错题」，实际上只是网络断了。
/// 2. **失败不清空已有数据**：一次失败的刷新不该把上屏的错题抹掉（这是
///    `copyWith` 里 `error` 无条件覆盖的副作用之一，另一面是失败后重试能清掉 error）。
/// 3. **选中集合与题目列表一致**：`selectAll` 的依据是「选中数 == 题目数」，
///    所以列表为空时点全选不能产生脏 id；换数据后旧选中不能被当成新列表的全选。
/// 4. **批量练习不伪造 session**：服务端 `success != true` 时 `startPractice`
///    必须返回 null，界面才不会跳进一个不存在的练习会话；且失败（异常或
///    `success=false`）必须落到 `error` 上，否则界面就是「点了没反应」。
/// 5. **换账号后旧数据整体替换**：重新加载必须整体覆盖（不是追加/合并），
///    统计数字也不能残留上一个账号的值。
class FakeWrongBookRepository extends WrongBookRepository {
  FakeWrongBookRepository() : super(Dio());

  List<WrongQuestion> questions = [];
  List<WrongQuestionsByTag> groupedByTag = [];
  WrongBookStats stats = const WrongBookStats();

  Object? questionsError;
  Object? groupedByTagError;
  Object? statsError;

  int questionsCalls = 0;
  int groupedByTagCalls = 0;
  int statsCalls = 0;

  /// 非 null 时统计接口会挂在这里，用来观察「加载中」的中间态。
  Completer<void>? statsGate;

  final List<List<String>> practiceRequests = [];
  Map<String, dynamic> practiceResponse = {
    'success': true,
    'sessionId': 'session_1',
  };
  Object? practiceError;

  final List<String> mastered = [];
  final List<String> unmastered = [];
  Object? masteredError;

  @override
  Future<List<WrongQuestion>> getWrongQuestions() async {
    questionsCalls++;
    final error = questionsError;
    if (error != null) throw error;
    return questions;
  }

  @override
  Future<List<WrongQuestionsByTag>> getWrongQuestionsByTag() async {
    groupedByTagCalls++;
    final error = groupedByTagError;
    if (error != null) throw error;
    return groupedByTag;
  }

  @override
  Future<WrongBookStats> getStats() async {
    statsCalls++;
    final gate = statsGate;
    if (gate != null) await gate.future;
    final error = statsError;
    if (error != null) throw error;
    return stats;
  }

  @override
  Future<Map<String, dynamic>> createPractice(List<String> questionIds) async {
    practiceRequests.add(List<String>.from(questionIds));
    final error = practiceError;
    if (error != null) throw error;
    return practiceResponse;
  }

  @override
  Future<void> markAsMastered(String questionId) async {
    final error = masteredError;
    if (error != null) throw error;
    mastered.add(questionId);
  }

  @override
  Future<void> unmarkMastered(String questionId) async {
    final error = masteredError;
    if (error != null) throw error;
    unmastered.add(questionId);
  }
}

WrongQuestion question(String id) => WrongQuestion(
  questionId: id,
  questionContent: '题目 $id',
  tags: const ['教育目的'],
  wrongCount: 1,
  lastWrongAt: '2026-11-18T10:00:00.000Z',
  correctAnswer: 'A',
  userLastAnswer: 'B',
);

void main() {
  late FakeWrongBookRepository repository;

  setUp(() {
    repository = FakeWrongBookRepository();
    repository.questions = [question('q1'), question('q2')];
    repository.groupedByTag = [
      WrongQuestionsByTag(
        tag: '教育目的',
        count: 2,
        questions: [question('q1'), question('q2')],
      ),
    ];
    repository.stats = const WrongBookStats(total: 2, recent: 1, frequent: 1);
  });

  ProviderContainer makeContainer() {
    final container = ProviderContainer(
      retry: (_, _) => null,
      overrides: [wrongBookRepositoryProvider.overrideWithValue(repository)],
    );
    addTearDown(container.dispose);
    return container;
  }

  group('初始状态', () {
    test('默认为列表视图、无数据、非加载中、无错误', () {
      final container = makeContainer();

      final state = container.read(wrongBookControllerProvider);

      expect(state.questions, isEmpty);
      expect(state.groupedByTag, isEmpty);
      expect(state.stats.total, 0);
      expect(state.selectedIds, isEmpty);
      expect(state.viewMode, WrongBookViewMode.list);
      expect(state.isLoading, isFalse);
      expect(state.error, isNull);
      expect(state.isCreatingPractice, isFalse);
      expect(repository.questionsCalls, 0, reason: '初始态不发请求，由界面显式触发加载');
    });
  });

  group('loadData 状态机', () {
    test('成功后三路数据都落到状态，加载中标记退出', () async {
      final container = makeContainer();

      await container.read(wrongBookControllerProvider.notifier).loadData();

      final state = container.read(wrongBookControllerProvider);
      expect(repository.questionsCalls, 1);
      expect(repository.groupedByTagCalls, 1);
      expect(repository.statsCalls, 1);
      expect(state.questions.length, 2);
      expect(state.groupedByTag.single.tag, '教育目的');
      expect(state.stats.total, 2);
      expect(state.isLoading, isFalse);
      expect(state.error, isNull);
    });

    test('加载期间处于 loading 且已清掉上一次的 error', () async {
      final container = makeContainer();
      final notifier = container.read(wrongBookControllerProvider.notifier);
      // 先制造一次失败，留下 error
      repository.statsError = Exception('500');
      await notifier.loadData();
      expect(container.read(wrongBookControllerProvider).error, '加载失败');

      // 这一次让统计接口挂住，观察中间态
      repository.statsError = null;
      repository.statsGate = Completer<void>();
      unawaited(notifier.loadData());
      await pumpEventQueue();

      final loading = container.read(wrongBookControllerProvider);
      expect(loading.isLoading, isTrue);
      expect(
        loading.error,
        isNull,
        reason: '重试开始就要清掉旧错误，否则界面会同时显示 spinner 和报错',
      );

      repository.statsGate!.complete();
      await pumpEventQueue();
      expect(container.read(wrongBookControllerProvider).isLoading, isFalse);
    });

    test('任一路失败都落到 error，且不用空列表冒充成功', () async {
      repository.statsError = Exception('统计 500');
      final container = makeContainer();

      await container.read(wrongBookControllerProvider.notifier).loadData();

      final state = container.read(wrongBookControllerProvider);
      expect(state.error, '加载失败');
      expect(state.isLoading, isFalse);
      expect(state.questions, isEmpty, reason: '失败时不能把没拿到的数据当空列表展示');
    });

    test('失败不清空已经上屏的错题', () async {
      final container = makeContainer();
      final notifier = container.read(wrongBookControllerProvider.notifier);
      await notifier.loadData();
      expect(container.read(wrongBookControllerProvider).questions.length, 2);

      repository.groupedByTagError = Exception('分组挂了');
      await notifier.loadData();

      final state = container.read(wrongBookControllerProvider);
      expect(state.error, '加载失败');
      expect(state.questions.length, 2, reason: '刷新失败不该把已有列表抹掉');
    });

    test('失败后重试成功，error 被清空', () async {
      final container = makeContainer();
      final notifier = container.read(wrongBookControllerProvider.notifier);
      repository.questionsError = Exception('500');
      await notifier.loadData();
      expect(container.read(wrongBookControllerProvider).error, '加载失败');

      repository.questionsError = null;
      await notifier.loadData();

      final state = container.read(wrongBookControllerProvider);
      expect(state.error, isNull);
      expect(state.questions.length, 2);
    });
  });

  group('视图与选择', () {
    test('setViewMode 在三种视图间切换', () async {
      final container = makeContainer();
      final notifier = container.read(wrongBookControllerProvider.notifier);

      notifier.setViewMode(WrongBookViewMode.byTag);
      expect(
        container.read(wrongBookControllerProvider).viewMode,
        WrongBookViewMode.byTag,
      );

      notifier.setViewMode(WrongBookViewMode.mastered);
      expect(
        container.read(wrongBookControllerProvider).viewMode,
        WrongBookViewMode.mastered,
      );

      notifier.setViewMode(WrongBookViewMode.list);
      expect(
        container.read(wrongBookControllerProvider).viewMode,
        WrongBookViewMode.list,
      );
    });

    test('toggleSelect 点一次选中、再点一次取消', () {
      final container = makeContainer();
      final notifier = container.read(wrongBookControllerProvider.notifier);

      notifier.toggleSelect('q1');
      expect(container.read(wrongBookControllerProvider).selectedIds, {'q1'});

      notifier.toggleSelect('q2');
      expect(container.read(wrongBookControllerProvider).selectedIds, {
        'q1',
        'q2',
      });

      notifier.toggleSelect('q1');
      expect(container.read(wrongBookControllerProvider).selectedIds, {'q2'});
    });

    test('selectAll 在未全选时全选、全选时清空', () async {
      final container = makeContainer();
      final notifier = container.read(wrongBookControllerProvider.notifier);
      await notifier.loadData();

      notifier.selectAll();
      expect(container.read(wrongBookControllerProvider).selectedIds, {
        'q1',
        'q2',
      });

      notifier.selectAll();
      expect(container.read(wrongBookControllerProvider).selectedIds, isEmpty);
    });

    test('题目为空时 selectAll 不产生脏 id', () {
      final container = makeContainer();
      final notifier = container.read(wrongBookControllerProvider.notifier);

      notifier.selectAll();

      expect(container.read(wrongBookControllerProvider).selectedIds, isEmpty);
    });
  });

  group('批量练习', () {
    test('未选任何题时不发请求、返回 null', () async {
      final container = makeContainer();

      final sessionId = await container
          .read(wrongBookControllerProvider.notifier)
          .startPractice();

      expect(sessionId, isNull);
      expect(
        repository.practiceRequests,
        isEmpty,
        reason: '空选择打服务端只会造出一个空练习会话',
      );
    });

    test('成功时把选中的 id 原样发出并返回 sessionId', () async {
      final container = makeContainer();
      final notifier = container.read(wrongBookControllerProvider.notifier);
      await notifier.loadData();
      notifier.toggleSelect('q2');

      final sessionId = await notifier.startPractice();

      expect(repository.practiceRequests.single, ['q2']);
      expect(sessionId, 'session_1');
      expect(
        container.read(wrongBookControllerProvider).isCreatingPractice,
        isFalse,
      );
    });

    test('服务端 success=false 时返回 null、不伪造 sessionId，并暴露错误', () async {
      repository.practiceResponse = {'success': false, 'message': '题库为空'};
      final container = makeContainer();
      final notifier = container.read(wrongBookControllerProvider.notifier);
      notifier.toggleSelect('q1');

      final sessionId = await notifier.startPractice();

      final state = container.read(wrongBookControllerProvider);
      expect(sessionId, isNull);
      expect(state.isCreatingPractice, isFalse);
      expect(state.error, '创建练习失败，请重试', reason: '服务端明确拒绝也要可见，否则界面就是「点了没反应」');
    });

    test('请求抛异常时返回 null、退出 creating 态并暴露错误', () async {
      repository.practiceError = Exception('网络断了');
      final container = makeContainer();
      final notifier = container.read(wrongBookControllerProvider.notifier);
      notifier.toggleSelect('q1');

      final sessionId = await notifier.startPractice();

      final state = container.read(wrongBookControllerProvider);
      expect(sessionId, isNull);
      expect(state.isCreatingPractice, isFalse);
      expect(
        state.error,
        '创建练习失败，请重试',
        reason: '异常被吞掉时界面只能表现为「点了没反应」，必须落到 error 上',
      );
    });
  });

  group('标记掌握', () {
    test('标记已掌握会调用接口并重新拉取列表', () async {
      final container = makeContainer();
      final notifier = container.read(wrongBookControllerProvider.notifier);
      await notifier.loadData();
      final before = repository.questionsCalls;

      await notifier.markAsMastered('q1');

      expect(repository.mastered, ['q1']);
      expect(
        repository.questionsCalls,
        before + 1,
        reason: '标记后必须刷新，否则卡片仍停在错题列表里',
      );
    });

    test('取消掌握调用 DELETE 语义的接口并刷新', () async {
      final container = makeContainer();
      final notifier = container.read(wrongBookControllerProvider.notifier);
      await notifier.loadData();
      final before = repository.questionsCalls;

      await notifier.unmarkMastered('q2');

      expect(repository.unmastered, ['q2']);
      expect(repository.questionsCalls, before + 1);
    });

    test('标记失败不抛异常、暴露错误，也不清空现有列表', () async {
      repository.masteredError = Exception('500');
      final container = makeContainer();
      final notifier = container.read(wrongBookControllerProvider.notifier);
      await notifier.loadData();

      await notifier.markAsMastered('q1');

      final state = container.read(wrongBookControllerProvider);
      expect(state.questions.length, 2, reason: '失败不该把已上屏的错题抹掉');
      expect(state.error, '操作失败，请重试', reason: '失败必须可见，否则用户以为已经标记成功');
    });

    test('取消掌握失败同样暴露错误且列表不变', () async {
      repository.masteredError = Exception('500');
      final container = makeContainer();
      final notifier = container.read(wrongBookControllerProvider.notifier);
      await notifier.loadData();

      await notifier.unmarkMastered('q2');

      final state = container.read(wrongBookControllerProvider);
      expect(state.questions.length, 2);
      expect(state.error, '操作失败，请重试');
    });
  });

  group('换账号后的数据隔离', () {
    test('重新加载整体替换旧账号数据，不追加、不残留统计', () async {
      final container = makeContainer();
      final notifier = container.read(wrongBookControllerProvider.notifier);
      await notifier.loadData();
      expect(container.read(wrongBookControllerProvider).questions.length, 2);

      // 换账号：后端返回的是完全不同的数据集
      repository.questions = [question('other_1')];
      repository.groupedByTag = [
        WrongQuestionsByTag(
          tag: '班级管理',
          count: 1,
          questions: [question('other_1')],
        ),
      ];
      repository.stats = const WrongBookStats(total: 1);
      await notifier.loadData();

      final state = container.read(wrongBookControllerProvider);
      expect(
        state.questions.map((q) => q.questionId),
        ['other_1'],
        reason: '必须整体替换：追加会让 A 账号的题留在 B 账号里',
      );
      expect(state.groupedByTag.single.tag, '班级管理');
      expect(state.stats.total, 1, reason: '统计数字不能残留上一个账号的值');
    });
  });
}
