// 覆盖率门禁：把 `flutter test --coverage` 产出的 lcov.info 变成可执行的硬闸。
//
// 为什么不是"比一个全局数字"就完事：
// 1) 分母来自文件系统枚举 lib/**/*.dart，而不是 lcov 里出现的文件。否则
//    "新增文件但不写测试"会让它压根不出现在 lcov 里，全局覆盖率反而显得更好看；
//    这里给未出现在 lcov 的文件补 LF 代理（非空且非注释行数），LH=0。
// 2) 分 scope 设底线，防止"recall 测得好"掩盖"presentation 几乎全 0"。
// 3) 单文件只升不降（允许 2pp 抖动），防止已有测试被悄悄删掉而没人发现。
//
// 用法：
//   dart run tool/coverage_gate.dart                     # 门禁判定
//   dart run tool/coverage_gate.dart --update            # 只升不降地刷新基线
//   dart run tool/coverage_gate.dart --update --allow-lower
//       确实需要下调底线时用，并在 PR 描述里写明原因。
//   --lcov=<path> --baseline=<path>                      覆盖默认路径（调试用）

import 'dart:convert';
import 'dart:io';

const String _defaultLcovPath = 'coverage/lcov.info';
const String _defaultBaselinePath = 'coverage_baseline.json';

/// scope 判定优先级：越靠前越优先，保证每个文件只落一个 scope。
const List<String> _scopeOrder = <String>[
  'domain_data',
  'core',
  'shared',
  'providers',
  'screens',
  'other',
];

/// 单文件允许的自然抖动（百分点）。低于 基线-2.0 视为回退。
const double _fileDropTolerance = 2.0;

/// 新文件（基线里没有）落在 domain/data/core/shared 下的最低要求。
const double _newFileFloor = 60.0;

class _FileCoverage {
  const _FileCoverage(this.lines, this.hit);

  final int lines;
  final int hit;

  double get pct => lines == 0 ? 100.0 : hit / lines * 100.0;
}

class _ScopeAgg {
  _ScopeAgg();

  int files = 0;
  int lines = 0;
  int hit = 0;

  void add(_FileCoverage cov) {
    files++;
    lines += cov.lines;
    hit += cov.hit;
  }

  double get pct => lines == 0 ? 100.0 : hit / lines * 100.0;
}

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

  final lcov = _parseLcov(lcovFile.readAsStringSync());
  final libFiles = _enumerateLibFiles();
  final coverage = <String, _FileCoverage>{};
  var proxied = 0;
  for (final path in libFiles) {
    final fromLcov = lcov[path];
    if (fromLcov != null) {
      coverage[path] = fromLcov;
    } else {
      // LF 代理：用"非空且非注释行数"当分母，LH=0。宁可高估分母，
      // 也不要让新增文件因为没进 lcov 而在统计里消失。
      coverage[path] = _FileCoverage(_proxyLineCount(path), 0);
      proxied++;
    }
  }

  final scopeAgg = _aggregateScopes(coverage);
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
      proxied: proxied,
    );
    return;
  }

  if (!baselineFile.existsSync()) {
    stderr.writeln(
      '找不到基线 ${options.baselinePath}；先执行一次 --update 生成。',
    );
    exit(2);
  }

  final baseline = jsonDecode(baselineFile.readAsStringSync());
  if (baseline is! Map<String, dynamic>) {
    stderr.writeln('基线格式非法：顶层必须是 JSON 对象。');
    exit(2);
  }

  final violations = <String>[];
  // 拦截项计数：violations 里还包含分组标题和明细行，不能直接拿 length 当条数。
  var violationCount = 0;
  final globalFloor = _floorOf(baseline['global']);
  if (globalFloor == null) {
    stderr.writeln('基线缺少 global.floor。');
    exit(2);
  }
  if (_less(totalPct, globalFloor)) {
    violationCount++;
    violations.add(
      'global 覆盖率 ${_pct(totalPct)} < 底线 ${_pct(globalFloor)}'
      '（差 ${_pp(globalFloor - totalPct)}）',
    );
  }

  final baselineScopes = _asMap(baseline['scopes']);
  for (final scope in _scopeOrder) {
    final floor = _floorOf(baselineScopes[scope]);
    if (floor == null) continue;
    final agg = scopeAgg[scope];
    final current = agg?.pct ?? 0.0;
    if (_less(current, floor)) {
      violationCount++;
      violations.add(
        'scope $scope 覆盖率 ${_pct(current)} < 底线 ${_pct(floor)}'
        '（差 ${_pp(floor - current)}）',
      );
    }
  }

  // 单文件回退：基线记录过的文件不允许掉超过 2pp。
  final baselineFiles = _asMap(baseline['files']);
  final regressions = <String>[];
  for (final entry in baselineFiles.entries) {
    final measured = _measuredOf(entry.value);
    final cov = coverage[entry.key];
    if (measured == null || cov == null) continue;
    if (_less(cov.pct, measured - _fileDropTolerance)) {
      regressions.add(
        '${entry.key} 当前 ${_pct(cov.pct)}，基线 ${_pct(measured)}'
        '（回退 ${_pp(measured - cov.pct)} > ${_pp(_fileDropTolerance)}）',
      );
    }
  }
  if (regressions.isNotEmpty) {
    violationCount += regressions.length;
    violations
      ..add('单文件覆盖率回退 ${regressions.length} 个：')
      ..addAll(regressions.map((line) => '  - $line'));
  }

  // 新文件：基线里没有、但落在必须测的目录下，低于 60% 直接拦。
  final untestedNewFiles = <String>[];
  for (final entry in coverage.entries) {
    if (baselineFiles.containsKey(entry.key)) continue;
    if (!_requiresCoverage(entry.key)) continue;
    if (_less(entry.value.pct, _newFileFloor)) {
      untestedNewFiles.add(
        '${entry.key} 覆盖率 ${_pct(entry.value.pct)} < ${_pct(_newFileFloor)}'
        '（lines=${entry.value.lines}）',
      );
    }
  }
  if (untestedNewFiles.isNotEmpty) {
    violationCount += untestedNewFiles.length;
    violations
      ..add('新增文件未达最低覆盖率 ${untestedNewFiles.length} 个：')
      ..addAll(untestedNewFiles.map((line) => '  - $line'));
  }

  final report = _buildReport(
    coverage: coverage,
    scopeAgg: scopeAgg,
    totalPct: totalPct,
    totalFiles: coverage.length,
    totalLines: totalLines,
    totalHit: totalHit,
    floors: <String, double?>{
      'global': globalFloor,
      for (final scope in _scopeOrder)
        scope: _floorOf(baselineScopes[scope]),
    },
    proxied: proxied,
    violations: violations,
    updated: false,
  );

  stdout.write(report);
  _appendStepSummary(report);

  if (violations.isEmpty) {
    stdout.writeln('覆盖率门禁通过。');
  } else {
    stderr.writeln('覆盖率门禁失败：$violationCount 项不满足。');
    exit(1);
  }
}

class _Options {
  _Options();

  bool update = false;
  bool allowLower = false;
  bool help = false;
  String lcovPath = _defaultLcovPath;
  String baselinePath = _defaultBaselinePath;
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
  --lcov=<path>       lcov 文件路径，默认 coverage/lcov.info
  --baseline=<path>   基线路径，默认 coverage_baseline.json
''';

Map<String, _FileCoverage> _parseLcov(String text) {
  final result = <String, _FileCoverage>{};
  String? source;
  var lf = 0;
  var lh = 0;
  var daLines = 0;
  var daHit = 0;

  void flush() {
    final path = source;
    if (path == null) return;
    // 优先用 LF/LH；个别工具只写 DA，则用 DA 条数兜底。
    final lines = lf > 0 ? lf : daLines;
    final hit = lf > 0 ? lh : daHit;
    final previous = result[path];
    // 同一文件多条记录（例如多次 merge）累加。
    result[path] = previous == null
        ? _FileCoverage(lines, hit)
        : _FileCoverage(previous.lines + lines, previous.hit + hit);
  }

  for (final raw in const LineSplitter().convert(text)) {
    final line = raw.trim();
    if (line.isEmpty) continue;
    if (line.startsWith('SF:')) {
      flush();
      source = _normalize(line.substring(3));
      lf = 0;
      lh = 0;
      daLines = 0;
      daHit = 0;
    } else if (line.startsWith('LF:')) {
      lf = int.tryParse(line.substring(3).trim()) ?? 0;
    } else if (line.startsWith('LH:')) {
      lh = int.tryParse(line.substring(3).trim()) ?? 0;
    } else if (line.startsWith('DA:')) {
      final parts = line.substring(3).split(',');
      daLines++;
      final count = parts.length > 1 ? int.tryParse(parts[1].trim()) ?? 0 : 0;
      if (count > 0) daHit++;
    } else if (line == 'end_of_record') {
      flush();
      source = null;
    }
  }
  flush();
  return result;
}

List<String> _enumerateLibFiles() {
  final dir = Directory('lib');
  if (!dir.existsSync()) {
    stderr.writeln('找不到 lib/ 目录，请在 mobile_app 下运行本脚本。');
    exit(2);
  }
  final files = <String>[];
  for (final entity in dir.listSync(recursive: true, followLinks: false)) {
    if (entity is! File) continue;
    final path = _normalize(entity.path);
    if (!path.endsWith('.dart')) continue;
    // 生成代码不参与门禁：它们由 build_runner 产出，测不测都不是人手能改的。
    if (path.endsWith('.g.dart') || path.endsWith('.freezed.dart')) continue;
    // 入口文件只有 runApp，测试覆盖它没有意义。
    if (path == 'lib/main.dart') continue;
    files.add(path);
  }
  files.sort();
  return files;
}

int _proxyLineCount(String path) {
  var count = 0;
  var inBlockComment = false;
  for (final raw in File(path).readAsLinesSync()) {
    var line = raw.trim();
    if (line.isEmpty) continue;

    if (inBlockComment) {
      final end = line.indexOf('*/');
      if (end < 0) continue;
      inBlockComment = false;
      line = line.substring(end + 2).trim();
      if (line.isEmpty) continue;
    }

    if (line.startsWith('//')) continue;
    if (line.startsWith('/*')) {
      final end = line.indexOf('*/', 2);
      if (end < 0) {
        inBlockComment = true;
        continue;
      }
      final rest = line.substring(end + 2).trim();
      if (rest.isNotEmpty) count++;
      continue;
    }
    count++;
  }
  return count;
}

Map<String, _ScopeAgg> _aggregateScopes(
  Map<String, _FileCoverage> coverage,
) {
  final agg = <String, _ScopeAgg>{
    for (final scope in _scopeOrder) scope: _ScopeAgg(),
  };
  for (final entry in coverage.entries) {
    agg[_scopeOf(entry.key)]!.add(entry.value);
  }
  return agg;
}

String _scopeOf(String path) {
  final segments = path.split('/');
  // features/<name>/{domain,data}/** —— 纯逻辑层，最容易也最该被单测覆盖。
  if (segments.length >= 4 &&
      segments[0] == 'lib' &&
      segments[1] == 'features' &&
      (segments[3] == 'domain' || segments[3] == 'data')) {
    return 'domain_data';
  }
  if (path.startsWith('lib/core/')) return 'core';
  if (path.startsWith('lib/shared/')) return 'shared';
  final base = segments.last;
  if (base.endsWith('_provider.dart') || base.endsWith('_providers.dart')) {
    return 'providers';
  }
  if (path.contains('/presentation/')) return 'screens';
  // 顶层杂项（目前只有 app_router.dart），单列出来避免被算进 screens 里。
  return 'other';
}

bool _requiresCoverage(String path) {
  final segments = path.split('/');
  if (segments.length >= 4 &&
      segments[0] == 'lib' &&
      segments[1] == 'features' &&
      (segments[3] == 'domain' || segments[3] == 'data')) {
    return true;
  }
  return path.startsWith('lib/core/') || path.startsWith('lib/shared/');
}

void _runUpdate({
  required Map<String, _FileCoverage> coverage,
  required Map<String, _ScopeAgg> scopeAgg,
  required double totalPct,
  required File baselineFile,
  required bool allowLower,
  required int proxied,
}) {
  Map<String, dynamic>? previous;
  if (baselineFile.existsSync()) {
    final decoded = jsonDecode(baselineFile.readAsStringSync());
    if (decoded is! Map<String, dynamic>) {
      stderr.writeln('基线格式非法：顶层必须是 JSON 对象。');
      exit(2);
    }
    previous = decoded;
  }

  final previousScopes = _asMap(previous?['scopes']);
  final previousFiles = _asMap(previous?['files']);

  final lowers = <String>[];
  final floorNotes = <String>[];

  double nextFloor(String name, double current, double? oldFloor) {
    // 只升不降：新底线取 max(旧底线, 当前 - 1.0)；底线本身不允许是负数。
    final raw = _round(current - 1.0, 1);
    final candidate = raw < 0 ? 0.0 : raw;
    if (oldFloor == null) {
      // 首次生成基线：没有"旧底线"，不存在下调问题。
      floorNotes.add('$name 底线 新建 ${_pct(candidate)}');
      return candidate;
    }
    if (candidate < oldFloor - 1e-9) {
      lowers.add(
        '$name 底线需要从 ${_pct(oldFloor)} 下调到 ${_pct(candidate)}',
      );
      return allowLower ? candidate : oldFloor;
    }
    floorNotes.add('$name 底线 ${_pct(oldFloor)} → ${_pct(candidate)}');
    return candidate;
  }

  final globalFloor = nextFloor(
    'global',
    totalPct,
    _floorOf(previous?['global']),
  );

  final scopeFloors = <String, double>{};
  for (final scope in _scopeOrder) {
    final agg = scopeAgg[scope];
    final current = agg?.pct ?? 0.0;
    scopeFloors[scope] = nextFloor(
      'scope $scope',
      current,
      _floorOf(previousScopes[scope]),
    );
  }

  if (lowers.isNotEmpty && !allowLower) {
    stderr.writeln('拒绝写基线：以下底线会下降，而覆盖率底线不允许静默下调。');
    for (final line in lowers) {
      stderr.writeln('  - $line');
    }
    stderr.writeln(
      '若确属合理（例如删除了不可测代码），请加 --allow-lower 重跑，'
      '并在 PR 描述里写明原因。',
    );
    exit(1);
  }

  // 文件级：measured 只升不降，新文件补录；已删除的文件从基线里移除。
  final files = <String, dynamic>{};
  var added = 0;
  var raised = 0;
  for (final entry in coverage.entries) {
    final oldMeasured = _measuredOf(previousFiles[entry.key]);
    final current = _round(entry.value.pct, 2);
    if (oldMeasured == null) {
      added++;
      files[entry.key] = <String, dynamic>{'measured': current};
    } else {
      final next = current > oldMeasured ? current : _round(oldMeasured, 2);
      if (next > oldMeasured) raised++;
      files[entry.key] = <String, dynamic>{'measured': next};
    }
  }
  final dropped = previousFiles.keys
      .where((path) => !coverage.containsKey(path))
      .toList();

  final baseline = <String, dynamic>{
    '_comment':
        '覆盖率门禁基线：由 tool/coverage_gate.dart --update 生成，'
            '只升不降。floor 是硬闸，measured 用于检测单文件回退。',
    'generated_at': DateTime.now().toUtc().toIso8601String(),
    'global': <String, dynamic>{
      'floor': globalFloor,
      'measured': _round(totalPct, 2),
    },
    'scopes': <String, dynamic>{
      for (final scope in _scopeOrder)
        scope: <String, dynamic>{
          'floor': scopeFloors[scope],
          'measured': _round(scopeAgg[scope]?.pct ?? 0.0, 2),
        },
    },
    'files': files,
  };

  baselineFile.writeAsStringSync(
    '${const JsonEncoder.withIndent('  ').convert(baseline)}\n',
  );

  final report = _buildReport(
    coverage: coverage,
    scopeAgg: scopeAgg,
    totalPct: totalPct,
    totalFiles: coverage.length,
    totalLines: scopeAgg.values.fold<int>(0, (sum, agg) => sum + agg.lines),
    totalHit: scopeAgg.values.fold<int>(0, (sum, agg) => sum + agg.hit),
    floors: <String, double?>{
      'global': globalFloor,
      for (final scope in _scopeOrder) scope: scopeFloors[scope],
    },
    proxied: proxied,
    violations: const <String>[],
    updated: true,
  );
  stdout.write(report);
  _appendStepSummary(report);

  for (final note in floorNotes) {
    stdout.writeln(note);
  }
  stdout.writeln(
    '已写入 ${baselineFile.path}：文件 $added 个新增、$raised 个 measured 上调、'
    '${dropped.length} 个已删除文件移除。',
  );
  if (lowers.isNotEmpty) {
    stdout.writeln('（--allow-lower 生效，下调 ${lowers.length} 项底线）');
  }
}

String _buildReport({
  required Map<String, _FileCoverage> coverage,
  required Map<String, _ScopeAgg> scopeAgg,
  required double totalPct,
  required int totalFiles,
  required int totalLines,
  required int totalHit,
  required Map<String, double?> floors,
  required int proxied,
  required List<String> violations,
  required bool updated,
}) {
  final buffer = StringBuffer();
  buffer.writeln('## 覆盖率门禁${updated ? '（更新基线）' : ''}');
  buffer.writeln();
  buffer.writeln(
    '分母来自文件系统枚举的 lib/**/*.dart（排除 *.g.dart / *.freezed.dart / '
    'lib/main.dart），共 $totalFiles 个文件；其中 $proxied 个未出现在 lcov 里，'
    '按"非空非注释行数"补 LF 代理、命中记 0。',
  );
  buffer.writeln();
  buffer.writeln('| scope | files | lines | hit | cov% | floor | 状态 |');
  buffer.writeln('| --- | ---: | ---: | ---: | ---: | ---: | --- |');

  final globalFloor = floors['global'];
  buffer.writeln(
    '| **global** | $totalFiles | $totalLines | $totalHit | '
    '${_pct(totalPct)} | ${_floorText(globalFloor)} | '
    '${_status(totalPct, globalFloor)} |',
  );

  for (final scope in _scopeOrder) {
    final agg = scopeAgg[scope];
    if (agg == null || agg.files == 0) continue;
    final floor = floors[scope];
    buffer.writeln(
      '| $scope | ${agg.files} | ${agg.lines} | ${agg.hit} | '
      '${_pct(agg.pct)} | ${_floorText(floor)} | '
      '${_status(agg.pct, floor)} |',
    );
  }

  final lowFiles = coverage.entries
      .where((entry) => _less(entry.value.pct, _newFileFloor))
      .toList()
    ..sort((a, b) => a.value.pct.compareTo(b.value.pct));
  if (lowFiles.isNotEmpty) {
    buffer.writeln();
    buffer.writeln(
      '低于 ${_pct(_newFileFloor)} 的文件（共 ${lowFiles.length} 个）：',
    );
    buffer.writeln();
    buffer.writeln('| 文件 | lines | hit | cov% |');
    buffer.writeln('| --- | ---: | ---: | ---: |');
    for (final entry in lowFiles) {
      buffer.writeln(
        '| ${entry.key} | ${entry.value.lines} | ${entry.value.hit} | '
        '${_pct(entry.value.pct)} |',
      );
    }
  }

  if (violations.isNotEmpty) {
    buffer.writeln();
    buffer.writeln('### 拦截原因');
    for (final line in violations) {
      buffer.writeln('- $line');
    }
  }

  return buffer.toString();
}

String _status(double current, double? floor) {
  if (floor == null) return '无底线';
  return _less(current, floor) ? 'FAIL' : 'PASS';
}

String _floorText(double? floor) => floor == null ? '-' : _pct(floor);

String _pct(double value) => '${value.toStringAsFixed(1)}%';

String _pp(double value) => '${value.abs().toStringAsFixed(1)}pp';

bool _less(double a, double b) => a + 1e-9 < b;

double _round(double value, int digits) {
  final factor = digits == 1 ? 10 : 100;
  return (value * factor).round() / factor;
}

String _normalize(String path) {
  var normalized = path.replaceAll('\\', '/');
  while (normalized.startsWith('./')) {
    normalized = normalized.substring(2);
  }
  return normalized;
}

Map<String, dynamic> _asMap(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) {
    return value.map((key, item) => MapEntry(key.toString(), item));
  }
  return <String, dynamic>{};
}

double? _floorOf(Object? node) {
  if (node is Map && node['floor'] is num) {
    return (node['floor'] as num).toDouble();
  }
  return null;
}

double? _measuredOf(Object? node) {
  if (node is Map && node['measured'] is num) {
    return (node['measured'] as num).toDouble();
  }
  return null;
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
