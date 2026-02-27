import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:mobile_app/features/practice/domain/practice_repository.dart';
import 'package:mobile_app/features/practice/data/practice_repository_impl.dart';
import 'package:mobile_app/features/practice/domain/practice_session.dart';
import 'package:mobile_app/features/practice/domain/question.dart';
import 'package:mobile_app/features/practice/presentation/practice_provider.dart';

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
}
