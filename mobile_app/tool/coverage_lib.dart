/// 覆盖率门禁的纯逻辑层：所有输入显式传入，**不读 git、不依赖 cwd**，
/// 因此可以在 `test/tool/` 里直接单测（无 subprocess、无网络）。
///
/// 分层的原因见 `docs/flutter-mobile-plan.md` §13：
/// 第一轮把"基线外文件必须 ≥60%"和"单文件只升不降"当成全局规则，结果在
/// 「分支 + 最新 main」的合并结果上误伤了两类 PR——main 带来的新文件被算成
/// 本 PR 的新文件；本 PR 改过的文件百分比自然变化被算成回退。第二轮把这两条
/// 收窄成 **PR 作用域**（G2/G4），并把"哪些目录才要求新文件覆盖率"收窄到
/// 逻辑层（G3）。
library;

import 'dart:convert';
import 'dart:io';

const String defaultLcovPath = 'coverage/lcov.info';
const String defaultBaselinePath = 'coverage_baseline.json';

/// scope 判定优先级：越靠前越优先，保证每个文件只落一个 scope。
const List<String> scopeOrder = <String>[
  'domain_data',
  'core',
  'shared',
  'providers',
  'screens',
  'other',
];

/// 单文件允许的自然抖动（百分点）。低于 基线-2.0 视为回退。
const double fileDropTolerance = 2.0;

/// 新文件（基线里没有）落在逻辑层下的最低要求。
const double newFileFloor = 60.0;

/// `--update` 生成底线时的余量：floor = 实测 - 1.0（且不低于旧底线）。
const double updateSlack = 1.0;

/// 单个文件的覆盖数据。
class FileCoverage {
  const FileCoverage(
    this.lines,
    this.hit, [
    this.daHits = const <int, int>{},
  ]);

  /// 可执行行数（分母）。
  final int lines;

  /// 命中行数（分子）。
  final int hit;

  /// 行号 → 命中次数，来自 lcov 的 `DA:` 记录（G5 用它和新增行号求交）。
  final Map<int, int> daHits;

  double get pct => lines == 0 ? 100.0 : hit / lines * 100.0;

  @override
  String toString() => 'FileCoverage(lines: $lines, hit: $hit)';
}

/// 一个 scope 的聚合值。
class ScopeAgg {
  ScopeAgg();

  int files = 0;
  int lines = 0;
  int hit = 0;

  void add(FileCoverage cov) {
    files++;
    lines += cov.lines;
    hit += cov.hit;
  }

  double get pct => lines == 0 ? 100.0 : hit / lines * 100.0;
}

/// 本 PR 的净变化（G5）。
class NetChange {
  const NetChange({
    required this.available,
    required this.addedLines,
    required this.coveredLines,
    required this.globalDelta,
    required this.baselineGlobal,
    this.reason = '',
  });

  /// 拿不到 PR 基线时为 false，此时下面的数字都无意义。
  const NetChange.unavailable(this.reason)
    : available = false,
      addedLines = 0,
      coveredLines = 0,
      globalDelta = 0,
      baselineGlobal = 0;

  final bool available;

  /// 本 PR 新增、且 lcov 认定为可执行的行数。
  final int addedLines;

  /// 其中被覆盖的行数。
  final int coveredLines;

  /// 当前 global − 基线 measured，单位 pp。
  final double globalDelta;

  final double baselineGlobal;

  final String reason;

  double get pct => addedLines == 0 ? 100.0 : coveredLines / addedLines * 100.0;
}

/// 门禁的完整输入：git 侧的信息由调用方查好后传进来，便于构造场景。
class GateInput {
  const GateInput({
    required this.coverage,
    required this.baseline,
    required this.addedFiles,
    required this.touchedFiles,
    required this.addedLineRanges,
    required this.exemptPaths,
    required this.base,
    this.proxyLineCounts = const <String, int>{},
  });

  /// 文件 → 覆盖数据（已包含"未进 lcov 的文件"的 LF 代理）。
  final Map<String, FileCoverage> coverage;

  /// `coverage_baseline.json` 解码后的顶层对象。
  final Map<String, dynamic> baseline;

  /// `git diff --diff-filter=A <base>...HEAD -- lib` 的结果（G2）。
  final Set<String> addedFiles;

  /// `git diff --name-only <base>...HEAD -- lib` 的结果（G4）。
  final Set<String> touchedFiles;

  /// `git diff -U0 <base>...HEAD -- lib` 解析出的新增行号（G5）。
  final Map<String, List<int>> addedLineRanges;

  /// 基线 `exempt` 清单里的路径（G6）。
  final Set<String> exemptPaths;

  /// PR 基线 sha；null 表示无法确定，走 G1 降级分支。
  final String? base;

  /// 未出现在 lcov 里的文件 → 代理行数（只用于报告）。
  final Map<String, int> proxyLineCounts;
}

/// 门禁结果。`violations` 里含分组标题行，计数看 [violationCount]。
class GateResult {
  const GateResult({
    required this.violations,
    required this.violationCount,
    required this.warnings,
    required this.report,
    required this.netChange,
    required this.totalLines,
    required this.totalHit,
    required this.totalPct,
    required this.degraded,
  });

  final List<String> violations;
  final int violationCount;
  final List<String> warnings;
  final String report;
  final NetChange netChange;
  final int totalLines;
  final int totalHit;
  final double totalPct;

  /// true 表示走了 G1 降级分支（G2/G4 被跳过）。
  final bool degraded;

  bool get passed => violations.isEmpty;
}

/// 基线本身不可用（缺 global.floor、JSON 非法等）。调用方按配置错误退出。
class GateConfigException implements Exception {
  GateConfigException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// `--update` 的结果：`baseline == null` 表示拒绝写入（需要下调但没给 --allow-lower）。
class UpdateOutcome {
  const UpdateOutcome({
    required this.baseline,
    required this.notes,
    required this.lowers,
    required this.floors,
    required this.added,
    required this.raised,
    required this.dropped,
  });

  final Map<String, dynamic>? baseline;
  final List<String> notes;
  final List<String> lowers;
  final Map<String, double?> floors;
  final int added;
  final int raised;
  final List<String> dropped;

  bool get accepted => baseline != null;
}

// ---------------------------------------------------------------------------
// 解析与枚举
// ---------------------------------------------------------------------------

/// 解析 lcov。同一文件出现多条记录时累加；缺 `LF:`/`LH:` 时用 `DA:` 条数兜底。
Map<String, FileCoverage> parseLcov(String text) {
  final result = <String, FileCoverage>{};
  String? source;
  var lf = 0;
  var lh = 0;
  var daLines = 0;
  var daHit = 0;
  var hits = <int, int>{};

  void flush() {
    final path = source;
    if (path == null) return;
    final lines = lf > 0 ? lf : daLines;
    final hit = lf > 0 ? lh : daHit;
    final previous = result[path];
    if (previous == null) {
      result[path] = FileCoverage(lines, hit, hits);
    } else {
      // 同一文件多条记录（例如多次 merge）：行数累加，DA 命中取较大值，
      // 避免"第二次记录里某行 0 次"把第一次的命中抹掉。
      final merged = <int, int>{...previous.daHits};
      for (final entry in hits.entries) {
        final old = merged[entry.key];
        merged[entry.key] = old == null || entry.value > old
            ? entry.value
            : old;
      }
      result[path] = FileCoverage(
        previous.lines + lines,
        previous.hit + hit,
        merged,
      );
    }
  }

  for (final raw in const LineSplitter().convert(text)) {
    final line = raw.trim();
    if (line.isEmpty) continue;
    if (line.startsWith('SF:')) {
      flush();
      source = normalizePath(line.substring(3));
      lf = 0;
      lh = 0;
      daLines = 0;
      daHit = 0;
      hits = <int, int>{};
    } else if (line.startsWith('LF:')) {
      lf = int.tryParse(line.substring(3).trim()) ?? 0;
    } else if (line.startsWith('LH:')) {
      lh = int.tryParse(line.substring(3).trim()) ?? 0;
    } else if (line.startsWith('DA:')) {
      final parts = line.substring(3).split(',');
      daLines++;
      final lineNo = int.tryParse(parts[0].trim());
      final count = parts.length > 1 ? int.tryParse(parts[1].trim()) ?? 0 : 0;
      if (count > 0) daHit++;
      if (lineNo != null) {
        final old = hits[lineNo];
        hits[lineNo] = old == null || count > old ? count : old;
      }
    } else if (line == 'end_of_record') {
      flush();
      source = null;
      lf = 0;
      lh = 0;
      daLines = 0;
      daHit = 0;
      hits = <int, int>{};
    }
  }
  flush();
  return result;
}

/// 枚举 `libDirPath` 下的门禁对象，返回**相对包根**的路径（`lib/...`）。
///
/// 排除生成代码（`*.g.dart` / `*.freezed.dart`）与入口 `lib/main.dart`：
/// 前者由 build_runner 产出，后者只有 runApp，测不测都不是人手能改的。
List<String> enumerateLibFiles(String libDirPath) {
  final root = normalizePath(libDirPath);
  final dir = Directory(root);
  if (!dir.existsSync()) {
    throw FileSystemException('找不到 lib 目录', root);
  }
  final prefix = '$root/';
  final baseName = root.split('/').last;
  final files = <String>[];
  for (final entity in dir.listSync(recursive: true, followLinks: false)) {
    if (entity is! File) continue;
    final path = normalizePath(entity.path);
    if (!path.endsWith('.dart')) continue;
    if (path.endsWith('.g.dart') || path.endsWith('.freezed.dart')) continue;
    final relative = path.startsWith(prefix)
        ? path.substring(prefix.length)
        : path;
    final key = '$baseName/$relative';
    if (key == '$baseName/main.dart') continue;
    files.add(key);
  }
  files.sort();
  return files;
}

/// LF 代理：非空且非注释的行数。宁可高估分母，也不要让没进 lcov 的文件消失。
int proxyLineCount(String path) {
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

/// 解析 `git diff -U0` 输出里的新增行号（只取 `+` 侧），供 G5 使用。
Map<String, List<int>> parseAddedLineRanges(String diffText) {
  final result = <String, List<int>>{};
  final fileHeader = RegExp(r'^\+\+\+ b/(.+)$');
  final hunkHeader = RegExp(r'^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@');
  String? current;
  for (final raw in const LineSplitter().convert(diffText)) {
    final fileMatch = fileHeader.firstMatch(raw);
    if (fileMatch != null) {
      current = normalizePath(fileMatch.group(1)!);
      continue;
    }
    final hunk = hunkHeader.firstMatch(raw);
    if (hunk == null || current == null) continue;
    final start = int.tryParse(hunk.group(1)!) ?? 0;
    final count = hunk.group(2) == null
        ? 1
        : int.tryParse(hunk.group(2)!) ?? 0;
    if (count <= 0) continue;
    final lines = result.putIfAbsent(current, () => <int>[]);
    for (var i = 0; i < count; i++) {
      lines.add(start + i);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// 分类规则
// ---------------------------------------------------------------------------

/// scope 判定。`presentation/x_provider.dart` 归 providers（provider 先于屏判定），
/// 顶层杂项（目前只有 `app_router.dart`）归 other。
String scopeOf(String path) {
  final rel = _relativeToLib(path);
  final segments = rel.split('/');
  // features/<name>/{domain,data}/** —— 纯逻辑层，最容易也最该被单测覆盖。
  if (segments.length >= 3 &&
      segments[0] == 'features' &&
      (segments[2] == 'domain' || segments[2] == 'data')) {
    return 'domain_data';
  }
  if (rel.startsWith('core/')) return 'core';
  if (rel.startsWith('shared/')) return 'shared';
  final base = segments.last;
  if (base.endsWith('_provider.dart') || base.endsWith('_providers.dart')) {
    return 'providers';
  }
  if (rel.contains('presentation/')) return 'screens';
  return 'other';
}

/// G3：「新增文件 ≥60%」只对逻辑层生效。
///
/// 收窄的理由：`lib/core/theme/app_colors.dart`（50 行配色常量）被要求 60%
/// 属于口径过宽——常量文件没有行为可测；而 `lib/shared/widgets/**` 是渲染层，
/// 覆盖率由 widget 测试自然决定，不适合当新增文件的硬门槛。
bool requiresNewFileCoverage(String path) {
  final rel = _relativeToLib(path);
  final segments = rel.split('/');
  if (segments.length >= 3 &&
      segments[0] == 'features' &&
      (segments[2] == 'data' || segments[2] == 'domain')) {
    return true;
  }
  if (rel.startsWith('core/')) {
    // 主题层是纯常量/纯配置，排除。
    return !rel.startsWith('core/theme/');
  }
  return rel.startsWith('shared/datasources/');
}

/// 基线里的 `exempt` 清单（G6）。
Set<String> exemptPathsOf(Map<String, dynamic> baseline) {
  final entries = baseline['exempt'];
  if (entries is! List) return <String>{};
  final paths = <String>{};
  for (final entry in entries) {
    if (entry is Map && entry['path'] is String) {
      paths.add(normalizePath(entry['path'] as String));
    }
  }
  return paths;
}

/// `exempt` 原样取出，`--update` 时写回（保留 reason 文案）。
List<Map<String, dynamic>> exemptEntriesOf(Map<String, dynamic>? baseline) {
  final entries = baseline?['exempt'];
  if (entries is! List) return <Map<String, dynamic>>[];
  final result = <Map<String, dynamic>>[];
  for (final entry in entries) {
    if (entry is Map) {
      result.add(asMap(entry));
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// 门禁判定
// ---------------------------------------------------------------------------

/// 跑门禁。`input.base == null` 时走 G1 降级：跳过 G2/G4，新增文件规则退化为
/// "基线外文件全量检查"，global/scope 底线照旧。
GateResult runGate(GateInput input) {
  final coverage = input.coverage;
  final baseline = input.baseline;
  final scopeAgg = aggregateScopes(coverage);
  final totalLines = scopeAgg.values.fold<int>(0, (sum, agg) => sum + agg.lines);
  final totalHit = scopeAgg.values.fold<int>(0, (sum, agg) => sum + agg.hit);
  final totalPct = totalLines == 0 ? 100.0 : totalHit / totalLines * 100.0;

  final warnings = <String>[];
  final violations = <String>[];
  var violationCount = 0;

  final globalFloor = floorOf(baseline['global']);
  if (globalFloor == null) {
    throw GateConfigException('基线缺少 global.floor。');
  }

  final degraded = input.base == null;
  if (degraded) {
    warnings.add(
      '无法确定 PR 基线，已跳过 PR 作用域规则（G2/G4）；'
      '新增文件规则退化为"基线外文件"全量检查，global/scope 底线照旧。',
    );
  }

  // 1) global 底线
  if (isLess(totalPct, globalFloor)) {
    violationCount++;
    violations.add(
      'global 覆盖率 ${percentText(totalPct)} < 底线 ${percentText(globalFloor)}'
      '（差 ${ppText(globalFloor - totalPct)}）',
    );
  }

  // 2) scope 底线
  final baselineScopes = asMap(baseline['scopes']);
  for (final scope in scopeOrder) {
    final floor = floorOf(baselineScopes[scope]);
    if (floor == null) continue;
    final current = scopeAgg[scope]?.pct ?? 0.0;
    if (isLess(current, floor)) {
      violationCount++;
      violations.add(
        'scope $scope 覆盖率 ${percentText(current)} < 底线 '
        '${percentText(floor)}（差 ${ppText(floor - current)}）',
      );
    }
  }

  final baselineFiles = asMap(baseline['files']);

  // 3) 单文件回退（G4：只对本 PR 未触碰的文件生效）
  final regressions = <String>[];
  if (!degraded) {
    for (final entry in baselineFiles.entries) {
      if (input.exemptPaths.contains(entry.key)) continue;
      // 本 PR 改过的文件：行数/结构变了百分比自然变，交给 global/scope 兜底。
      if (input.touchedFiles.contains(entry.key)) continue;
      final measured = measuredOf(entry.value);
      final cov = coverage[entry.key];
      if (measured == null || cov == null) continue;
      if (isLess(cov.pct, measured - fileDropTolerance)) {
        regressions.add(
          '${entry.key} 当前 ${percentText(cov.pct)}，基线 '
          '${percentText(measured)}（回退 '
          '${ppText(measured - cov.pct)} > ${ppText(fileDropTolerance)}）',
        );
      }
    }
  }
  if (regressions.isNotEmpty) {
    violationCount += regressions.length;
    violations
      ..add('单文件覆盖率回退 ${regressions.length} 个：')
      ..addAll(regressions.map((line) => '  - $line'));
  }

  // 4) 新增文件 <60%（G2：只看本 PR 新增；G3：只看逻辑层）
  final Set<String> candidates;
  if (degraded) {
    candidates = coverage.keys
        .where((path) => !baselineFiles.containsKey(path))
        .toSet();
  } else {
    candidates = input.addedFiles;
  }
  final untestedNewFiles = <String>[];
  for (final path in candidates.toList()..sort()) {
    // 基线里已有的文件不算"新增"（重新加回的文件由回退规则覆盖）。
    if (baselineFiles.containsKey(path)) continue;
    if (input.exemptPaths.contains(path)) continue;
    if (!requiresNewFileCoverage(path)) continue;
    final cov = coverage[path];
    if (cov == null) continue;
    if (isLess(cov.pct, newFileFloor)) {
      untestedNewFiles.add(
        '$path 覆盖率 ${percentText(cov.pct)} < ${percentText(newFileFloor)}'
        '（lines=$cov.lines）',
      );
    }
  }
  if (untestedNewFiles.isNotEmpty) {
    violationCount += untestedNewFiles.length;
    violations
      ..add('新增文件未达最低覆盖率 ${untestedNewFiles.length} 个：')
      ..addAll(untestedNewFiles.map((line) => '  - $line'));
  }

  final netChange = _netChange(
    input: input,
    coverage: coverage,
    totalPct: totalPct,
    baseline: baseline,
  );

  final floors = <String, double?>{
    'global': globalFloor,
    for (final scope in scopeOrder) scope: floorOf(baselineScopes[scope]),
  };

  final report = buildReport(
    coverage: coverage,
    scopeAgg: scopeAgg,
    totalPct: totalPct,
    totalFiles: coverage.length,
    totalLines: totalLines,
    totalHit: totalHit,
    floors: floors,
    proxied: input.proxyLineCounts.length,
    violations: violations,
    warnings: warnings,
    updated: false,
    netChange: netChange,
    exemptPaths: input.exemptPaths,
  );

  return GateResult(
    violations: violations,
    violationCount: violationCount,
    warnings: warnings,
    report: report,
    netChange: netChange,
    totalLines: totalLines,
    totalHit: totalHit,
    totalPct: totalPct,
    degraded: degraded,
  );
}

NetChange _netChange({
  required GateInput input,
  required Map<String, FileCoverage> coverage,
  required double totalPct,
  required Map<String, dynamic> baseline,
}) {
  if (input.base == null) {
    return const NetChange.unavailable('无法确定 PR 基线，跳过统计（G5）。');
  }
  var added = 0;
  var covered = 0;
  for (final entry in input.addedLineRanges.entries) {
    final daHits = coverage[entry.key]?.daHits;
    if (daHits == null) continue;
    for (final line in entry.value) {
      final count = daHits[line];
      if (count == null) continue;
      added++;
      if (count > 0) covered++;
    }
  }
  final baselineGlobal = measuredOf(baseline['global']) ?? totalPct;
  return NetChange(
    available: true,
    addedLines: added,
    coveredLines: covered,
    globalDelta: totalPct - baselineGlobal,
    baselineGlobal: baselineGlobal,
  );
}

/// 聚合 scope。所有 scope 都会出现在返回值里（没有文件时 lines=0）。
Map<String, ScopeAgg> aggregateScopes(Map<String, FileCoverage> coverage) {
  final agg = <String, ScopeAgg>{
    for (final scope in scopeOrder) scope: ScopeAgg(),
  };
  for (final entry in coverage.entries) {
    agg[scopeOf(entry.key)]!.add(entry.value);
  }
  return agg;
}

// ---------------------------------------------------------------------------
// 基线更新
// ---------------------------------------------------------------------------

/// 只升不降地生成新基线。
///
/// - global/scope：`floor = max(旧底线, 实测 - updateSlack)`；需要下调且没给
///   `allowLower` 时返回 `baseline == null`（拒绝写入）。
/// - 文件级 `measured`：取 max(旧, 实测)；新文件补录，已删除的移除。
/// - `exempt`：原样保留（G6）。
UpdateOutcome applyUpdate({
  required Map<String, FileCoverage> coverage,
  required Map<String, ScopeAgg> scopeAgg,
  required double totalPct,
  required Map<String, dynamic>? previous,
  required bool allowLower,
  List<Map<String, dynamic>> exempt = const <Map<String, dynamic>>[],
}) {
  final previousScopes = asMap(previous?['scopes']);
  final previousFiles = asMap(previous?['files']);

  final lowers = <String>[];
  final notes = <String>[];

  double nextFloor(String name, double current, double? oldFloor) {
    final raw = roundTo(current - updateSlack, 1);
    final candidate = raw < 0 ? 0.0 : raw;
    if (oldFloor == null) {
      notes.add('$name 底线 新建 ${percentText(candidate)}');
      return candidate;
    }
    if (candidate < oldFloor - 1e-9) {
      lowers.add(
        '$name 底线需要从 ${percentText(oldFloor)} 下调到 '
        '${percentText(candidate)}',
      );
      return allowLower ? candidate : oldFloor;
    }
    if (candidate > oldFloor + 1e-9) {
      notes.add('$name 底线 ${percentText(oldFloor)} → ${percentText(candidate)}');
    }
    return candidate;
  }

  final globalFloor = nextFloor(
    'global',
    totalPct,
    floorOf(previous?['global']),
  );

  final scopeFloors = <String, double>{};
  for (final scope in scopeOrder) {
    scopeFloors[scope] = nextFloor(
      'scope $scope',
      scopeAgg[scope]?.pct ?? 0.0,
      floorOf(previousScopes[scope]),
    );
  }

  final floors = <String, double?>{
    'global': globalFloor,
    for (final scope in scopeOrder) scope: scopeFloors[scope],
  };

  if (lowers.isNotEmpty && !allowLower) {
    return UpdateOutcome(
      baseline: null,
      notes: notes,
      lowers: lowers,
      floors: floors,
      added: 0,
      raised: 0,
      dropped: const <String>[],
    );
  }

  final files = <String, dynamic>{};
  var added = 0;
  var raised = 0;
  for (final entry in coverage.entries) {
    final oldMeasured = measuredOf(previousFiles[entry.key]);
    final current = roundTo(entry.value.pct, 2);
    if (oldMeasured == null) {
      added++;
      files[entry.key] = <String, dynamic>{'measured': current};
    } else {
      final next = current > oldMeasured ? current : roundTo(oldMeasured, 2);
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
            '只升不降。floor 是硬闸，measured 用于检测单文件回退；'
            'exempt 里的文件跳过"新增文件 <60%"与"单文件回退"，但仍计入分母。',
    'generated_at': DateTime.now().toUtc().toIso8601String(),
    'global': <String, dynamic>{
      'floor': globalFloor,
      'measured': roundTo(totalPct, 2),
    },
    'scopes': <String, dynamic>{
      for (final scope in scopeOrder)
        scope: <String, dynamic>{
          'floor': scopeFloors[scope],
          'measured': roundTo(scopeAgg[scope]?.pct ?? 0.0, 2),
        },
    },
    'exempt': exempt,
    'files': files,
  };

  return UpdateOutcome(
    baseline: baseline,
    notes: notes,
    lowers: lowers,
    floors: floors,
    added: added,
    raised: raised,
    dropped: dropped,
  );
}

// ---------------------------------------------------------------------------
// 报告
// ---------------------------------------------------------------------------

String buildReport({
  required Map<String, FileCoverage> coverage,
  required Map<String, ScopeAgg> scopeAgg,
  required double totalPct,
  required int totalFiles,
  required int totalLines,
  required int totalHit,
  required Map<String, double?> floors,
  required int proxied,
  required List<String> violations,
  required List<String> warnings,
  required bool updated,
  required NetChange netChange,
  required Set<String> exemptPaths,
}) {
  final buffer = StringBuffer();
  buffer.writeln('## 覆盖率门禁${updated ? '（更新基线）' : ''}');
  buffer.writeln();
  buffer.writeln(
    '分母来自文件系统枚举的 lib/**/*.dart（排除 *.g.dart / *.freezed.dart / '
    'lib/main.dart），共 $totalFiles 个文件；其中 $proxied 个未出现在 lcov 里，'
    '按"非空非注释行数"补 LF 代理、命中记 0。',
  );
  if (exemptPaths.isNotEmpty) {
    buffer.writeln();
    buffer.writeln(
      'exempt ${exemptPaths.length} 个（跳过"新增文件 <60%"与"单文件回退"，'
      '但仍计入分母）：${(exemptPaths.toList()..sort()).join('、')}',
    );
  }
  buffer.writeln();
  buffer.writeln('| scope | files | lines | hit | cov% | floor | 状态 |');
  buffer.writeln('| --- | ---: | ---: | ---: | ---: | ---: | --- |');

  final globalFloor = floors['global'];
  buffer.writeln(
    '| **global** | $totalFiles | $totalLines | $totalHit | '
    '${percentText(totalPct)} | ${_floorText(globalFloor)} | '
    '${_status(totalPct, globalFloor)} |',
  );

  for (final scope in scopeOrder) {
    final agg = scopeAgg[scope];
    if (agg == null || agg.files == 0) continue;
    final floor = floors[scope];
    buffer.writeln(
      '| $scope | ${agg.files} | ${agg.lines} | ${agg.hit} | '
      '${percentText(agg.pct)} | ${_floorText(floor)} | '
      '${_status(agg.pct, floor)} |',
    );
  }

  buffer.writeln();
  buffer.writeln(_netChangeLine(netChange));

  final lowFiles = coverage.entries
      .where((entry) => isLess(entry.value.pct, newFileFloor))
      .toList()
    ..sort((a, b) => a.value.pct.compareTo(b.value.pct));
  if (lowFiles.isNotEmpty) {
    buffer.writeln();
    buffer.writeln(
      '低于 ${percentText(newFileFloor)} 的文件（共 ${lowFiles.length} 个）：',
    );
    buffer.writeln();
    buffer.writeln('| 文件 | lines | hit | cov% |');
    buffer.writeln('| --- | ---: | ---: | ---: |');
    for (final entry in lowFiles) {
      buffer.writeln(
        '| ${entry.key} | ${entry.value.lines} | ${entry.value.hit} | '
        '${percentText(entry.value.pct)} |',
      );
    }
  }

  if (warnings.isNotEmpty) {
    buffer.writeln();
    buffer.writeln('### 警告');
    for (final line in warnings) {
      buffer.writeln('- $line');
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

String _netChangeLine(NetChange netChange) {
  if (!netChange.available) {
    return '**本 PR 净变化**：${netChange.reason}';
  }
  final delta = netChange.globalDelta;
  final sign = delta >= 0 ? '+' : '−';
  final addedText = netChange.addedLines == 0
      ? '本 PR 未改动可执行行'
      : '新增可执行行 ${netChange.addedLines} 行，'
            '其中 ${netChange.coveredLines} 行被覆盖'
            '（${percentText(netChange.pct)}）';
  return '**本 PR 净变化**：$addedText；'
      'global ${percentText(netChange.baselineGlobal + delta)}，'
      '基线 ${percentText(netChange.baselineGlobal)}，'
      '净变化 $sign${delta.abs().toStringAsFixed(1)}pp。';
}

String _status(double current, double? floor) {
  if (floor == null) return '无底线';
  return isLess(current, floor) ? 'FAIL' : 'PASS';
}

String _floorText(double? floor) => floor == null ? '-' : percentText(floor);

String percentText(double value) => '${value.toStringAsFixed(1)}%';

String ppText(double value) => '${value.abs().toStringAsFixed(1)}pp';

bool isLess(double a, double b) => a + 1e-9 < b;

double roundTo(double value, int digits) {
  final factor = digits == 1 ? 10 : 100;
  return (value * factor).round() / factor;
}

String normalizePath(String path) {
  var normalized = path.replaceAll('\\', '/');
  while (normalized.startsWith('./')) {
    normalized = normalized.substring(2);
  }
  while (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.substring(0, normalized.length - 1);
  }
  return normalized;
}

Map<String, dynamic> asMap(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) {
    return value.map((key, item) => MapEntry(key.toString(), item));
  }
  return <String, dynamic>{};
}

double? floorOf(Object? node) {
  if (node is Map && node['floor'] is num) {
    return (node['floor'] as num).toDouble();
  }
  return null;
}

double? measuredOf(Object? node) {
  if (node is Map && node['measured'] is num) {
    return (node['measured'] as num).toDouble();
  }
  return null;
}

/// 统一成"相对 lib/"的形式，让 `lib/core/x.dart` 与 `core/x.dart` 等价。
String _relativeToLib(String path) {
  final normalized = normalizePath(path);
  return normalized.startsWith('lib/') ? normalized.substring(4) : normalized;
}
