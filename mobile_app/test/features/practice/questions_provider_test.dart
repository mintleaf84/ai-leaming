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

    test('加载失败时 error 是面向用户的文案，不是原始异常', () async {
      final container = makeProviderContainer();
      when(
        () => mockRepository.getQuestions(page: 1, limit: any(named: 'limit')),
      ).thenThrow(Exception('boom: socket closed'));

      final notifier = container.read(questionsControllerProvider.notifier);
      await notifier.fetchQuestions();

      final state = container.read(questionsControllerProvider);
      expect(state.isLoading, isFalse);
      expect(state.error, isNotNull);
      // 用户可见文案里不能出现原始异常内容
      expect(state.error, isNot(contains('boom')));
      expect(state.items, isEmpty);
    });

    test('翻页失败时保留已上屏的题目，错误只体现在 error', () async {
      final container = makeProviderContainer();
      when(
        () => mockRepository.getQuestions(page: 1, limit: any(named: 'limit')),
      ).thenAnswer((_) async => tResponse1);

      final notifier = container.read(questionsControllerProvider.notifier);
      await notifier.fetchQuestions();

      when(
        () => mockRepository.getQuestions(page: 2, limit: any(named: 'limit')),
      ).thenThrow(Exception('boom'));

      await notifier.fetchQuestions();

      final state = container.read(questionsControllerProvider);
      expect(state.items.length, 2, reason: '已加载的题目不能被一次翻页失败清空');
      expect(state.error, isNotNull);
      expect(state.isLoading, isFalse);
    });

    test('applySearch 清空列表并从第 1 页重查', () async {
      final container = makeProviderContainer();
      when(
        () => mockRepository.getQuestions(
          page: any(named: 'page'),
          limit: any(named: 'limit'),
          search: any(named: 'search'),
        ),
      ).thenAnswer((_) async => tResponse1);

      final notifier = container.read(questionsControllerProvider.notifier);
      await notifier.applySearch('  教育  ');

      final state = container.read(questionsControllerProvider);
      expect(state.search, '教育', reason: '关键词要 trim');
      expect(state.currentPage, 2, reason: '重查完成后指针前进一页');
      expect(state.error, isNull);
      verify(
        () => mockRepository.getQuestions(page: 1, limit: 20, search: '教育'),
      ).called(1);
    });
  });
}
