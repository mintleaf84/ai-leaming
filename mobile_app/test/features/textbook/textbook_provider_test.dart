import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/textbook/domain/textbook.dart';
import 'package:mobile_app/features/textbook/presentation/textbook_provider.dart';

void main() {
  group('Textbook fromJson 单元测试', () {
    final sampleJson = {
      'id': 1,
      'title': '测试教材',
      'author': '作者A',
      'description': '这是简介',
      'cover_url': '',
      'chapterCount': 5,
      'created_at': '2024-01-01',
    };

    test('正常 JSON 反序列化', () {
      final tb = Textbook.fromJson(sampleJson);

      expect(tb.id, 1);
      expect(tb.title, '测试教材');
      expect(tb.author, '作者A');
      expect(tb.description, '这是简介');
      expect(tb.chapterCount, 5);
    });

    test('可选字段为 null 时不报错', () {
      final json = {
        'id': 2,
        'title': '无作者教材',
        'author': null,
        'description': null,
        'cover_url': null,
        'chapterCount': 0,
        'created_at': '2024-01-01',
      };

      final tb = Textbook.fromJson(json);

      expect(tb.id, 2);
      expect(tb.author, isNull);
      expect(tb.description, isNull);
      expect(tb.chapterCount, 0);
    });
  });

  group('TextbookChapter fromJson 单元测试', () {
    test('正常章节反序列化', () {
      final json = {
        'id': 10,
        'textbook_id': 1,
        'title': '第一章',
        'order_index': 1,
        'parent_id': null,
        'level': 1,
        'created_at': '2024-01-01',
      };

      final ch = TextbookChapter.fromJson(json);

      expect(ch.id, 10);
      expect(ch.title, '第一章');
      expect(ch.parentId, isNull);
      expect(ch.level, 1);
    });

    test('有父章节时 parentId 正确解析', () {
      final json = {
        'id': 11,
        'textbook_id': 1,
        'title': '第一节',
        'order_index': 1,
        'parent_id': 10,
        'level': 2,
        'created_at': '2024-01-01',
      };

      final ch = TextbookChapter.fromJson(json);

      expect(ch.parentId, 10);
      expect(ch.level, 2);
    });
  });

  group('TextbookDetail fromJson 单元测试', () {
    test('正确解析教材详情与章节', () {
      final json = {
        'id': 1,
        'title': '完整教材',
        'author': '作者',
        'description': '简介',
        'cover_url': null,
        'chapterCount': 2,
        'created_at': '2024-01-01',
        'chapters': [
          {
            'id': 1,
            'textbook_id': 1,
            'title': '第一章',
            'order_index': 1,
            'parent_id': null,
            'level': 1,
            'created_at': '2024-01-01',
          },
          {
            'id': 2,
            'textbook_id': 1,
            'title': '第二章',
            'order_index': 2,
            'parent_id': null,
            'level': 1,
            'created_at': '2024-01-01',
          },
        ],
      };

      final detail = TextbookDetail.fromJson(json);

      expect(detail.textbook.title, '完整教材');
      expect(detail.chapters.length, 2);
      expect(detail.chapters[0].title, '第一章');
    });

    test('章节为空时正确解析', () {
      final json = {
        'id': 1,
        'title': '空章节教材',
        'chapterCount': 0,
        'created_at': '2024-01-01',
        'chapters': [],
      };

      final detail = TextbookDetail.fromJson(json);

      expect(detail.chapters, isEmpty);
    });
  });

  group('TextbookListState copyWith 测试', () {
    test('更新 textbooks 列表', () {
      const initial = TextbookListState();
      final tb = Textbook.fromJson({
        'id': 1,
        'title': '教材',
        'chapterCount': 3,
        'created_at': '2024-01-01',
      });

      final updated = initial.copyWith(textbooks: [tb]);

      expect(updated.textbooks.length, 1);
      expect(updated.isLoading, false);
    });

    test('isLoading 切换', () {
      const initial = TextbookListState();
      final loading = initial.copyWith(isLoading: true);

      expect(loading.isLoading, true);
      expect(loading.textbooks, isEmpty);
    });
  });
}
