import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:mobile_app/features/practice/domain/practice_repository.dart';
import 'package:mobile_app/features/practice/data/practice_repository_impl.dart';
import 'package:mobile_app/features/practice/domain/question.dart';
import 'package:mobile_app/features/practice/presentation/questions_provider.dart';

class MockPracticeRepository extends Mock implements PracticeRepository {}

void main() {
  late MockPracticeRepository mockRepository;

  setUp(() {
    mockRepository = MockPracticeRepository();
  });

  ProviderContainer makeProviderContainer() {
    final container = ProviderContainer(
      overrides: [practiceRepositoryProvider.overrideWithValue(mockRepository)],
    );
    addTearDown(container.dispose);
    return container;
  }

  group('QuestionsController 单元测试', () {
    final tResponse1 = QuestionListResponse(
      items: [
        const Question(id: '1', content: '题1', options: [], type: 'single'),
        const Question(id: '2', content: '题2', options: [], type: 'single'),
      ],
      total: 5,
    );

    final tResponse2 = QuestionListResponse(
      items: [
        const Question(id: '3', content: '题3', options: [], type: 'single'),
        const Question(id: '4', content: '题4', options: [], type: 'single'),
        const Question(id: '5', content: '题5', options: [], type: 'single'),
      ],
      total: 5,
    );

    test('初次加载及分页无限滚动 (fetchQuestions)', () async {
      // 1. Arrange
      final container = makeProviderContainer();
      when(
        () => mockRepository.getQuestions(page: 1, limit: any(named: 'limit')),
      ).thenAnswer((_) async => tResponse1);

      final notifier = container.read(questionsControllerProvider.notifier);

      // 2. Act: 加载首页
      await notifier.fetchQuestions();

      // 3. Assert
      var state = container.read(questionsControllerProvider);
      expect(state.items.length, 2);
      expect(state.currentPage, 2); // 完毕后指针+1
      expect(state.hasMore, true); // 只有2条，总共5条

      // 4. Act: 模拟触发滚动拉取下一页
      when(
        () => mockRepository.getQuestions(page: 2, limit: any(named: 'limit')),
      ).thenAnswer((_) async => tResponse2);

      await notifier.fetchQuestions();

      // 5. Assert: 数据合并
      state = container.read(questionsControllerProvider);
      expect(state.items.length, 5);
      expect(state.hasMore, false); // 取满了

      // 验证网络发起了 2 次串行请求
      verify(() => mockRepository.getQuestions(page: 1, limit: 20)).called(1);
      verify(() => mockRepository.getQuestions(page: 2, limit: 20)).called(1);
    });

    test('下拉刷新覆盖原列表 (refresh)', () async {
      final container = makeProviderContainer();
      // 这里假装已经在第二页了
      when(
        () => mockRepository.getQuestions(page: 1, limit: 20),
      ).thenAnswer((_) async => tResponse1);

      final notifier = container.read(questionsControllerProvider.notifier);
      await notifier.refresh(); // 刷新会使 currentPage = 1

      final state = container.read(questionsControllerProvider);
      expect(state.items.length, 2);
      expect(state.currentPage, 2);
      verify(() => mockRepository.getQuestions(page: 1, limit: 20)).called(1);
    });
  });
}
