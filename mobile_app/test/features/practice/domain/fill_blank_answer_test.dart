// 填空题的空数推导 / 提交串 / 逐空判分（纯 domain 单测，不 pump Widget）。
//
// 这里钉住的是各方共用的口径（渲染、展示、判分），改任何一条都会让某一端悄悄分叉：
// - 判分 = 服务端 `my-next-app/src/lib/services/answer-check.ts` 的
//   `checkAnswerCorrectness` 的 `fill_blank` 分支，本地 `fillBlanksMatch` 逐字镜像；
// - 空数推导与逐空展示 = **与判分同一个分隔符**（只按中文 `；` 切）。
//   半角 `;` 是空内文本，不是空位分隔：切法一旦比判分宽，端上就会多渲染一个
//   输入框，用户照界面填必被判错（CodeRabbit major）。
// - 提交串 = 各空文本 `join('；')`。
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/features/practice/domain/fill_blank_answer.dart';
import 'package:mobile_app/shared/domain/question.dart';

Question _fillBlank({String content = '题干', String? answer}) => Question(
  id: '1',
  content: content,
  options: const <String>[],
  type: 'fill_blank',
  answer: answer,
);

void main() {
  group('fillBlankCountFromAnswer（与判分同分隔符：只按 `；`）', () {
    test('中文分号逐空计数', () {
      expect(fillBlankCountFromAnswer('主体性；全体性'), 2);
      expect(fillBlankCountFromAnswer('甲；乙；丙'), 3);
    });

    test('半角分号不算分隔符：判分只按 `；` 切，多切一刀就多一个填不上的框', () {
      // 服务端 `userAnswer.split("；")`：`cat;dog` 是一空，`甲；乙;丙` 是两空
      // （第二空的文本是「乙;丙」）。渲染若按 [；;] 切会多要一空，用户必被判错。
      expect(fillBlankCountFromAnswer('cat;dog'), 1);
      expect(fillBlankCountFromAnswer('甲；乙;丙'), 2);
    });

    test('没有分号就是单空', () {
      expect(fillBlankCountFromAnswer('光合作用'), 1);
    });

    test('空/纯分隔符退到 1（Math.max(1, …)）', () {
      expect(fillBlankCountFromAnswer(''), 1);
      expect(fillBlankCountFromAnswer(null), 1);
      expect(fillBlankCountFromAnswer('；；'), 1);
      expect(fillBlankCountFromAnswer(' ；  '), 1);
    });

    test('每空内部的 `|`（多答案）不算分隔符', () {
      expect(fillBlankCountFromAnswer('正确|对；错误|错'), 2);
    });
  });

  group('fillBlankSlotsFor（这道题渲染几个输入框）', () {
    test('题面带答案时按答案推导（离线续练走这条，与判分同源）', () {
      expect(fillBlankSlotsFor(_fillBlank(answer: '甲；乙；丙')), 3);
      // 半角分号不增加空数（与 fillBlankCountFromAnswer 同一实现）。
      expect(fillBlankSlotsFor(_fillBlank(answer: '甲；乙;丙')), 2);
    });

    test('练习接口不带答案：按题干里画出的空位（三个及以上下划线）', () {
      // 出题接口只回 id/content/options/type，防作弊不带答案，
      // 这时用户看到几条下划线就该有几个框。
      expect(fillBlankSlotsFor(_fillBlank(content: '素质教育强调____和____。')), 2);
      expect(fillBlankSlotsFor(_fillBlank(content: '两个短下划_和_不算空位')), 1);
    });

    test('答案和空位都没有 → 一个空（而不是零个）', () {
      expect(fillBlankSlotsFor(_fillBlank()), 1);
      expect(fillBlankSlotsFor(_fillBlank(answer: '   ')), 1);
    });
  });

  group('encodeFillBlanks / fillBlanksComplete', () {
    test('提交串只用中文分号 join（服务端只按 `；` 逐空比对）', () {
      expect(encodeFillBlanks(<String>['主体性', '全体性']), '主体性；全体性');
      expect(encodeFillBlanks(<String>['唯一答案']), '唯一答案');
      // 没填的空保留位置：空数不能因为少填一空而变化。
      expect(encodeFillBlanks(<String>['', '乙']), '；乙');
    });

    test('每空都非空白才算填完；空列表不算填完', () {
      expect(fillBlanksComplete(<String>['甲', '乙']), isTrue);
      expect(fillBlanksComplete(<String>['甲']), isTrue);
      expect(fillBlanksComplete(<String>['甲', '']), isFalse);
      expect(fillBlanksComplete(<String>['甲', '   ']), isFalse);
      expect(fillBlanksComplete(<String>[]), isFalse, reason: '没作答不是「填完了 0 空」');
    });
  });

  group('逐空展示（回顾/解析面板）', () {
    test('decodeFillBlanks 只按 `；` 拆，逐项去空白；半角分号留在空内文本', () {
      expect(decodeFillBlanks('甲； 乙'), <String>['甲', '乙']);
      expect(decodeFillBlanks('cat; dog'), <String>['cat; dog']);
      expect(decodeFillBlanks('甲；乙;丙'), <String>['甲', '乙;丙']);
      expect(decodeFillBlanks('单空'), <String>['单空']);
    });

    test('逐空展示与判分同分隔符：混用分号时显示的空数 = 判分认的空数', () {
      expect(formatFillBlankAnswer('甲；乙;丙'), '空 1：甲\n空 2：乙;丙');
    });

    test('多空按空序逐行，单空只留文本', () {
      expect(formatFillBlankAnswer('主体性；全体性'), '空 1：主体性\n空 2：全体性');
      expect(formatFillBlankAnswer('光合作用'), '光合作用');
      expect(formatFillBlankBlanks(<String>['甲', '']), '空 1：甲\n空 2：');
      expect(formatFillBlankBlanks(<String>[]), '');
    });
  });

  group('fillBlanksMatch（镜像服务端 answer-check.ts 的填空分支）', () {
    test('逐空相等判对', () {
      expect(fillBlanksMatch('主体性；全体性', '主体性；全体性'), isTrue);
      expect(fillBlanksMatch(' 主体性 ； 全体性 ', '主体性；全体性'), isTrue);
    });

    test('半角分号是空内文本：混用分号时逐空仍判对', () {
      // 渲染侧按同一个分隔符切（只 `；`），所以界面是两空：「甲」「乙;丙」。
      expect(fillBlanksMatch('甲；乙;丙', '甲；乙;丙'), isTrue);
      // 反过来，少填一空（把半角分号当分隔符只答了两段之一）判错。
      expect(fillBlanksMatch('甲；乙', '甲；乙;丙'), isFalse);
    });

    test('每空接受 `|` 分隔的多个可接受答案', () {
      expect(fillBlanksMatch('对；错', '正确|对；错误|错'), isTrue);
      expect(fillBlanksMatch('对；错', '正确|对；错误|误'), isFalse);
    });

    test('空数不一致判错', () {
      expect(fillBlanksMatch('主体性', '主体性；全体性'), isFalse);
      expect(fillBlanksMatch('主体性；全体性；多余', '主体性；全体性'), isFalse);
    });

    test('某一空为空判错（不把「没填」算成匹配）', () {
      expect(fillBlanksMatch('；全体性', '主体性；全体性'), isFalse);
      expect(fillBlanksMatch('', '主体性；全体性'), isFalse);
    });

    test('逐字比较，不按字母集合/大小写折叠', () {
      expect(fillBlanksMatch('CAT', 'ACT'), isFalse);
      expect(fillBlanksMatch('act', 'ACT'), isFalse);
    });
  });
}
