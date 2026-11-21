import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/features/practice/domain/question.dart';

/// 材料题字段的解析口径（服务端 `practice.ts` 返回 `material` / `material_html`）。
///
/// 这里的重点是**缺字段必须是 null 而不是空串**：`null` 表示「这条数据没有材料」，
/// 练习页据此不渲染材料卡；空串会被当成「有材料但内容为空」，白白撑出一块空白。
void main() {
  Map<String, dynamic> baseJson({
    String? material,
    String? materialHtml,
    bool includeMaterial = false,
    bool includeMaterialHtml = false,
  }) {
    return <String, dynamic>{
      'id': '42',
      'content': '根据材料，下列说法正确的是？',
      'options': <String>['甲', '乙', '丙', '丁'],
      'type': 'single',
      if (includeMaterial) 'material': material,
      if (includeMaterialHtml) 'material_html': materialHtml,
    };
  }

  test('同时带 material 与 material_html：两个字段都解析出来', () {
    final question = Question.fromJson(
      baseJson(
        includeMaterial: true,
        material: '材料原文第一段。',
        includeMaterialHtml: true,
        materialHtml: '<p>材料原文<strong>第一段</strong>。</p>',
      ),
    );

    expect(question.material, '材料原文第一段。');
    expect(question.materialHtml, '<p>材料原文<strong>第一段</strong>。</p>');
  });

  test('只有 material_html：material 为 null（老接口 / 纯 HTML 场景）', () {
    final question = Question.fromJson(
      baseJson(includeMaterialHtml: true, materialHtml: '<p>只有富文本</p>'),
    );

    expect(question.material, isNull);
    expect(question.materialHtml, '<p>只有富文本</p>');
  });

  test('缺字段：两个都是 null，不是空串', () {
    final question = Question.fromJson(baseJson());

    expect(question.material, isNull);
    expect(question.materialHtml, isNull);
  });

  test('显式传 null：与缺字段同义', () {
    final question = Question.fromJson(
      baseJson(includeMaterial: true, includeMaterialHtml: true),
    );

    expect(question.material, isNull);
    expect(question.materialHtml, isNull);
  });

  test('两者都为空串：解析成空串（由渲染层按「无材料」处理）', () {
    final question = Question.fromJson(
      baseJson(
        includeMaterial: true,
        material: '',
        includeMaterialHtml: true,
        materialHtml: '',
      ),
    );

    expect(question.material, '');
    expect(question.materialHtml, '');
  });

  test('toJson 用服务端的 snake_case 键名（material_html）', () {
    final question = Question.fromJson(
      baseJson(
        includeMaterial: true,
        material: '原文',
        includeMaterialHtml: true,
        materialHtml: '<p>原文</p>',
      ),
    );

    final json = question.toJson();
    expect(json['material'], '原文');
    expect(json['material_html'], '<p>原文</p>');
    // 不能漏出驼峰键，否则回传服务端会被忽略
    expect(json.containsKey('materialHtml'), isFalse);
  });
}
