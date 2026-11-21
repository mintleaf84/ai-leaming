import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/recall/domain/recall_card.dart';
import 'package:mobile_app/features/recall/domain/recall_preview.dart';
import 'package:mobile_app/features/recall/domain/recall_review.dart';

/// 期望值来源（不是手算的，别在改动时凭印象改）：
///
/// 把 web 端 `my-next-app/src/app/recall/lib/preview.ts` 连同它 import 的
/// `src/lib/recall/{matcher,normalize}.ts` 原样拷到临时目录（只把别名路径
/// `@/lib/recall/matcher` 改写成 `./matcher`），然后用
/// `./node_modules/.bin/tsx <驱动脚本>` 跑同一批输入，把输出的
/// `presented` / `verdicts` 抄进下面的断言。
///
/// 也就是说这些期望值是 **web 端实现自己算出来的**，不是本文件作者对文档的理解；
/// 将来 web 端口径变了，重新跑一遍驱动脚本即可复现差异。
///
/// 卡组构造约定：`cardId: 1` 走列举卡；`cardId: 2` 走填空卡（无业务含义，仅便于对表）。
void main() {
  group('列举卡：归一化与命中方向', () {
    test('大小写：typed 小写命中大写关键词', () {
      final preview = previewVerdicts(
        _listCard([
          const RecallListItem(text: '线粒体', keywords: ['MITOCHONDRIA']),
        ]),
        'mitochondria',
      );

      expect(preview.verdicts, _verdicts('ok'));
    });

    test('大小写：混合大小写', () {
      final preview = previewVerdicts(
        _listCard([
          const RecallListItem(text: '线粒体', keywords: ['mitochondria']),
        ]),
        'MitoChondria',
      );

      expect(preview.verdicts, _verdicts('ok'));
    });

    test('前后空格：typed 带首尾空格', () {
      final preview = previewVerdicts(
        _listCard([
          const RecallListItem(text: '安全制度', keywords: ['安全制度']),
        ]),
        '  安全制度  ',
      );

      expect(preview.verdicts, _verdicts('ok'));
    });

    test('关键词内部空格：关键词「倒 U 形」 vs typed「倒u形」', () {
      final preview = previewVerdicts(
        _listCard([
          const RecallListItem(text: '倒U形', keywords: ['倒 U 形']),
        ]),
        '倒u形',
      );

      expect(preview.verdicts, _verdicts('ok'));
    });

    test('全角字母转半角', () {
      final preview = previewVerdicts(
        _listCard([
          const RecallListItem(text: 'ATP', keywords: ['atp']),
        ]),
        'ＡＴＰ',
      );

      expect(preview.verdicts, _verdicts('ok'));
    });

    test('中文标点被去掉', () {
      final preview = previewVerdicts(
        _listCard([
          const RecallListItem(text: '安全制度', keywords: ['安全制度']),
        ]),
        '安全、制度。',
      );

      expect(preview.verdicts, _verdicts('ok'));
    });

    test('连续空白折叠成一个', () {
      final preview = previewVerdicts(
        _listCard([
          const RecallListItem(text: '安全制度', keywords: ['安全制度']),
        ]),
        '安全  制度',
      );

      expect(preview.verdicts, _verdicts('ok'));
    });

    test('全角空格 U+3000 视作空白', () {
      final preview = previewVerdicts(
        _listCard([
          const RecallListItem(text: '安全制度', keywords: ['安全制度']),
        ]),
        '安全\u3000制度',
      );

      expect(preview.verdicts, _verdicts('ok'));
    });

    test('多关键词任一命中', () {
      final preview = previewVerdicts(
        _listCard([
          const RecallListItem(
            text: '线粒体是有氧呼吸的主要场所',
            keywords: ['线粒体', 'mitochondria'],
          ),
        ]),
        '有氧呼吸主要在线粒体',
      );

      expect(preview.verdicts, _verdicts('ok'));
    });

    test('部分命中', () {
      final preview = previewVerdicts(
        _listCard([
          const RecallListItem(text: '内膜', keywords: ['内膜']),
          const RecallListItem(text: '基质', keywords: ['基质']),
          const RecallListItem(text: '嵴', keywords: ['嵴']),
        ]),
        '内膜和基质',
      );

      expect(preview.presented, [0, 1, 2]);
      expect(preview.verdicts, _verdicts('ok,ok,miss'));
    });

    test('完全不命中', () {
      final preview = previewVerdicts(
        _listCard([
          const RecallListItem(text: '内膜', keywords: ['内膜']),
          const RecallListItem(text: '基质', keywords: ['基质']),
        ]),
        '细胞核',
      );

      expect(preview.verdicts, _verdicts('miss,miss'));
    });

    test('空作答：全 miss', () {
      final preview = previewVerdicts(
        _listCard([
          const RecallListItem(text: '内膜', keywords: ['内膜']),
          const RecallListItem(text: '基质', keywords: ['基质']),
        ]),
        '',
      );

      expect(preview.verdicts, _verdicts('miss,miss'));
    });

    test('纯空白作答：全 miss', () {
      final preview = previewVerdicts(
        _listCard([
          const RecallListItem(text: '内膜', keywords: ['内膜']),
        ]),
        '   ',
      );

      expect(preview.verdicts, _verdicts('miss'));
    });

    test('包含方向单向：typed 比关键词短不命中', () {
      final preview = previewVerdicts(
        _listCard([
          const RecallListItem(text: '细胞膜', keywords: ['细胞膜的选择透过性']),
        ]),
        '选择透过性',
      );

      expect(preview.verdicts, _verdicts('miss'));
    });

    test('包含方向单向：typed 比关键词长则命中', () {
      final preview = previewVerdicts(
        _listCard([
          const RecallListItem(text: '细胞膜', keywords: ['选择透过性']),
        ]),
        '细胞膜具有选择透过性',
      );

      expect(preview.verdicts, _verdicts('ok'));
    });
  });

  group('列举卡：关键词退化为条目文本', () {
    test('keywords 为空数组：用条目文本做包含判断', () {
      final preview = previewVerdicts(
        _listCard([const RecallListItem(text: '光合作用')]),
        '光合作用发生在叶绿体',
      );

      expect(preview.verdicts, _verdicts('ok'));
    });

    test('keywords 为空数组：包含判断仍单向', () {
      final preview = previewVerdicts(
        _listCard([const RecallListItem(text: '光合作用')]),
        '光合',
      );

      expect(preview.verdicts, _verdicts('miss'));
    });

    test('keywords 全是标点：归一化后为空被剔除，退化到条目文本', () {
      final preview = previewVerdicts(
        _listCard([
          const RecallListItem(text: '光合作用', keywords: ['、', '。']),
        ]),
        '光合作用',
      );

      expect(preview.verdicts, _verdicts('ok'));
    });

    test('条目文本仅标点且无关键词：判 miss 而不是蒙对', () {
      final preview = previewVerdicts(
        _listCard([const RecallListItem(text: '、。')]),
        '、。',
      );

      expect(preview.verdicts, _verdicts('miss'));
    });
  });

  group('列举卡：retest 呈现集合', () {
    test('只呈现 pendingItems', () {
      final preview = previewVerdicts(
        _listCard(
          [
            const RecallListItem(text: '内膜', keywords: ['内膜']),
            const RecallListItem(text: '基质', keywords: ['基质']),
            const RecallListItem(text: '嵴', keywords: ['嵴']),
          ],
          mode: RecallCardMode.retest,
          pendingItems: const [2],
        ),
        '嵴',
      );

      expect(preview.presented, [2]);
      expect(preview.verdicts, _verdicts('ok'));
    });

    test('pendingItems 有越界与负数：剔除后保留合法项', () {
      final preview = previewVerdicts(
        _listCard(
          [
            const RecallListItem(text: '内膜', keywords: ['内膜']),
            const RecallListItem(text: '基质', keywords: ['基质']),
            const RecallListItem(text: '嵴', keywords: ['嵴']),
          ],
          mode: RecallCardMode.retest,
          pendingItems: const [5, -1, 2],
        ),
        '嵴',
      );

      expect(preview.presented, [2]);
      expect(preview.verdicts, _verdicts('ok'));
    });

    test('全是脏下标：退回全部条目', () {
      final preview = previewVerdicts(
        _listCard(
          [
            const RecallListItem(text: '内膜', keywords: ['内膜']),
            const RecallListItem(text: '基质', keywords: ['基质']),
            const RecallListItem(text: '嵴', keywords: ['嵴']),
          ],
          mode: RecallCardMode.retest,
          pendingItems: const [-1, 9],
        ),
        '内膜',
      );

      expect(preview.presented, [0, 1, 2]);
      expect(preview.verdicts, _verdicts('ok,miss,miss'));
    });

    test('pendingItems 为空数组：退回全部条目', () {
      final preview = previewVerdicts(
        _listCard(
          [
            const RecallListItem(text: '内膜', keywords: ['内膜']),
            const RecallListItem(text: '基质', keywords: ['基质']),
          ],
          mode: RecallCardMode.retest,
          pendingItems: const [],
        ),
        '基质',
      );

      expect(preview.presented, [0, 1]);
      expect(preview.verdicts, _verdicts('miss,ok'));
    });

    test('非 retest 即使带 pendingItems 也呈现全部', () {
      final preview = previewVerdicts(
        _listCard(
          [
            const RecallListItem(text: '内膜', keywords: ['内膜']),
            const RecallListItem(text: '基质', keywords: ['基质']),
          ],
          pendingItems: const [1],
        ),
        '内膜',
      );

      expect(preview.presented, [0, 1]);
      expect(preview.verdicts, _verdicts('ok,miss'));
    });

    test('子集顺序按 pendingItems 顺序（不是升序）', () {
      final preview = previewVerdicts(
        _listCard(
          [
            const RecallListItem(text: '内膜', keywords: ['内膜']),
            const RecallListItem(text: '基质', keywords: ['基质']),
            const RecallListItem(text: '嵴', keywords: ['嵴']),
          ],
          mode: RecallCardMode.retest,
          pendingItems: const [2, 0],
        ),
        '嵴',
      );

      expect(preview.presented, [2, 0]);
      expect(preview.verdicts, _verdicts('ok,miss'));
    });
  });

  group('填空卡：切段与逐空判分', () {
    test('单空精确匹配', () {
      final preview = previewVerdicts(
        _clozeCard([
          ['线粒体'],
        ]),
        '线粒体',
      );

      expect(preview.verdicts, _verdicts('ok'));
    });

    test('多答案任一命中（大小写归一化）', () {
      final preview = previewVerdicts(
        _clozeCard([
          ['ATP', '三磷酸腺苷'],
        ]),
        'atp',
      );

      expect(preview.verdicts, _verdicts('ok'));
    });

    test('双空顺序错位：两条都 miss', () {
      final preview = previewVerdicts(
        _clozeCard([
          ['A'],
          ['B'],
        ]),
        'B|A',
      );

      expect(preview.verdicts, _verdicts('miss,miss'));
    });

    test('段数不足：缺的空判 miss', () {
      final preview = previewVerdicts(
        _clozeCard([
          ['A'],
          ['B'],
        ]),
        'A',
      );

      expect(preview.verdicts, _verdicts('ok,miss'));
    });

    test('段数超出：多余段丢弃（不并进最后一空）', () {
      final preview = previewVerdicts(
        _clozeCard([
          ['A'],
        ]),
        'A|B|C',
      );

      expect(preview.verdicts, _verdicts('ok'));
    });

    test('中间空段占位', () {
      final preview = previewVerdicts(
        _clozeCard([
          ['A'],
          ['B'],
        ]),
        '|B',
      );

      expect(preview.verdicts, _verdicts('miss,ok'));
    });

    test('空作答：全 miss', () {
      final preview = previewVerdicts(
        _clozeCard([
          ['A'],
          ['B'],
        ]),
        '',
      );

      expect(preview.verdicts, _verdicts('miss,miss'));
    });

    test('双向包含：输入是答案子串（≥2 字符）判 ok', () {
      final preview = previewVerdicts(
        _clozeCard([
          ['选择透过性'],
        ]),
        '选择透过',
      );

      expect(preview.verdicts, _verdicts('ok'));
    });

    test('双向包含：答案是输入子串判 ok', () {
      final preview = previewVerdicts(
        _clozeCard([
          ['选择透过'],
        ]),
        '细胞膜的选择透过性',
      );

      expect(preview.verdicts, _verdicts('ok'));
    });

    test('单字输入不做包含匹配（避免蒙对）', () {
      final preview = previewVerdicts(
        _clozeCard([
          ['安全'],
        ]),
        '安',
      );

      expect(preview.verdicts, _verdicts('miss'));
    });

    test('单字答案精确匹配仍算 ok', () {
      final preview = previewVerdicts(
        _clozeCard([
          ['安'],
        ]),
        '安',
      );

      expect(preview.verdicts, _verdicts('ok'));
    });

    test('全角字母 + 中文标点', () {
      final preview = previewVerdicts(
        _clozeCard([
          ['atp'],
        ]),
        'ＡＴＰ。',
      );

      expect(preview.verdicts, _verdicts('ok'));
    });

    test('分号分隔', () {
      final preview = previewVerdicts(
        _clozeCard([
          ['A'],
          ['B'],
        ]),
        'A；B',
      );

      expect(preview.verdicts, _verdicts('ok,ok'));
    });

    test('空白分隔', () {
      final preview = previewVerdicts(
        _clozeCard([
          ['A'],
          ['B'],
        ]),
        'A B',
      );

      expect(preview.verdicts, _verdicts('ok,ok'));
    });

    test('换行分隔', () {
      final preview = previewVerdicts(
        _clozeCard([
          ['A'],
          ['B'],
        ]),
        'A\nB',
      );

      expect(preview.verdicts, _verdicts('ok,ok'));
    });

    test('顿号不切段：答案本身带顿号', () {
      final preview = previewVerdicts(
        _clozeCard([
          ['危及人身安全、健康'],
        ]),
        '危及人身安全、健康',
      );

      expect(preview.verdicts, _verdicts('ok'));
    });

    test('竖线优先级高于换行', () {
      final preview = previewVerdicts(
        _clozeCard([
          ['A\nB'],
          ['C'],
        ]),
        'A\nB|C',
      );

      expect(preview.verdicts, _verdicts('ok,ok'));
    });

    test('空位答案为空串：恒 miss', () {
      final preview = previewVerdicts(
        _clozeCard([
          [''],
        ]),
        '任意作答',
      );

      expect(preview.verdicts, _verdicts('miss'));
    });

    test('空位答案仅标点：归一化后为空恒 miss', () {
      final preview = previewVerdicts(
        _clozeCard([
          ['、'],
        ]),
        '、',
      );

      expect(preview.verdicts, _verdicts('miss'));
    });
  });

  group('填空卡：retest 只判呈现出来的空位', () {
    test('只判子集，段序 = 输入顺序', () {
      final preview = previewVerdicts(
        _clozeCard(
          [
            ['A'],
            ['B'],
            ['C'],
          ],
          mode: RecallCardMode.retest,
          pendingItems: const [2, 0],
        ),
        'C|A',
      );

      expect(preview.presented, [2, 0]);
      expect(preview.verdicts, _verdicts('ok,ok'));
    });

    test('段数按呈现空数截断，多余段丢弃', () {
      final preview = previewVerdicts(
        _clozeCard(
          [
            ['A'],
            ['B'],
            ['C'],
          ],
          mode: RecallCardMode.retest,
          pendingItems: const [0, 2],
        ),
        'A|C|多余',
      );

      expect(preview.presented, [0, 2]);
      expect(preview.verdicts, _verdicts('ok,ok'));
    });

    test('脏 pendingItems 全部剔除后退回全部空位', () {
      final preview = previewVerdicts(
        _clozeCard(
          [
            ['A'],
            ['B'],
          ],
          mode: RecallCardMode.retest,
          pendingItems: const [7, -3],
        ),
        'A',
      );

      expect(preview.presented, [0, 1]);
      expect(preview.verdicts, _verdicts('ok,miss'));
    });
  });
}

/// 把 `'ok,miss'` 这种期望表转成判分列表（空串 = 空列表）。
List<RecallVerdict> _verdicts(String spec) {
  if (spec.isEmpty) return const [];
  return spec
      .split(',')
      .map((raw) => raw.trim() == 'ok' ? RecallVerdict.ok : RecallVerdict.miss)
      .toList(growable: false);
}

RecallCard _listCard(
  List<RecallListItem> items, {
  RecallCardMode mode = RecallCardMode.first,
  List<int>? pendingItems,
}) {
  return RecallCard(
    cardId: 1,
    cardKey: 'c1',
    kind: RecallCardKind.list,
    groupKey: null,
    prompt: 'p',
    items: items,
    blanks: null,
    verbatim: false,
    state: null,
    mode: mode,
    pendingItems: pendingItems,
  );
}

/// [answersPerBlank] 每项是一个空的可接受答案列表。
RecallCard _clozeCard(
  List<List<String>> answersPerBlank, {
  RecallCardMode mode = RecallCardMode.first,
  List<int>? pendingItems,
}) {
  return RecallCard(
    cardId: 2,
    cardKey: 'c2',
    kind: RecallCardKind.cloze,
    groupKey: null,
    prompt: 'p',
    items: null,
    blanks: [
      for (final answers in answersPerBlank) RecallBlank(answers: answers),
    ],
    verbatim: false,
    state: null,
    mode: mode,
    pendingItems: pendingItems,
  );
}
