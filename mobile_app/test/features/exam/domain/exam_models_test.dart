import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/exam/domain/exam_attempt.dart';
import 'package:mobile_app/features/exam/domain/exam_generate_rules.dart';
import 'package:mobile_app/features/exam/domain/exam_paper.dart';
import 'package:mobile_app/features/exam/domain/exam_question.dart';
import 'package:mobile_app/features/exam/domain/exam_submit_result.dart';

import '../../../support/fakes_exam.dart';

void main() {
  group('ExamPaper：宽容解析', () {
    test('timed 卷保留时限，fixed 卷忽略服务端误带的 durationMinutes', () {
      final timed = ExamPaper.fromJson(
        examPaperJson(kind: 'timed', durationMinutes: 30),
      );
      expect(timed.isTimed, isTrue);
      expect(timed.durationLabel, '限时 30 分钟');

      final fixed = ExamPaper.fromJson(
        examPaperJson(kind: 'fixed', durationMinutes: 30),
      );
      expect(fixed.isTimed, isFalse);
      expect(fixed.durationMinutes, isNull, reason: '固定卷契约强制 NULL');
      expect(fixed.durationLabel, '不限时');
    });

    test('数字字符串 id、bestScore 与缺字段都能读', () {
      final paper = ExamPaper.fromJson(<String, dynamic>{
        'id': '7',
        'title': '',
        'kind': 'timed',
        'durationMinutes': '20',
        'totalQuestions': '15',
        'attemptCount': '2',
        'bestScore': '0.85',
      });
      expect(paper.id, 7);
      expect(paper.durationMinutes, 20);
      expect(paper.totalQuestions, 15);
      expect(paper.attemptCount, 2);
      expect(paper.bestScore, closeTo(0.85, 1e-9));
      expect(paper.title, '未命名试卷');
      expect(paper.source, 'manual');
    });
  });

  group('ExamPaperPage / ExamPaperDetail', () {
    test('列表兼容 data + meta 与 papers 两种包装', () {
      final wrapped = ExamPaperPage.fromJson(examPaperPageJson(total: 12));
      expect(wrapped.papers, hasLength(1));
      expect(wrapped.total, 12);
      expect(wrapped.limit, 50);

      final flat = ExamPaperPage.fromJson(<String, dynamic>{
        'papers': <Map<String, dynamic>>[examPaperJson(id: 2)],
      });
      expect(flat.papers.single.id, 2);
      expect(flat.total, 1, reason: '没有 meta 时用长度兜底，不显示 0');
    });

    test('详情：items 里的 question 被摊平时也能读，总数用 items 长度兜底', () {
      final detail = ExamPaperDetail.fromJson(<String, dynamic>{
        'paper': <String, dynamic>{
          'id': 3,
          'title': '小卷',
          'kind': 'fixed',
          'totalQuestions': 0,
        },
        'items': <Map<String, dynamic>>[
          <String, dynamic>{
            'position': 1,
            'id': 11,
            'content': '扁平题',
            'type': 'single',
            'options': <String>['甲', '乙'],
          },
          <String, dynamic>{
            'position': 2,
            'question': examQuestionJson(id: 12, type: 'truefalse'),
          },
        ],
        'lastAttempt': <String, dynamic>{
          'sessionId': 'session_1',
          'score': 0.5,
          'createdAt': '2026-11-20T08:00:00.000Z',
        },
      });
      expect(detail.items, hasLength(2));
      expect(detail.items.first.question.id, 11);
      expect(detail.items.first.question.content, '扁平题');
      expect(detail.paper.totalQuestions, 2);
      expect(detail.lastAttempt?.sessionId, 'session_1');
      expect(detail.lastAttempt?.score, 0.5);
      expect(detail.lastAttempt?.submittedAt, isNotNull);
    });

    test('没有 lastAttempt 时为 null（预览页据此不显示「上次作答」）', () {
      final detail = ExamPaperDetail.fromJson(examPaperDetailJson());
      expect(detail.lastAttempt, isNull);
    });
  });

  group('ExamQuestion', () {
    test('判断题没给选项时回落「正确/错误」，多选题标记正确', () {
      final question = ExamQuestion.fromJson(
        examQuestionJson(type: 'truefalse', options: const <String>[]),
      );
      expect(question.isTrueFalse, isTrue);
      expect(question.displayOptions, <String>['正确', '错误']);
      expect(question.typeLabel, '判断题');

      final multi = ExamQuestion.fromJson(examQuestionJson(type: 'multi'));
      expect(multi.isMulti, isTrue);
      expect(multi.typeLabel, '多选题');
    });

    test('题型未知时按单选题展示，不抛异常', () {
      final question = ExamQuestion.fromJson(<String, dynamic>{
        'id': 5,
        'content': '题',
        'options': <String>['A', 'B'],
        'type': 'essay',
      });
      expect(question.typeLabel, '题目');
      expect(question.isMulti, isFalse);
      expect(question.isFillBlank, isFalse);
    });
  });

  group('ExamAttempt / ExamAttemptDetail', () {
    test('sessionId 数字转字符串，deadlineAt 解析失败为 null', () {
      final attempt = ExamAttempt.fromJson(<String, dynamic>{
        'sessionId': 42,
        'paperId': '3',
        'deadlineAt': 'not-a-date',
        'questions': <Map<String, dynamic>>[examQuestionJson(id: 1)],
      });
      expect(attempt.sessionId, '42');
      expect(attempt.paperId, 3);
      expect(attempt.deadlineAt, isNull);
      expect(attempt.isTimed, isFalse);
      expect(attempt.questions.single.id, 1);
    });

    test('answers 支持 [{questionId,userAnswer}] 形状', () {
      final detail = ExamAttemptDetail.fromJson(
        examAttemptDetailJson(
          answers: <Map<String, dynamic>>[
            <String, dynamic>{'questionId': 1, 'userAnswer': 'A'},
            <String, dynamic>{'question_id': 2, 'user_answer': 'AB'},
            <String, dynamic>{'questionId': 0, 'userAnswer': 'X'},
          ],
        ),
      );
      expect(detail.answers, <int, String>{1: 'A', 2: 'AB'});
      expect(detail.isSubmitted, isFalse);
    });

    test('answers 支持 {"题号": "A"} 与数组作答', () {
      final detail = ExamAttemptDetail.fromJson(<String, dynamic>{
        'questions': <Map<String, dynamic>>[],
        'answers': <String, dynamic>{
          '1': 'A',
          '2': <String>['A', 'B'],
          'x': 'ignored',
        },
      });
      expect(detail.answers, <int, String>{1: 'A', 2: 'AB'});
    });

    test('已交卷：result 非空，sessionId 缺失时用路由参数兜底', () {
      final json = examAttemptDetailJson(result: examSubmitResultJson())
        ..remove('sessionId');
      final detail = ExamAttemptDetail.fromJson(
        json,
        fallbackSessionId: 'session_9',
      );
      expect(detail.sessionId, 'session_9');
      expect(detail.isSubmitted, isTrue);
      expect(detail.result?.correctCount, 1);
      expect(detail.paper?.id, 1);
    });
  });

  group('ExamSubmitResult', () {
    test('score 按 0–1 归一成百分制，accuracy 用总题数作分母', () {
      final result = ExamSubmitResult.fromJson(
        examSubmitResultJson(score: 0.5),
      );
      expect(result.percent, 50);
      expect(result.accuracy, 50);
      expect(result.wrongCount, 1);
    });

    test('服务端若已回百分制，不再乘 100', () {
      final result = ExamSubmitResult.fromJson(examSubmitResultJson(score: 85));
      expect(result.percent, closeTo(85, 1e-9));
    });

    test('totalQuestions 为 0 时正确率是 0 而不是 NaN', () {
      final result = ExamSubmitResult.fromJson(
        examSubmitResultJson(totalQuestions: 0, correctCount: 0, score: 0),
      );
      expect(result.accuracy, 0);
      expect(result.percent, 0);
    });

    test('perQuestion 缺失时为空表，不抛异常', () {
      final result = ExamSubmitResult.fromJson(<String, dynamic>{
        'score': 0,
        'correctCount': 0,
        'totalQuestions': 0,
        'durationMs': 0,
      });
      expect(result.perQuestion, isEmpty);
      expect(result.overtime, isFalse);
      expect(result.duplicate, isFalse);
    });

    test('examScorePercent 的边界：null/NaN 归 0，越界截断', () {
      expect(examScorePercent(null), 0);
      expect(examScorePercent(double.nan), 0);
      expect(examScorePercent(-1), 0);
      expect(
        examScorePercent(2),
        2,
        reason: '大于 1 按「已经是百分制」读，2 就是 2 分而不是 200%',
      );
      expect(examScorePercent(250), 100);
      expect(examScorePercent(0.01), closeTo(1, 1e-9));
    });
  });

  group('交卷载荷', () {
    test('只带真的作答了的题；空白答案按未作答处理', () {
      final questions = <ExamQuestion>[
        ExamQuestion.fromJson(examQuestionJson(id: 1)),
        ExamQuestion.fromJson(examQuestionJson(id: 2, type: 'multi')),
        ExamQuestion.fromJson(examQuestionJson(id: 3, type: 'fill_blank')),
        ExamQuestion.fromJson(examQuestionJson(id: 4)),
      ];
      final body = buildExamSubmitBody(
        questions: questions,
        answers: <int, String>{1: 'A', 2: 'AB', 3: '   ', 4: ' D '},
        durationsMs: <int, int>{1: 30000, 2: -5, 4: 9 * 86400000},
        clientKey: 'key-1',
      );
      final answers = body['answers']! as List<Map<String, dynamic>>;
      expect(body['clientKey'], 'key-1');
      expect(answers.map((item) => item['questionId']), <int>[1, 2, 4]);
      expect(answers.first['userAnswer'], 'A');
      expect(answers.first['durationMs'], 30000);
      expect(answers[1]['durationMs'], 0, reason: '负数截到 0');
      expect(answers[2]['userAnswer'], 'D', reason: '首尾空白要去掉，判分按去空白后的文本');
      expect(answers[2]['durationMs'], 86400000, reason: '上限一天，防止时钟漂移');
    });

    test('全都空白时 answers 为空表（服务端全按 skipped 处理）', () {
      final body = buildExamSubmitBody(
        questions: <ExamQuestion>[
          ExamQuestion.fromJson(examQuestionJson(id: 1)),
        ],
        answers: const <int, String>{},
        durationsMs: const <int, int>{},
        clientKey: 'k',
      );
      expect(body['answers'], isEmpty);
    });
  });

  group('ExamGenerateRules', () {
    test('限时卷带 durationMinutes，固定卷不带', () {
      const timed = ExamGenerateRules(
        title: '模考',
        kind: 'timed',
        durationMinutes: 30,
        count: 20,
        tags: <String>['教育学'],
        wrongWeight: 0.5,
        weakWeight: 0.3,
        freshWeight: 0.2,
      );
      final body = timed.toJson();
      expect(body['kind'], 'timed');
      expect(body['durationMinutes'], 30);
      expect(body['count'], 20);
      expect(body['tags'], <String>['教育学']);
      expect(body['weights'], <String, double>{
        'wrong': 0.5,
        'weak': 0.3,
        'fresh': 0.2,
      });

      const fixed = ExamGenerateRules(title: '小卷', kind: 'fixed', count: 10);
      expect(fixed.toJson().containsKey('durationMinutes'), isFalse);
      expect(fixed.toJson().containsKey('tags'), isFalse);
    });

    test('权重预设覆盖四种口径且各自和为 1', () {
      expect(ExamWeightPreset.presets, hasLength(4));
      for (final preset in ExamWeightPreset.presets) {
        expect(
          preset.wrong + preset.weak + preset.fresh,
          closeTo(1.0, 1e-9),
          reason: '${preset.label} 的权重必须加总为 1',
        );
        expect(preset.summary, contains('%'));
      }
      expect(ExamWeightPreset.wrongFocused.summary, '错题 50% · 弱项 30% · 新题 20%');
    });

    test('考点输入按中英文逗号/顿号/分号/换行切分并去重', () {
      expect(parseExamTags('教育学，心理学、教育学; 法规\n教学 '), <String>[
        '教育学',
        '心理学',
        '法规',
        '教学',
      ]);
      expect(parseExamTags('   '), isEmpty);
    });
  });
}
