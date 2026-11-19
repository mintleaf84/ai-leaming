// 骨架屏专用假数据。
//
// 目的：`Skeletonizer(enabled: true, child: ...)` 需要真实的数据才能撑出真实布局
// （见 docs/mobile-ui-kit.md D-2）。这些实例只允许出现在各屏的 `_buildSkeleton()`
// 里，字段值一律写成明显的假值，禁止接到真实数据链路（provider / repository）。
//
// 引用约束（review 时人工核对）：
//   只允许 `lib/features/*/presentation/*_screen.dart` 与 `lib/shared/skeletons/**`
//   引用本文件；其它位置出现即为泄漏。

import '../../features/history/domain/history_item.dart';
import '../../features/history/domain/practice_log.dart';
import '../../features/knowledge/presentation/knowledge_provider.dart';
import '../../features/practice/domain/question.dart';
import '../../features/practice/presentation/practice_provider.dart';
import '../../features/stats/domain/learning_stats.dart';
import '../../features/wrong_book/domain/wrong_question.dart';

/// 骨架里统一使用的占位文本（长度足够撑出多行布局）。
const String kSkeletonText = '骨架占位文本用于撑开布局';

/// 骨架里统一使用的占位标签。
const List<String> kSkeletonTags = <String>['考点一', '考点二'];

HistoryItem fakeHistoryItem({int index = 0}) {
  return HistoryItem(
    id: 'skeleton-$index',
    sessionName: kSkeletonText,
    totalQuestions: 20,
    correctCount: 15,
    reviewCount: 3,
    createdAt: DateTime(2026, 1, 1, 9, 30).toIso8601String(),
    accuracy: 75,
    practiceMode: 'random',
  );
}

PracticeLog fakePracticeLog({int index = 0}) {
  return PracticeLog(
    questionId: 9000 + index,
    questionContent: kSkeletonText,
    options: const <String>['选项 A', '选项 B', '选项 C', '选项 D'],
    correctAnswer: 'A',
    userAnswer: 'B',
    isCorrect: false,
    duration: 45,
    tags: kSkeletonTags,
    explanation: kSkeletonText,
  );
}

KnowledgeCard fakeKnowledgeCard({int index = 0}) {
  return KnowledgeCard(
    id: 9000 + index,
    title: kSkeletonText,
    category: '教育学',
    tags: kSkeletonTags,
    front: kSkeletonText,
    back: kSkeletonText,
    keyPoints: <KeyPoint>[
      KeyPoint(term: '概念', definition: kSkeletonText),
    ],
    createdAt: '2026-01-01T09:30:00',
  );
}

WrongQuestion fakeWrongQuestion({int index = 0}) {
  return WrongQuestion(
    questionId: 'skeleton-$index',
    questionContent: kSkeletonText,
    tags: kSkeletonTags,
    wrongCount: 3,
    lastWrongAt: '2026-01-01T09:30:00',
    correctAnswer: 'A',
    userLastAnswer: 'B',
  );
}

Question fakeQuestion({int index = 0}) {
  return Question(
    id: 'skeleton-$index',
    content: kSkeletonText,
    options: const <String>['选项 A', '选项 B', '选项 C', '选项 D'],
    tags: kSkeletonTags,
    dimension: '教育学',
    explanation: kSkeletonText,
    answer: 'A',
  );
}

/// 首页（dashboard）统计骨架：撑开「今日进度卡 + 待办清单」的真实布局。
///
/// 数值全部写成整齐的假值（20 题 / 75% / 3 天），只为让文字占位条的
/// 长度接近真实数据；Skeletonizer 会把它们涂成骨块，用户看不到数字。
LearningStats fakeStatsSummary() {
  return const LearningStats(
    todayCount: 20,
    todayCorrect: 15,
    todayAccuracy: 0.75,
    totalCount: 320,
    totalCorrect: 240,
    overallAccuracy: 0.75,
    streakDays: 3,
    totalSessions: 16,
  );
}

/// 练习题屏的骨架状态：3 道假题，当前停在第 0 题。
PracticeSessionState fakePracticeSessionState() {
  return PracticeSessionState(
    sessionId: 'skeleton-session',
    questions: List<Question>.generate(3, (int i) => fakeQuestion(index: i)),
  );
}
