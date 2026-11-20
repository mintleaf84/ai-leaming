import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/questions/domain/question_draft.dart';

/// 草稿模型的解析单测。
///
/// 重点是**服务端可能的三种脏形态**都能吃下去，而不是等到真机上发现
/// 「识别成功但列表显示 0 条」：
/// 1. `options` / `tags` 是 DB 里的 JSON 字符串而不是数组；
/// 2. `confirmed` 是 SQLite 的 0/1 而不是 bool；
/// 3. 列表只给 `items[]`、不给 `itemCount`。
void main() {
  group('DraftStatus', () {
    test('按 wire 值解析，未知值不抛错', () {
      expect(DraftStatus.fromWire('ready'), DraftStatus.ready);
      expect(DraftStatus.fromWire('analyzing'), DraftStatus.analyzing);
      expect(DraftStatus.fromWire('nonsense'), DraftStatus.unknown);
      expect(DraftStatus.fromWire(null), DraftStatus.unknown);
    });
  });

  group('QuestionDraftItem.fromJson', () {
    test('options 是 JSON 字符串时解析成数组', () {
      final item = QuestionDraftItem.fromJson(<String, dynamic>{
        'idx': 2,
        'content': '题干',
        'options': jsonEncode(<String>['A. 甲', 'B. 乙']),
        'answer': 'A',
        'tags': jsonEncode(<String>['教育学']),
      });

      expect(item.idx, 2);
      expect(item.options, <String>['A. 甲', 'B. 乙']);
      expect(item.tags, <String>['教育学']);
    });

    test('options 是逗号分隔的普通字符串时也能拆', () {
      final item = QuestionDraftItem.fromJson(<String, dynamic>{
        'options': '甲，乙、丙',
      });

      expect(item.options, <String>['甲', '乙', '丙']);
    });

    test('confirmed 支持 0/1、true/false 与字符串', () {
      expect(
        QuestionDraftItem.fromJson(<String, dynamic>{'confirmed': 1}).confirmed,
        isTrue,
      );
      expect(
        QuestionDraftItem.fromJson(<String, dynamic>{'confirmed': 0}).confirmed,
        isFalse,
      );
      expect(
        QuestionDraftItem.fromJson(<String, dynamic>{
          'confirmed': true,
        }).confirmed,
        isTrue,
      );
      expect(
        QuestionDraftItem.fromJson(<String, dynamic>{
          'confirmed': '1',
        }).confirmed,
        isTrue,
      );
    });

    test('缺字段时给安全默认值', () {
      final item = QuestionDraftItem.fromJson(const <String, dynamic>{});

      expect(item.idx, 0);
      expect(item.content, '');
      expect(item.options, isEmpty);
      expect(item.type, 'single');
      expect(item.confirmed, isFalse);
    });

    test('material_html 两种命名都认', () {
      expect(
        QuestionDraftItem.fromJson(<String, dynamic>{
          'material_html': '<p>材料</p>',
        }).materialHtml,
        '<p>材料</p>',
      );
      expect(
        QuestionDraftItem.fromJson(<String, dynamic>{
          'materialHtml': '<p>材料</p>',
        }).materialHtml,
        '<p>材料</p>',
      );
    });

    test('toPatchPayload 带上全部可编辑字段与 confirmed', () {
      const item = QuestionDraftItem(
        idx: 1,
        content: ' 题干 ',
        options: <String>[' 甲 ', '乙'],
        answer: ' A ',
        explanation: ' 解析 ',
        tags: <String>['教育学'],
        type: 'multi',
        confirmed: true,
      );

      expect(item.toPatchPayload(), <String, dynamic>{
        'content': '题干',
        'options': <String>['甲', '乙'],
        'answer': 'A',
        'explanation': '解析',
        'tags': <String>['教育学'],
        'type': 'multi',
        'confirmed': true,
      });
    });

    test('copyWith 只改指定字段', () {
      const item = QuestionDraftItem(idx: 3, content: '原题干', answer: 'A');

      final next = item.copyWith(content: '新题干', confirmed: true);

      expect(next.idx, 3);
      expect(next.content, '新题干');
      expect(next.answer, 'A');
      expect(next.confirmed, isTrue);
    });
  });

  group('QuestionDraft.fromJson', () {
    test('解析 items 与 confirmedCount', () {
      final draft = QuestionDraft.fromJson(<String, dynamic>{
        'id': 'd1',
        'status': 'ready',
        'source': 'camera',
        'items': <Map<String, dynamic>>[
          <String, dynamic>{'idx': 0, 'content': '甲', 'confirmed': 1},
          <String, dynamic>{'idx': 1, 'content': '乙', 'confirmed': 0},
        ],
      });

      expect(draft.id, 'd1');
      expect(draft.status, DraftStatus.ready);
      expect(draft.items.length, 2);
      expect(draft.confirmedCount, 1);
      expect(draft.hasConfirmed, isTrue);
    });

    test('items 缺失时是空列表而不是抛错', () {
      final draft = QuestionDraft.fromJson(<String, dynamic>{
        'id': 'd2',
        'status': 'failed',
        'error_code': 'AI_TIMEOUT',
      });

      expect(draft.items, isEmpty);
      expect(draft.errorCode, 'AI_TIMEOUT');
      expect(draft.hasConfirmed, isFalse);
    });
  });

  group('QuestionDraftSummary.fromJson', () {
    test('没有 itemCount 时用 items 长度兜底', () {
      final summary = QuestionDraftSummary.fromJson(<String, dynamic>{
        'id': 'd3',
        'status': 'ready',
        'items': <Map<String, dynamic>>[
          <String, dynamic>{'idx': 0},
          <String, dynamic>{'idx': 1},
          <String, dynamic>{'idx': 2},
        ],
      });

      expect(summary.itemCount, 3);
      expect(summary.status, DraftStatus.ready);
    });

    test('itemCount / confirmedCount 两种命名都认', () {
      final summary = QuestionDraftSummary.fromJson(<String, dynamic>{
        'id': 'd4',
        'status': 'confirmed',
        'item_count': '5',
        'confirmed_count': 4,
        'created_at': '2026-11-20T10:00:00.000Z',
      });

      expect(summary.itemCount, 5);
      expect(summary.confirmedCount, 4);
      expect(summary.createdAt, '2026-11-20T10:00:00.000Z');
    });

    test('source 有中文标签', () {
      expect(
        QuestionDraftSummary.fromJson(<String, dynamic>{
          'source': 'camera',
        }).sourceLabel,
        '拍照',
      );
      expect(
        QuestionDraftSummary.fromJson(<String, dynamic>{
          'source': 'pdf',
        }).sourceLabel,
        'PDF',
      );
      expect(
        QuestionDraftSummary.fromJson(<String, dynamic>{
          'source': 'whatever',
        }).sourceLabel,
        '文本',
      );
    });
  });

  group('DraftConfirmResult', () {
    test('summary 只提跳过数（>0 时）', () {
      expect(
        const DraftConfirmResult(created: 2).summary,
        '已入库 2 题',
      );
      expect(
        const DraftConfirmResult(created: 2, skipped: 1).summary,
        '已入库 2 题，跳过 1 题',
      );
    });

    test('缺字段时按 0 处理，conflicts 非数组也不炸', () {
      final result = DraftConfirmResult.fromJson(<String, dynamic>{
        'created': '3',
        'conflicts': null,
      });

      expect(result.created, 3);
      expect(result.skipped, 0);
      expect(result.conflicts, isEmpty);
    });
  });
}
