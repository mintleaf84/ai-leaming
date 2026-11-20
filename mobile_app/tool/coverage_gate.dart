// 覆盖率门禁 CLI：把 `flutter test --coverage` 产出的 lcov.info 变成可执行的硬闸。
//
// 判定逻辑全在 `tool/coverage_lib.dart`（纯函数、可单测）；本文件只负责
// 参数解析 → 读 lcov/基线 → 用 git 查 PR 作用域 → 调 runGate → 输出与退出码。
//
// 为什么需要 git（第二轮新增）：
// CI 在「分支 + 最新 main」的合并结果上跑，第一轮把两条规则当成全局规则，
// 于是 main 带来的新文件被算成"本 PR 新增"、本 PR 改过的文件百分比变化被算成
// "回退"，两类误报各打掉一个 PR。现在：
//   G1 默认基线 = `git merge-base HEAD origin/main`（回退 origin/master），
//      查不到就降级并明确警告，只跳过 PR 作用域规则；
//   G2 新增文件规则只看 `git diff --diff-filter=A`；
//   G4 单文件回退只对本 PR 未触碰的文件生效。
//
// 用法：
//   dart run tool/coverage_gate.dart                     # 门禁判定
//   dart run tool/coverage_gate.dart --base=<sha>        # 显式指定 PR 基线
//   dart run tool/coverage_gate.dart --update            # 只升不降地刷新基线
//   dart run tool/coverage_gate.dart --update --allow-lower
//       确实需要下调底线时用，并在 PR 描述里写明原因。
//   --lcov=<path> --baseline=<path>                      覆盖默认路径（调试用）

import 'dart:convert';
import 'dart:io';

import 'coverage_lib.dart';

void main(List<String> args) {
  final options = _parseArgs(args);
  if (options.help) {
    stdout.writeln(_usage());
    return;
  }

  final lcovFile = File(options.lcovPath);
  if (!lcovFile.existsSync()) {
    stderr.writeln('找不到 ${options.lcovPath}，先跑：flutter test --coverage');
    exit(2);
  }

  final lcov = parseLcov(lcovFile.readAsStringSync());
  final List<String> libFiles;
  try {
    libFiles = enumerateLibFiles('lib');
  } on FileSystemException {
    stderr.writeln('找不到 lib/ 目录，请在 mobile_app 下运行本脚本。');
    exit(2);
  }

  // 分母来自文件系统枚举，而不是 lcov 里出现的文件：否则"新增文件但不写测试"
  // 会让它压根不出现，全局覆盖率反而更好看。
  final coverage = <String, FileCoverage>{};
  final proxyLineCounts = <String, int>{};
  for (final path in libFiles) {
    final fromLcov = lcov[path];
    if (fromLcov != null) {
      coverage[path] = fromLcov;
    } else {
      final count = proxyLineCount(path);
      proxyLineCounts[path] = count;
      coverage[path] = FileCoverage(count, 0);
    }
  }

  final scopeAgg = aggregateScopes(coverage);
  final totalLines = scopeAgg.values.fold<int>(0, (sum, agg) => sum + agg.lines);
  final totalHit = scopeAgg.values.fold<int>(0, (sum, agg) => sum + agg.hit);
  final totalPct = totalLines == 0 ? 100.0 : totalHit / totalLines * 100.0;

  final baselineFile = File(options.baselinePath);

  if (options.update) {
    _runUpdate(
      coverage: coverage,
      scopeAgg: scopeAgg,
      totalPct: totalPct,
      baselineFile: baselineFile,
      allowLower: options.allowLower,
      proxied: proxyLineCounts.length,
    );
    return;
  }

  if (!baselineFile.existsSync()) {
    stderr.writeln('找不到基线 ${options.baselinePath}；先执行一次 --update 生成。');
    exit(2);
  }

  final baseline = _readBaseline(baselineFile);

  // G1：PR 基线。拿不到就降级（runGate 会给出 warnings）。
  final resolution = _resolveBase(options.base);
  if (resolution.warning != null) {
    stderr.writeln('警告：${resolution.warning}');
  }

  var addedFiles = <String>{};
  var touchedFiles = <String>{};
  var addedLineRanges = <String, List<int>>{};
  if (resolution.sha != null) {
    addedFiles = _gitPathSet([
      'diff',
      '--name-only',
      '--relative',
      '--diff-filter=A',
      '${resolution.sha}...HEAD',
      '--',
      'lib',
    ]);
    touchedFiles = _gitPathSet([
      'diff',
      '--name-only',
      '--relative',
      '${resolution.sha}...HEAD',
      '--',
      'lib',
    ]);
    final diff = _git([
      'diff',
      '-U0',
      '--relative',
      '${resolution.sha}...HEAD',
      '--',
      'lib',
    ]);
    if (diff != null) addedLineRanges = parseAddedLineRanges(diff);
  }

  final GateResult result;
  try {
    result = runGate(
      GateInput(
        coverage: coverage,
        baseline: baseline,
        addedFiles: addedFiles,
        touchedFiles: touchedFiles,
        addedLineRanges: addedLineRanges,
        exemptPaths: exemptPathsOf(baseline),
        base: resolution.sha,
        proxyLineCounts: proxyLineCounts,
      ),
    );
  } on GateConfigException catch (error) {
    stderr.writeln('基线不可用：${error.message}');
    exit(2);
  }

  stdout.write(result.report);
  _appendStepSummary(result.report);

  if (result.passed) {
    stdout.writeln('覆盖率门禁通过。');
  } else {
    stderr.writeln('覆盖率门禁失败：${result.violationCount} 项不满足。');
    exit(1);
  }
}

class _Options {
  _Options();

  bool update = false;
  bool allowLower = false;
  bool help = false;
  String? base;
  String lcovPath = defaultLcovPath;
  String baselinePath = defaultBaselinePath;
}

_Options _parseArgs(List<String> args) {
  final options = _Options();
  for (final arg in args) {
    if (arg == '--update') {
      options.update = true;
    } else if (arg == '--allow-lower') {
      options.allowLower = true;
    } else if (arg == '--help' || arg == '-h') {
      options.help = true;
    } else if (arg.startsWith('--base=')) {
      options.base = arg.substring('--base='.length);
    } else if (arg.startsWith('--lcov=')) {
      options.lcovPath = arg.substring('--lcov='.length);
    } else if (arg.startsWith('--baseline=')) {
      options.baselinePath = arg.substring('--baseline='.length);
    } else {
      stderr.writeln('未知参数：$arg\n\n${_usage()}');
      exit(2);
    }
  }
  return options;
}

String _usage() => '''
覆盖率门禁

  dart run tool/coverage_gate.dart [选项]

选项：
  --update            只升不降地刷新基线（coverage_baseline.json）
  --allow-lower       配合 --update，允许下调底线（需在 PR 描述里写明原因）
  --base=<sha>        显式指定 PR 基线（默认 git merge-base HEAD origin/main，
                      回退 origin/master；都拿不到则跳过 PR 作用域规则）
  --lcov=<path>       lcov 文件路径，默认 coverage/lcov.info
  --baseline=<path>   基线路径，默认 coverage_baseline.json
''';

class _BaseResolution {
  const _BaseResolution(this.sha, this.warning);

  final String? sha;
  final String? warning;
}

/// G1：解析 PR 基线。显式 `--base` 优先；否则依次试 origin/main、origin/master。
_BaseResolution _resolveBase(String? explicit) {
  if (explicit != null && explicit.isNotEmpty) {
    if (_git(['rev-parse', '--verify', '--quiet', '$explicit^{commit}']) !=
        null) {
      return _BaseResolution(explicit, null);
    }
    return _BaseResolution(
      null,
      '--base=$explicit 无法解析成 commit，已跳过 PR 作用域规则（G2/G4）。',
    );
  }
  for (final ref in const <String>['origin/main', 'origin/master']) {
    final base = _git(['merge-base', 'HEAD', ref]);
    if (base != null && base.trim().isNotEmpty) {
      return _BaseResolution(base.trim(), null);
    }
  }
  return const _BaseResolution(
    null,
    'git merge-base 找不到 origin/main 或 origin/master'
        '（浅克隆？checkout 需要 fetch-depth: 0），'
        '已跳过 PR 作用域规则（G2/G4）。',
  );
}

/// 跑 git，成功返回 stdout，失败返回 null（不打印 git 自己的报错）。
String? _git(List<String> args) {
  try {
    final result = Process.runSync('git', args);
    if (result.exitCode != 0) return null;
    return result.stdout as String;
  } on ProcessException {
    return null;
  }
}

Set<String> _gitPathSet(List<String> args) {
  final output = _git(args);
  if (output == null) return <String>{};
  final paths = <String>{};
  for (final raw in const LineSplitter().convert(output)) {
    final line = raw.trim();
    if (line.isEmpty) continue;
    // 即便加了 --relative，也可能带 ./ 或仓库根前缀，统一成 lib/... 形式。
    var path = normalizePath(line);
    final index = path.indexOf('lib/');
    if (index > 0) path = path.substring(index);
    paths.add(path);
  }
  return paths;
}

Map<String, dynamic> _readBaseline(File file) {
  final Object? decoded;
  try {
    decoded = jsonDecode(file.readAsStringSync());
  } on FormatException catch (error) {
    stderr.writeln('基线不是合法 JSON：${error.message}');
    exit(2);
  }
  if (decoded is! Map<String, dynamic>) {
    stderr.writeln('基线格式非法：顶层必须是 JSON 对象。');
    exit(2);
  }
  return decoded;
}

void _runUpdate({
  required Map<String, FileCoverage> coverage,
  required Map<String, ScopeAgg> scopeAgg,
  required double totalPct,
  required File baselineFile,
  required bool allowLower,
  required int proxied,
}) {
  Map<String, dynamic>? previous;
  if (baselineFile.existsSync()) {
    previous = _readBaseline(baselineFile);
  }

  final outcome = applyUpdate(
    coverage: coverage,
    scopeAgg: scopeAgg,
    totalPct: totalPct,
    previous: previous,
    allowLower: allowLower,
    exempt: exemptEntriesOf(previous),
  );

  if (!outcome.accepted) {
    stderr.writeln('拒绝写基线：以下底线会下降，而覆盖率底线不允许静默下调。');
    for (final line in outcome.lowers) {
      stderr.writeln('  - $line');
    }
    stderr.writeln(
      '若确属合理（例如删除了不可测代码），请加 --allow-lower 重跑，'
      '并在 PR 描述里写明原因。',
    );
    exit(1);
  }

  baselineFile.writeAsStringSync(
    '${const JsonEncoder.withIndent('  ').convert(outcome.baseline)}\n',
  );

  final report = buildReport(
    coverage: coverage,
    scopeAgg: scopeAgg,
    totalPct: totalPct,
    totalFiles: coverage.length,
    totalLines: scopeAgg.values.fold<int>(0, (sum, agg) => sum + agg.lines),
    totalHit: scopeAgg.values.fold<int>(0, (sum, agg) => sum + agg.hit),
    floors: outcome.floors,
    proxied: proxied,
    violations: const <String>[],
    warnings: const <String>[],
    updated: true,
    netChange: const NetChange.unavailable('更新基线模式，不统计 PR 净变化。'),
    exemptPaths: exemptPathsOf(outcome.baseline!),
  );
  stdout.write(report);
  _appendStepSummary(report);

  for (final note in outcome.notes) {
    stdout.writeln(note);
  }
  stdout.writeln(
    '已写入 ${baselineFile.path}：文件 ${outcome.added} 个新增、'
    '${outcome.raised} 个 measured 上调、${outcome.dropped.length} 个已删除文件移除。',
  );
  if (outcome.lowers.isNotEmpty) {
    stdout.writeln('（--allow-lower 生效，下调 ${outcome.lowers.length} 项底线）');
  }
}

void _appendStepSummary(String report) {
  final summaryPath = Platform.environment['GITHUB_STEP_SUMMARY'];
  if (summaryPath == null || summaryPath.isEmpty) return;
  try {
    File(summaryPath).writeAsStringSync('$report\n', mode: FileMode.append);
  } on FileSystemException catch (error) {
    stderr.writeln('写入 GITHUB_STEP_SUMMARY 失败：${error.message}');
  }
}
