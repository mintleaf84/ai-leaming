import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/agent_sets/domain/agent_judge.dart';
import 'package:mobile_app/features/agent_sets/domain/agent_question.dart';
import 'package:mobile_app/features/agent_sets/domain/agent_question_set.dart';
import 'package:mobile_app/features/agent_sets/domain/agent_set_detail.dart';
import 'package:mobile_app/features/agent_sets/domain/agent_set_inbox.dart';
import 'package:mobile_app/features/agent_sets/domain/agent_set_json.dart';

/// 题集 domain 的退化规则与文案。
///
/// 服务端由另一条 lane 并行实现，形状还可能动，所以这里的重点不是「某个字段
/// 读出什么」，而是**字段缺失/改包装时界面不该崩**：空标题给「AI 题集」、
/// 缺未做数用总数、坏 JSON 的标签给空数组，而不是抛异常。
void main() {
  group('AgentQuestionSet', () {
    test('完整字段：来源 / 考点 / 剩余 / 成绩都能读出来', () {
      final set = AgentQuestionSet.fromJson(<String, dynamic>{
        'id': 7,
        'title': ' 教育目的专项 ',
        'agent': 'claude-code',
        'model': 'sonnet',
        'targetTags': <String>['教育学', '教育目的'],
        'note': '针对上次错题',
        'status': 'active',
        'questionCount': 10,
        'pendingCount': 4,
        'unreadCount': 3,
        'lastScore': 0.85,
        'createdAt': '2026-11-21T08:00:00.000Z',
      });

      expect(set.id, 7);
      expect(set.title, '教育目的专项');
      expect(set.sourceLabel, 'claude-code · sonnet');
      expect(set.targetTags, <String>['教育学', '教育目的']);
      expect(set.doneCount, 6);
      expect(set.pendingLabel, '剩 4 题');
      expect(set.lastScoreLabel, '85%');
      expect(set.hasPending, isTrue);
    });

    test('缺标题 / 缺未做数：给可读兜底，而不是 0 题', () {
      final set = AgentQuestionSet.fromJson(<String, dynamic>{
        'id': '8',
        'title': '',
        'questionCount': 5,
        'doneCount': 2,
      });

      expect(set.id, 8); // 数字字符串也认
      expect(set.title, 'AI 题集');
      // 「未做」缺失但有已做数：用总数推出来
      expect(set.pendingCount, 3);
      // 来源缺失时说「未标注来源」，不显示空白
      expect(set.sourceLabel, '未标注来源');
    });

    test('counts 聚合壳与 JSON 字符串标签都认', () {
      final set = AgentQuestionSet.fromJson(<String, dynamic>{
        'id': 9,
        'title': '聚合壳',
        'counts': <String, dynamic>{'total': 6, 'done': 6, 'unread': 2},
        'targetTags': '["教育学","心理学"]',
      });

      expect(set.questionCount, 6);
      expect(set.pendingCount, 0);
      expect(set.unreadCount, 2);
      expect(set.targetTags, <String>['教育学', '心理学']);
      expect(set.pendingLabel, '已做完');
    });

    test('坏 JSON 标签：给空数组，不抛', () {
      final set = AgentQuestionSet.fromJson(<String, dynamic>{
        'id': 1,
        'targetTags': '["教育学",',
      });
      expect(set.targetTags, isEmpty);
    });

    test('转正态与空题集的文案', () {
      final promoted = AgentQuestionSet.fromJson(<String, dynamic>{
        'id': 1,
        'status': 'promoted',
        'questionCount': 5,
        'pendingCount': 5,
      });
      expect(promoted.isPromoted, isTrue);
      expect(promoted.pendingLabel, '已转正');

      final empty = AgentQuestionSet.fromJson(<String, dynamic>{'id': 2});
      expect(empty.questionCount, 0);
      expect(empty.pendingLabel, '暂无题目');
    });

    test('copyWith 只改给到的字段', () {
      const original = AgentQuestionSet(
        id: 1,
        title: '原题集',
        questionCount: 5,
        pendingCount: 5,
      );
      final next = original.copyWith(pendingCount: 3, lastScore: 0.5);
      expect(next.pendingCount, 3);
      expect(next.lastScoreLabel, '50%');
      expect(next.title, '原题集');
      expect(next.questionCount, 5);
    });

    test('toJson 与 fromJson 往返一致', () {
      const original = AgentQuestionSet(
        id: 3,
        title: '往返',
        agent: 'codex',
        targetTags: <String>['心理学'],
        questionCount: 4,
        pendingCount: 1,
        unreadCount: 2,
        lastScore: 0.25,
      );
      final round = AgentQuestionSet.fromJson(original.toJson());
      expect(round.title, original.title);
      expect(round.targetTags, original.targetTags);
      expect(round.pendingCount, 1);
      expect(round.unreadCount, 2);
      expect(round.lastScoreLabel, '25%');
    });
  });

  group('AgentSetPage', () {
    test('data + meta 包装', () {
      final page = AgentSetPage.fromJson(<String, dynamic>{
        'data': <Map<String, dynamic>>[
          <String, dynamic>{'id': 1, 'title': 'A'},
        ],
        'meta': <String, dynamic>{'limit': 20, 'offset': 0, 'total': 9},
      });
      expect(page.sets.single.title, 'A');
      expect(page.total, 9);
      expect(page.limit, 20);
    });

    test('items 包装与裸数组', () {
      final items = AgentSetPage.fromJson(<String, dynamic>{
        'items': <Map<String, dynamic>>[
          <String, dynamic>{'id': 2, 'title': 'B'},
        ],
      });
      expect(items.sets.single.id, 2);
      expect(items.total, 1);

      final bare = AgentSetPage.fromList(<dynamic>[
        <String, dynamic>{'id': 3, 'title': 'C'},
        'not-a-map',
      ]);
      expect(bare.sets, hasLength(1));
      expect(bare.sets.single.title, 'C');
    });
  });

  group('AgentQuestion', () {
    test('嵌套 position / material_html / 字母标签', () {
      final question = AgentQuestion.fromJson(<String, dynamic>{
        'questionId': 42,
        'stem': '题干',
        'options': <String>['甲', '乙'],
        'type': 'multi',
        'material_html': '<p>材料</p>',
        'order': 3,
      });

      expect(question.id, 42);
      expect(question.content, '题干');
      expect(question.isMulti, isTrue);
      expect(question.typeLabel, '多选题');
      expect(question.materialHtml, '<p>材料</p>');
      expect(question.position, 3);
      expect(question.idString, '42');
    });

    test('判断题没有选项时回落「正确 / 错误」并标记', () {
      final question = AgentQuestion.fromJson(<String, dynamic>{
        'id': 5,
        'content': '教育是有目的的培养人的活动。',
        'type': 'truefalse',
      });
      expect(question.displayOptions, <String>['正确', '错误']);
      expect(question.usesFallbackTrueFalseOptions, isTrue);
    });

    test('选项字母超过 Z 时回落数字', () {
      expect(AgentQuestion.labelAt(0), 'A');
      expect(AgentQuestion.labelAt(25), 'Z');
      expect(AgentQuestion.labelAt(26), '27');
    });

    test('toJson 保留题面字段（本地移除/调试时用得到）', () {
      const question = AgentQuestion(
        id: 9,
        content: '题干',
        options: <String>['甲'],
        type: 'single',
        tags: <String>['教育学'],
        material: '材料',
        position: 2,
      );
      final json = question.toJson();
      expect(json['id'], 9);
      expect(json['options'], <String>['甲']);
      expect(json['position'], 2);
      final round = AgentQuestion.fromJson(json);
      expect(round.content, '题干');
      expect(round.material, '材料');
    });
  });

  group('JSON 读取工具', () {
    test('readMap：Map<Object,Object> 转成字符串键，非对象给 null', () {
      expect(readMap(<Object, Object>{1: 'a'}), <String, dynamic>{'1': 'a'});
      expect(readMap('nope'), isNull);
    });

    test('数字读取：int / double / 数字字符串 / 坏值', () {
      expect(readInt(3.9), 3);
      expect(readInt(' 7 '), 7);
      expect(readInt('x', fallback: 2), 2);
      expect(readNullableInt('8'), 8);
      expect(readNullableInt('x'), isNull);
      expect(readNullableInt(null), isNull);
      expect(readDouble('2.5'), 2.5);
      expect(readDouble('x'), 0);
      expect(readNullableDouble('1.25'), 1.25);
      expect(readNullableDouble('x'), isNull);
    });

    test('布尔：0/1 与 true/false 字符串', () {
      expect(readBool(1), isTrue);
      expect(readBool(0), isFalse);
      expect(readBool('TRUE'), isTrue);
      expect(readBool('0'), isFalse);
      expect(readBool('maybe', fallback: true), isTrue);
    });

    test('readObjectList：非数组给空表，非对象项丢弃', () {
      expect(readObjectList(<dynamic>[1, 2], (json) => json), isEmpty);
      expect(readObjectList('nope', (json) => json), isEmpty);
    });

    test('readDateTime：合法 ISO 解析，坏值/空串给 null', () {
      expect(readDateTime('2026-11-21T08:00:00.000Z')?.toUtc().hour, 8);
      expect(readDateTime('not-a-date'), isNull);
      expect(readDateTime(''), isNull);
      expect(readDateTime(null), isNull);
    });
  });

  group('AgentSetDetail', () {
    test('冻结形状：摊平题目 + flaggedCount', () {
      // 契约 §4.3：{set:{…}, questions:[{id,content,options,type,dimension,tags,material}], flaggedCount}
      final detail = AgentSetDetail.fromJson(<String, dynamic>{
        'set': <String, dynamic>{
          'id': 12,
          'title': '教育目的专项',
          'agent': 'claude-code',
          'model': 'sonnet',
          'targetTags': <String>['教育学'],
          'questionCount': 4,
          'pendingCount': 2,
          'unreadCount': 1,
          'lastScore': 0.75,
          'createdAt': '2026-11-21T08:00:00.000Z',
        },
        'questions': <Map<String, dynamic>>[
          <String, dynamic>{
            'id': 11,
            'content': '第一题',
            'options': <String>['甲', '乙'],
            'type': 'single',
            'dimension': 'knowledge',
            'tags': <String>['教育学'],
            'material': null,
          },
        ],
        'flaggedCount': 2,
      });

      expect(detail.flaggedCount, 2);
      expect(detail.questions.single.id, 11);
      expect(detail.remainingCount, 2);
      expect(detail.set.lastScoreLabel, '75%');
    });

    test('冻结形状不含答案：即使服务端多回 answer/explanation 也不读', () {
      final question = AgentQuestion.fromJson(<String, dynamic>{
        'id': 11,
        'content': '第一题',
        'options': <String>['甲', '乙'],
        'type': 'single',
        'tags': <String>['教育学'],
        // 契约明确「不含答案」；服务端万一多回，客户端也不能拿它来展示/判分
        'answer': 'A',
        'explanation': '因为……',
      });

      expect(question.content, '第一题');
      expect(question.toJson().containsKey('answer'), isFalse);
      expect(question.toJson().containsKey('explanation'), isFalse);
    });

    test('{set, questions} 形状', () {
      final detail = AgentSetDetail.fromJson(<String, dynamic>{
        'set': <String, dynamic>{
          'id': 1,
          'title': '题集',
          'questionCount': 2,
          'pendingCount': 2,
        },
        'questions': <Map<String, dynamic>>[
          <String, dynamic>{'id': 11, 'content': '一'},
          <String, dynamic>{'id': 12, 'content': '二'},
        ],
      });
      expect(detail.set.id, 1);
      expect(detail.questions, hasLength(2));
      expect(detail.remainingCount, 2);
    });

    test('items[{position, question}] 与摊平字段都认', () {
      final detail = AgentSetDetail.fromJson(<String, dynamic>{
        'id': 2,
        'title': '摊平',
        'items': <Map<String, dynamic>>[
          <String, dynamic>{
            'position': 1,
            'question': <String, dynamic>{'id': 21, 'content': '甲'},
          },
          <String, dynamic>{'id': 22, 'content': '乙'},
        ],
      });
      expect(detail.set.title, '摊平');
      expect(detail.questions.map((q) => q.id), <int>[21, 22]);
      // 服务端没回题数：用 questions 长度兜底，避免详情页写「0 题」
      expect(detail.set.questionCount, 2);
    });

    test('没有题数也没有题目：remainingCount 为 0', () {
      final detail = AgentSetDetail.fromJson(<String, dynamic>{'id': 3});
      expect(detail.isEmpty, isTrue);
      expect(detail.remainingCount, 0);
    });
  });

  group('动作结果', () {
    test('attempt：数字 sessionId 转字符串，题目可选嵌套', () {
      final attempt = AgentSetAttempt.fromJson(<String, dynamic>{
        'sessionId': 901,
        'questions': <Map<String, dynamic>>[
          <String, dynamic>{
            'question': <String, dynamic>{'id': 1, 'content': '一'},
          },
        ],
      });
      expect(attempt.sessionId, '901');
      expect(attempt.hasSession, isTrue);
      expect(attempt.questions.single.id, 1);
    });

    test('attempt：缺 sessionId 时 hasSession 为 false', () {
      final attempt = AgentSetAttempt.fromJson(<String, dynamic>{});
      expect(attempt.hasSession, isFalse);
    });

    test('flag：冻结形状 {questionId, flagged, remaining}', () {
      final result = AgentFlagResult.fromJson(<String, dynamic>{
        'questionId': 11,
        'flagged': true,
        'remaining': 2,
      });
      expect(result.remaining, 2);
      expect(result.removed, isTrue);
    });

    test('flag：remaining 的三种写法 + 缺失时为 null', () {
      expect(
        AgentFlagResult.fromJson(<String, dynamic>{'remaining': 3}).remaining,
        3,
      );
      expect(
        AgentFlagResult.fromJson(<String, dynamic>{
          'counts': <String, dynamic>{'remaining': 2},
        }).remaining,
        2,
      );
      expect(
        AgentFlagResult.fromJson(<String, dynamic>{
          'remainingCount': 1,
        }).remaining,
        1,
      );
      expect(AgentFlagResult.fromJson(<String, dynamic>{}).remaining, isNull);
    });

    test('promote：冻结形状 {setId, promoted, promotedCount}', () {
      final result = AgentPromoteResult.fromJson(<String, dynamic>{
        'setId': 12,
        'promoted': true,
        'promotedCount': 3,
      });
      expect(result.promoted, isTrue);
      expect(result.questionCount, 3);
    });

    test('promote：promoted / 题数的两种形状', () {
      final result = AgentPromoteResult.fromJson(<String, dynamic>{
        'promoted': true,
        'questionCount': 4,
      });
      expect(result.promoted, isTrue);
      expect(result.questionCount, 4);

      final byStatus = AgentPromoteResult.fromJson(<String, dynamic>{
        'set': <String, dynamic>{'status': 'promoted', 'questionCount': 2},
      });
      expect(byStatus.promoted, isTrue);
      expect(byStatus.questionCount, 2);
    });

    test('paper：冻结形状 {paper, items, lastAttempt}，题数缺时用 items 兜底', () {
      final paper = AgentSetPaper.fromJson(<String, dynamic>{
        'paper': <String, dynamic>{
          'id': 77,
          'title': 'AI 题集成卷',
          'kind': 'fixed',
          'source': 'agent',
        },
        'items': <Map<String, dynamic>>[
          <String, dynamic>{
            'position': 1,
            'question': <String, dynamic>{'id': 1},
          },
          <String, dynamic>{
            'position': 2,
            'question': <String, dynamic>{'id': 2},
          },
        ],
        'lastAttempt': null,
      });
      expect(paper.paperId, 77);
      expect(paper.totalQuestions, 2);
    });

    test('paper：包在 paper 里与摊平都认', () {
      final nested = AgentSetPaper.fromJson(<String, dynamic>{
        'paper': <String, dynamic>{'id': 5, 'title': '成卷', 'totalQuestions': 3},
      });
      expect(nested.paperId, 5);
      expect(nested.title, '成卷');
      expect(nested.totalQuestions, 3);

      final flat = AgentSetPaper.fromJson(<String, dynamic>{'id': 6});
      expect(flat.paperId, 6);
      expect(flat.title, 'AI 题集成卷');
    });
  });

  group('AgentJudgeOutcome', () {
    test('多选答案排版与字母集合', () {
      const outcome = AgentJudgeOutcome(
        isCorrect: false,
        correctAnswer: '["A","C"]',
      );
      expect(outcome.correctAnswerLabel, 'A、C');
      expect(outcome.correctOptionLetters, <String>{'A', 'C'});
    });

    test('字母串（含分隔符）与判断题原文字', () {
      expect(
        const AgentJudgeOutcome(
          isCorrect: true,
          correctAnswer: 'A,B',
        ).correctOptionLetters,
        <String>{'A', 'B'},
      );
      expect(
        const AgentJudgeOutcome(
          isCorrect: true,
          correctAnswer: '正确',
        ).correctOptionLetters,
        <String>{'A'},
      );
      expect(
        const AgentJudgeOutcome(
          isCorrect: true,
          correctAnswer: '错误',
        ).correctOptionLetters,
        <String>{'B'},
      );
    });

    test('解析不出来时不给高亮，也不给空文案', () {
      const outcome = AgentJudgeOutcome(isCorrect: true, correctAnswer: '  ');
      expect(outcome.correctOptionLetters, isEmpty);
      expect(outcome.correctAnswerLabel, '未提供');
    });

    test('坏 JSON 数组回落原文，集合为空', () {
      const outcome = AgentJudgeOutcome(
        isCorrect: true,
        correctAnswer: '["A",',
      );
      expect(outcome.correctAnswerLabel, '["A",');
      expect(outcome.correctOptionLetters, isEmpty);
    });

    test('fromResponse 读出 offline 标记', () {
      final outcome = AgentJudgeOutcome.fromResponse(<String, dynamic>{
        'isCorrect': true,
        'correctAnswer': 'A',
        'offline': true,
      });
      expect(outcome.isCorrect, isTrue);
      expect(outcome.offline, isTrue);
    });
  });

  group('AgentSetInbox', () {
    test('按套累加未读与待做，并记最近一套', () {
      final inbox = AgentSetInbox.fromSets(<AgentQuestionSet>[
        const AgentQuestionSet(
          id: 2,
          title: '最新',
          questionCount: 3,
          pendingCount: 2,
          unreadCount: 2,
        ),
        const AgentQuestionSet(
          id: 1,
          title: '旧',
          questionCount: 5,
          pendingCount: 1,
          unreadCount: 1,
        ),
      ]);

      expect(inbox.unreadCount, 3);
      expect(inbox.pendingCount, 3);
      expect(inbox.setCount, 2);
      expect(inbox.latestSetId, 2);
      expect(inbox.latestTitle, '最新');
      expect(inbox.entryValue, '3 道未读');
      expect(inbox.badgeLabel, '3');
    });

    test('没有未读时首页报剩余；空列表报「还没有」', () {
      final noUnread = AgentSetInbox.fromSets(<AgentQuestionSet>[
        const AgentQuestionSet(id: 1, title: 'A', pendingCount: 4),
      ]);
      expect(noUnread.hasUnread, isFalse);
      expect(noUnread.entryValue, '4 道待做');

      final done = AgentSetInbox.fromSets(<AgentQuestionSet>[
        const AgentQuestionSet(id: 1, title: 'A', questionCount: 4),
      ]);
      expect(done.entryValue, '都看过了');

      expect(AgentSetInbox.fromSets(const []).entryValue, '还没有');
      expect(AgentSetInbox.fromSets(const []).latestSetId, isNull);
    });

    test('角标 99 以上折成 99+', () {
      const inbox = AgentSetInbox(unreadCount: 120);
      expect(inbox.badgeLabel, '99+');
      expect(const AgentSetInbox(unreadCount: 99).badgeLabel, '99');
    });

    test('通知文案：带题集名，不催', () {
      const inbox = AgentSetInbox(unreadCount: 3, latestTitle: '教育目的专项');
      final text = agentSetNotificationText(inbox, newCount: 3);
      expect(text.title, 'AI 题集');
      expect(text.body, '有 3 道新题等你做 · 《教育目的专项》');

      const noTitle = AgentSetInbox(unreadCount: 1);
      expect(agentSetNotificationText(noTitle, newCount: 1).body, '有 1 道新题等你做');
    });
  });
}
