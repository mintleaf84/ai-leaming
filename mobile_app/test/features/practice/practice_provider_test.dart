import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:mobile_app/features/practice/domain/first_principles_response.dart';
import 'package:mobile_app/features/practice/domain/practice_repository.dart';
import 'package:mobile_app/features/practice/data/practice_repository_impl.dart';
import 'package:mobile_app/features/practice/domain/practice_session.dart';
import 'package:mobile_app/features/practice/domain/question.dart';
import 'package:mobile_app/features/practice/presentation/practice_provider.dart';
import 'package:mobile_app/core/storage/preferences.dart';

import '../../support/fake_preferences_store.dart';

class MockPracticeRepository extends Mock implements PracticeRepository {}

void main() {
  late MockPracticeRepository mockRepository;

  setUpAll(() {
    // 为 FlutterSecureStorage 设置测试桩数据，绕开 Platform Channel 异常
    FlutterSecureStorage.setMockInitialValues({'jwt_token': 'test_token'});
    registerFallbackValue(
      const PracticeSession(sessionId: 'dummy', questions: []),
    );
  });

  setUp(() {
    mockRepository = MockPracticeRepository();
  });

  ProviderContainer makeProviderContainer(
    MockPracticeRepository practiceRepository,
  ) {
    final container = ProviderContainer(
      overrides: [
        practiceRepositoryProvider.overrideWithValue(practiceRepository),
        // 控制器现在会顺手写「未完成练习」断点：内存实现，
        // 不碰 shared_preferences 的平台通道（否则每条用例都会打一行 binding 警告）
        preferencesStoreProvider.overrideWithValue(FakePreferencesStore()),
      ],
    );
    addTearDown(container.dispose);
    return container;
  }

  group('PracticeController 单元测试', () {
    final tQuestions = [
      const Question(
        id: '1',
        content: '测试题1',
        options: ['A', 'B', 'C', 'D'],
        type: 'single',
      ),
      const Question(
        id: '2',
        content: '测试题2',
        options: ['A', 'B', 'C', 'D'],
        type: 'single',
      ),
    ];

    test('createSession() 正常流转与初始化', () async {
      // 1. Arrange
      final container = makeProviderContainer(mockRepository);

      when(
        () => mockRepository.createSession(limit: any(named: 'limit')),
      ).thenAnswer(
        (_) async =>
            PracticeSession(sessionId: 'session_123', questions: tQuestions),
      );

      // 2. Act
      final notifier = container.read(practiceControllerProvider.notifier);
      await notifier.createSession(limit: 2);

      // 3. Assert
      final state = container.read(practiceControllerProvider);
      expect(state.isLoading, false);
      expect(state.error, null);
      expect(state.sessionId, 'session_123');
      expect(state.questions.length, 2);
      expect(state.currentIndex, 0);
      verify(() => mockRepository.createSession(limit: 2)).called(1);
    });

    test('selectAnswer() 与 submitCurrentAnswer() 的判定闭环', () async {
      // 1. Arrange
      final container = makeProviderContainer(mockRepository);
      when(() => mockRepository.createSession(limit: 2)).thenAnswer(
        (_) async => PracticeSession(sessionId: 's', questions: tQuestions),
      );

      when(
        () => mockRepository.submitAnswer(
          sessionId: any(named: 'sessionId'),
          questionId: any(named: 'questionId'),
          userAnswer: any(named: 'userAnswer'),
          duration: any(named: 'duration'),
          sessionQuestionIds: any(named: 'sessionQuestionIds'),
          // 控制器现在会把当前模式一起带上（断网降级建本地会话要用）
          mode: any(named: 'mode'),
        ),
      ).thenAnswer((_) async => {'isCorrect': true, 'correctAnswer': 'A'});

      when(() => mockRepository.getQuestionDetail(any())).thenAnswer(
        (_) async => const Question(
          id: '1',
          content: '',
          options: [],
          explanation: '这里是权威解析',
        ),
      );

      final notifier = container.read(practiceControllerProvider.notifier);
      await notifier.createSession(limit: 2);

      // 2. Act: 选择答案
      notifier.selectAnswer('A');

      // 3. Assert state after select
      var state = container.read(practiceControllerProvider);
      expect(state.userAnswers['1'], ['A']); // 第一题被选中了 A

      // 4. Act: 提交答案
      await notifier.submitCurrentAnswer();

      // 5. Assert final result
      state = container.read(practiceControllerProvider);
      expect(state.results['1'], true); // 判定结果为正确
      expect(state.correctAnswers['1'], 'A');
      expect(state.explanations['1'], '这里是权威解析');
    });

    test('nextQuestion() 状态流转', () async {
      final container = makeProviderContainer(mockRepository);
      when(() => mockRepository.createSession(limit: 2)).thenAnswer(
        (_) async => PracticeSession(sessionId: 's', questions: tQuestions),
      );

      final notifier = container.read(practiceControllerProvider.notifier);
      await notifier.createSession(limit: 2);

      // Act
      notifier.nextQuestion();

      // Assert
      final state = container.read(practiceControllerProvider);
      expect(state.currentIndex, 1);
      expect(state.currentQuestion?.id, '2');
      expect(state.hasNext, false); // 只有两题，现在在第2题，不能继续往下了
      expect(state.hasPrev, true);
    });

    test('toggleAnswer() 多选题 toggle 行为', () async {
      final multiQuestions = [
        const Question(
          id: '10',
          content: '多选题测试',
          options: ['A', 'B', 'C', 'D'],
          type: 'multi',
        ),
      ];

      final container = makeProviderContainer(mockRepository);
      when(() => mockRepository.createSession(limit: 1)).thenAnswer(
        (_) async => PracticeSession(sessionId: 's', questions: multiQuestions),
      );

      final notifier = container.read(practiceControllerProvider.notifier);
      await notifier.createSession(limit: 1);

      // 选 A
      notifier.toggleAnswer('A');
      var state = container.read(practiceControllerProvider);
      expect(state.userAnswers['10'], ['A']);

      // 再选 C
      notifier.toggleAnswer('C');
      state = container.read(practiceControllerProvider);
      expect(state.userAnswers['10'], ['A', 'C']);

      // 取消 A
      notifier.toggleAnswer('A');
      state = container.read(practiceControllerProvider);
      expect(state.userAnswers['10'], ['C']);
    });
  });

  group('第一性原理失败态（面板专用字段）', () {
    /// 造一场已就绪的练习：`fetchFirstPrinciples` 需要会话里有这道题。
    Future<ProviderContainer> readyContainer() async {
      final container = makeProviderContainer(mockRepository);
      when(() => mockRepository.createSession(limit: any(named: 'limit')))
          .thenAnswer(
            (_) async => const PracticeSession(
              sessionId: 'session_1',
              questions: [
                Question(
                  id: '1',
                  content: '测试题1',
                  options: ['A', 'B', 'C', 'D'],
                  type: 'single',
                ),
              ],
            ),
          );
      await container.read(practiceControllerProvider.notifier).createSession();
      return container;
    }

    test('失败只写 firstPrinciplesError，不污染整场 error；成功后清空', () async {
      final container = await readyContainer();
      Object? failure = Exception('socket closed');

      when(
        () => mockRepository.analyzeFirstPrinciples(
          questionContent: any(named: 'questionContent'),
          correctAnswer: any(named: 'correctAnswer'),
          explanation: any(named: 'explanation'),
          wrongAnswer: any(named: 'wrongAnswer'),
        ),
      ).thenAnswer((_) async {
        if (failure != null) throw failure;
        return const FirstPrinciplesResponse(
          analysis: '【答案】B',
          cached: false,
        );
      });

      final notifier = container.read(practiceControllerProvider.notifier);
      await notifier.fetchFirstPrinciples('1');

      var state = container.read(practiceControllerProvider);
      expect(state.isAnalyzingFirstPrinciples, false);
      expect(
        state.firstPrinciplesError,
        '获取 AI 分析失败：出了点问题，请重试',
        reason: '面板要能显示一句人话，而不是原始异常',
      );
      expect(
        state.error,
        isNull,
        reason: '整场练习的 error 会驱动练习页的整屏失败态，不能被 AI 分析失败占用',
      );

      // 重试成功：结果落地，旧错误一起清掉。
      failure = null;
      await notifier.fetchFirstPrinciples('1');

      state = container.read(practiceControllerProvider);
      expect(state.firstPrinciplesError, isNull);
      expect(state.firstPrinciples['1']?.analysis, '【答案】B');
    });

    test('重试开始时先清掉上一次的错误（不会一边转圈一边红字）', () async {
      final container = await readyContainer();
      Object? failure = Exception('socket closed');
      final gate = Completer<void>();

      when(
        () => mockRepository.analyzeFirstPrinciples(
          questionContent: any(named: 'questionContent'),
          correctAnswer: any(named: 'correctAnswer'),
          explanation: any(named: 'explanation'),
          wrongAnswer: any(named: 'wrongAnswer'),
        ),
      ).thenAnswer((_) async {
        if (failure != null) throw failure;
        await gate.future;
        return const FirstPrinciplesResponse(
          analysis: '【答案】B',
          cached: false,
        );
      });

      final notifier = container.read(practiceControllerProvider.notifier);
      await notifier.fetchFirstPrinciples('1');
      expect(
        container.read(practiceControllerProvider).firstPrinciplesError,
        isNotNull,
      );

      // 第二次请求挂住：此刻应当只有「正在分析」，没有旧错误。
      failure = null;
      final retry = notifier.fetchFirstPrinciples('1');
      await Future<void>.delayed(Duration.zero);

      final state = container.read(practiceControllerProvider);
      expect(state.isAnalyzingFirstPrinciples, true);
      expect(state.firstPrinciplesError, isNull);

      gate.complete();
      await retry;
      expect(container.read(practiceControllerProvider).firstPrinciplesError, isNull);
    });

    test('换题（nextQuestion）清掉上一题的错误', () async {
      final container = makeProviderContainer(mockRepository);
      when(() => mockRepository.createSession(limit: any(named: 'limit')))
          .thenAnswer(
            (_) async => const PracticeSession(
              sessionId: 'session_1',
              questions: [
                Question(
                  id: '1',
                  content: '测试题1',
                  options: ['A', 'B', 'C', 'D'],
                  type: 'single',
                ),
                Question(
                  id: '2',
                  content: '测试题2',
                  options: ['A', 'B', 'C', 'D'],
                  type: 'single',
                ),
              ],
            ),
          );
      when(
        () => mockRepository.analyzeFirstPrinciples(
          questionContent: any(named: 'questionContent'),
          correctAnswer: any(named: 'correctAnswer'),
          explanation: any(named: 'explanation'),
          wrongAnswer: any(named: 'wrongAnswer'),
        ),
      ).thenThrow(Exception('socket closed'));

      final notifier = container.read(practiceControllerProvider.notifier);
      await notifier.createSession();
      await notifier.fetchFirstPrinciples('1');
      expect(
        container.read(practiceControllerProvider).firstPrinciplesError,
        isNotNull,
      );

      notifier.nextQuestion();
      expect(
        container.read(practiceControllerProvider).firstPrinciplesError,
        isNull,
        reason: '换到下一题还挂着上一题的失败红字，用户会以为是这道题的分析失败',
      );
    });
  });
}
