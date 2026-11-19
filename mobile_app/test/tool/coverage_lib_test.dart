/// 覆盖率门禁纯逻辑层的单测：不跑 git、不碰网络、不写文件。
///
/// 守的是第二轮改造的四条口径（G1–G4/G6），以及 `--update` 的只升不降：
/// 第一轮在「分支 + 最新 main」的合并结果上把 main 带来的文件算成本 PR 新增、
/// 把本 PR 改过的文件算成回退，误伤了两个 PR。这里的用例就是那两次误报的
/// 最小复现，改坏任何一条都会立刻变红。
library;

import 'package:flutter_test/flutter_test.dart';

import '../../tool/coverage_lib.dart';

Map<String, dynamic> _baseline({
  double globalFloor = 0.0,
  double globalMeasured = 0.0,
  Map<String, double> scopes = const <String, double>{},
  Map<String, double> files = const <String, double>{},
  List<Map<String, dynamic>> exempt = const <Map<String, dynamic>>[],
}) {
  return <String, dynamic>{
    'global': <String, dynamic>{
      'floor': globalFloor,
      'measured': globalMeasured,
    },
    'scopes': <String, dynamic>{
      for (final entry in scopes.entries)
        entry.key: <String, dynamic>{
          'floor': entry.value,
          'measured': entry.value,
        },
    },
    'exempt': exempt,
    'files': <String, dynamic>{
      for (final entry in files.entries)
        entry.key: <String, dynamic>{'measured': entry.value},
    },
  };
}

GateInput _input({
  required Map<String, FileCoverage> coverage,
  Map<String, dynamic>? baseline,
  Set<String> addedFiles = const <String>{},
  Set<String> touchedFiles = const <String>{},
  Map<String, List<int>> addedLineRanges = const <String, List<int>>{},
  Set<String> exemptPaths = const <String>{},
  String? base = 'deadbeef',
}) {
  return GateInput(
    coverage: coverage,
    baseline: baseline ?? _baseline(),
    addedFiles: addedFiles,
    touchedFiles: touchedFiles,
    addedLineRanges: addedLineRanges,
    exemptPaths: exemptPaths,
    base: base,
  );
}

void main() {
  test('parseLcov：同文件多记录累加，缺 LF/LH 时用 DA 条数兜底', () {
    const text = '''
SF:lib/core/a.dart
DA:1,1
DA:2,0
LF:2
LH:1
end_of_record
SF:lib/core/a.dart
DA:1,1
DA:2,0
LF:2
LH:1
end_of_record
SF:lib/core/b.dart
DA:3,1
DA:4,1
DA:5,0
end_of_record
''';

    final parsed = parseLcov(text);

    // 两条记录累加：2+2 行、1+1 命中。
    expect(parsed['lib/core/a.dart']!.lines, 4);
    expect(parsed['lib/core/a.dart']!.hit, 2);
    // 没有 LF/LH：分母退化成 DA 条数（3），命中 2。
    expect(parsed['lib/core/b.dart']!.lines, 3);
    expect(parsed['lib/core/b.dart']!.hit, 2);
    // DA 行号保留下来给 G5 求交。
    expect(parsed['lib/core/a.dart']!.daHits[1], 1);
    expect(parsed['lib/core/a.dart']!.daHits[2], 0);
  });

  test('scopeOf：七类路径各归一个 scope', () {
    expect(scopeOf('lib/features/practice/data/x.dart'), 'domain_data');
    expect(scopeOf('lib/features/practice/domain/y.dart'), 'domain_data');
    expect(scopeOf('lib/core/local/local_schema.dart'), 'core');
    expect(scopeOf('lib/shared/api_client.dart'), 'shared');
    // provider 判定优先于屏：presentation 下的 *_provider.dart 归 providers。
    expect(scopeOf('lib/features/x/presentation/x_provider.dart'), 'providers');
    expect(scopeOf('lib/features/x/presentation/x_page.dart'), 'screens');
    // 顶层杂项单列，避免被算进 screens。
    expect(scopeOf('lib/app_router.dart'), 'other');
  });

  test('requiresNewFileCoverage：只要求逻辑层，core/theme 明确排除（G3）', () {
    expect(requiresNewFileCoverage('lib/core/theme/app_colors.dart'), isFalse);
    expect(requiresNewFileCoverage('lib/core/local/local_schema.dart'), isTrue);
    expect(requiresNewFileCoverage('lib/features/x/data/y.dart'), isTrue);
    expect(requiresNewFileCoverage('lib/features/x/domain/y.dart'), isTrue);
    expect(requiresNewFileCoverage('lib/shared/datasources/y.dart'), isTrue);
    expect(requiresNewFileCoverage('lib/shared/widgets/y.dart'), isFalse);
    expect(
      requiresNewFileCoverage('lib/features/x/presentation/y.dart'),
      isFalse,
    );
  });

  test('exempt：跳过两条拦截，但分母里仍然算它的行（G6）', () {
    // app_icons 在基线里且实测掉到 0（回退分支）；legacy 是基线外的新文件
    // 且落在 core（新增文件分支）。两条规则都会命中。
    final coverage = <String, FileCoverage>{
      'lib/core/theme/app_icons.dart': const FileCoverage(87, 0),
      'lib/core/sync/legacy.dart': const FileCoverage(10, 0),
    };
    final baseline = _baseline(
      files: const <String, double>{'lib/core/theme/app_icons.dart': 100.0},
    );

    final without = runGate(
      _input(
        coverage: coverage,
        baseline: baseline,
        addedFiles: const <String>{'lib/core/sync/legacy.dart'},
      ),
    );
    expect(without.passed, isFalse);
    expect(without.violationCount, 2);

    const exempt = <String>{
      'lib/core/theme/app_icons.dart',
      'lib/core/sync/legacy.dart',
    };
    final exempted = runGate(
      _input(
        coverage: coverage,
        baseline: baseline,
        addedFiles: const <String>{'lib/core/sync/legacy.dart'},
        exemptPaths: exempt,
      ),
    );
    expect(exempted.passed, isTrue);
    expect(exempted.violations, isEmpty);
    // 关键：豁免只是不拦，不是从统计里删掉——分母仍然是 87 + 10。
    expect(exempted.totalLines, 97);
  });

  test('G2：addedFiles 之外的低覆盖文件不报"新增文件"', () {
    // 模拟 main 带来的 app_version.dart：不在本 PR 的 diff 里，覆盖率 0。
    final coverage = <String, FileCoverage>{
      'lib/core/compat/app_version.dart': const FileCoverage(20, 0),
    };
    final baseline = _baseline();

    // 本 PR 没新增任何文件 → 不拦。
    final mainOnly = runGate(
      _input(
        coverage: coverage,
        baseline: baseline,
        addedFiles: const <String>{},
      ),
    );
    expect(mainOnly.passed, isTrue);
    expect(mainOnly.violations, isEmpty);

    // 同一个文件如果确实是本 PR 新增的 → 该拦。
    final inPr = runGate(
      _input(
        coverage: coverage,
        baseline: baseline,
        addedFiles: const <String>{'lib/core/compat/app_version.dart'},
      ),
    );
    expect(inPr.passed, isFalse);
    expect(inPr.violations.join('\n'), contains('新增文件未达最低覆盖率'));
  });

  test('G4：本 PR 触碰过的文件不报单文件回退，未触碰的仍报', () {
    final coverage = <String, FileCoverage>{
      // 10/100 = 10%，基线 90% —— 两条都"看起来"回退了 80pp。
      'lib/core/touched.dart': const FileCoverage(100, 10),
      'lib/core/untouched.dart': const FileCoverage(100, 10),
    };
    final baseline = _baseline(
      files: const <String, double>{
        'lib/core/touched.dart': 90.0,
        'lib/core/untouched.dart': 90.0,
      },
    );

    final result = runGate(
      _input(
        coverage: coverage,
        baseline: baseline,
        touchedFiles: const <String>{'lib/core/touched.dart'},
      ),
    );

    final text = result.violations.join('\n');
    expect(text, isNot(contains('lib/core/touched.dart')));
    expect(text, contains('lib/core/untouched.dart'));
    expect(result.passed, isFalse);

    // 对照组：不声明 touched 时，touched.dart 也会被拦——证明是 G4 在放行。
    final control = runGate(_input(coverage: coverage, baseline: baseline));
    expect(
      control.violations.join('\n'),
      contains('lib/core/touched.dart'),
    );
  });

  test('G1：base == null 时跳过 G2/G4 并给出警告，底线照旧', () {
    final coverage = <String, FileCoverage>{
      'lib/core/a.dart': const FileCoverage(100, 10),
    };
    final baseline = _baseline(
      files: const <String, double>{'lib/core/a.dart': 90.0},
    );

    final degraded = runGate(
      _input(
        coverage: coverage,
        baseline: baseline,
        addedFiles: const <String>{'lib/core/a.dart'},
        touchedFiles: const <String>{'lib/core/a.dart'},
        base: null,
      ),
    );
    expect(degraded.degraded, isTrue);
    expect(degraded.warnings.join('\n'), contains('无法确定 PR 基线'));
    expect(degraded.passed, isTrue);
    expect(degraded.violations.join('\n'), isNot(contains('单文件覆盖率回退')));
    expect(degraded.netChange.available, isFalse);

    // 降级不等于放行：global 底线仍然生效。
    final floorBreach = runGate(
      _input(
        coverage: coverage,
        baseline: _baseline(globalFloor: 99.0),
        base: null,
      ),
    );
    expect(floorBreach.passed, isFalse);
    expect(floorBreach.violations.join('\n'), contains('global 覆盖率'));
  });

  test('applyUpdate：底线只升不降，文件 measured 取 max，exempt 保留', () {
    final coverage = <String, FileCoverage>{
      'lib/core/a.dart': const FileCoverage(10, 2), // 20%
    };
    final scopeAgg = aggregateScopes(coverage);
    final previous = _baseline(
      globalFloor: 30.0,
      globalMeasured: 30.0,
      scopes: <String, double>{for (final scope in scopeOrder) scope: 0.0},
      files: const <String, double>{'lib/core/a.dart': 90.0},
      exempt: const <Map<String, dynamic>>[
        <String, dynamic>{
          'path': 'lib/core/theme/app_icons.dart',
          'reason': '纯图标常量，无行为',
        },
      ],
    );

    // 实测 20% → 候选底线 19 < 旧底线 30，没给 --allow-lower 就拒绝写入。
    final rejected = applyUpdate(
      coverage: coverage,
      scopeAgg: scopeAgg,
      totalPct: 20.0,
      previous: previous,
      allowLower: false,
    );
    expect(rejected.accepted, isFalse);
    expect(rejected.lowers, isNotEmpty);

    final accepted = applyUpdate(
      coverage: coverage,
      scopeAgg: scopeAgg,
      totalPct: 20.0,
      previous: previous,
      allowLower: true,
      exempt: exemptEntriesOf(previous),
    );
    expect(accepted.accepted, isTrue);
    expect(accepted.baseline!['global']['floor'], 19.0);
    // 文件 measured 取 max(旧 90, 实测 20) —— 不降。
    expect(accepted.baseline!['files']['lib/core/a.dart']['measured'], 90.0);
    // exempt 原样保留（含 reason）。
    expect(accepted.baseline!['exempt'], hasLength(1));
    expect(
      accepted.baseline!['exempt'][0]['reason'],
      '纯图标常量，无行为',
    );

    // 旧底线低于候选时正常抬升：floor = max(旧, 实测 - 1.0)。
    final raised = applyUpdate(
      coverage: coverage,
      scopeAgg: scopeAgg,
      totalPct: 20.0,
      previous: _baseline(
        globalFloor: 10.0,
        globalMeasured: 10.0,
        files: const <String, double>{'lib/core/a.dart': 5.0},
      ),
      allowLower: false,
    );
    expect(raised.accepted, isTrue);
    expect(raised.baseline!['global']['floor'], 19.0);
    expect(raised.baseline!['files']['lib/core/a.dart']['measured'], 20.0);
  });
}
