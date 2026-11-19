import 'dart:math';

import 'recall_json.dart';

/// 单条判分（后端 `verdicts[]` 的取值）。
enum RecallVerdict {
  ok,
  miss;

  static RecallVerdict fromWire(Object? value) {
    final raw = value is String ? value.trim().toLowerCase() : '';
    return raw == 'ok' ? RecallVerdict.ok : RecallVerdict.miss;
  }

  String get wire => name;

  bool get isOk => this == RecallVerdict.ok;
}

/// FSRS 评分（用户不直接选择，由服务端按判分推导）。
enum RecallRating {
  again,
  hard,
  good;

  /// 未知取值退化到 [again]：宁可当成「没记住」也不要虚报记忆强度。
  static RecallRating fromWire(Object? value) {
    final raw = value is String ? value.trim().toLowerCase() : '';
    return switch (raw) {
      'hard' => RecallRating.hard,
      'good' => RecallRating.good,
      _ => RecallRating.again,
    };
  }

  String get wire => name;
}

/// 一条用户改判（`RecallReviewRequestSchema` 的 `overrides[]`）。
///
/// [index] 是**卡内下标**（与 `pendingItems` 同一坐标系），不是屏上位置；
/// 屏上位置 → 卡内下标的换算见 `buildOverrides`。
class RecallOverride {
  final int index;
  final RecallVerdict to;

  const RecallOverride({required this.index, required this.to});

  factory RecallOverride.fromJson(Map<String, dynamic> json) {
    return RecallOverride(
      index: readInt(json['index']),
      to: RecallVerdict.fromWire(json['to']),
    );
  }

  Map<String, dynamic> toJson() => {'index': index, 'to': to.wire};

  @override
  String toString() => 'RecallOverride(index: $index, to: ${to.wire})';

  @override
  bool operator ==(Object other) =>
      other is RecallOverride && other.index == index && other.to == to;

  @override
  int get hashCode => Object.hash(index, to);
}

/// 一次提交的结果（`RecallReviewResponseSchema` + 展示用文案）。
class RecallReviewResult {
  /// 最终判分（已应用改判），与本次呈现的条目一一对应。
  final List<RecallVerdict> verdicts;

  /// 服务端推导出的 FSRS 评分。
  final RecallRating rating;

  /// 下次到期时间（ISO 8601 UTC 文本）。
  final String nextDue;

  /// 下次要重测的条目下标；null 表示无需重测。
  final List<int>? pendingItems;

  /// 可直接展示的提示，如「下次 11 月 20 日」「明天只重测这 2 条」。
  final String nextReviewText;

  /// true = 该 clientKey 已提交过，本次为幂等重放，**未推进调度**。
  final bool duplicate;

  /// 仅预演时出现且恒为 true（本次没有写库）。
  final bool? dryRun;

  const RecallReviewResult({
    required this.verdicts,
    required this.rating,
    required this.nextDue,
    required this.pendingItems,
    required this.nextReviewText,
    required this.duplicate,
    this.dryRun,
  });

  factory RecallReviewResult.fromJson(Map<String, dynamic> json) {
    final rawVerdicts = json['verdicts'];
    return RecallReviewResult(
      verdicts: rawVerdicts is List
          ? rawVerdicts.map(RecallVerdict.fromWire).toList(growable: false)
          : const <RecallVerdict>[],
      rating: RecallRating.fromWire(json['rating']),
      nextDue: readString(json['nextDue']),
      pendingItems: readNullableIntList(json['pendingItems']),
      nextReviewText: readString(json['nextReviewText']),
      duplicate: readBool(json['duplicate']),
      dryRun: json['dryRun'] == null ? null : readBool(json['dryRun']),
    );
  }

  Map<String, dynamic> toJson() => {
    'verdicts': verdicts.map((verdict) => verdict.wire).toList(),
    'rating': rating.wire,
    'nextDue': nextDue,
    'pendingItems': pendingItems == null ? null : List<int>.from(pendingItems!),
    'nextReviewText': nextReviewText,
    'duplicate': duplicate,
    if (dryRun != null) 'dryRun': dryRun,
  };

  /// 重放（`duplicate == true`）时不该再推进界面上的「下一次」提示，
  /// 但服务端返回的 `nextReviewText` 仍然是首次结果，可以直接展示。
  bool get isDuplicate => duplicate;

  /// 是否是一次真落库的提交（非幂等重放、非预演）。
  bool get isPersisted => !duplicate && dryRun != true;
}

/// 归档结果（`POST /recall/cards/{cardId}/archive`）。
class RecallArchiveResult {
  final int cardId;

  /// 契约上恒为 true（归档天然幂等）。
  final bool archived;

  const RecallArchiveResult({required this.cardId, required this.archived});

  factory RecallArchiveResult.fromJson(Map<String, dynamic> json) {
    return RecallArchiveResult(
      cardId: readInt(json['cardId']),
      archived: readBool(json['archived'], fallback: true),
    );
  }

  Map<String, dynamic> toJson() => {'cardId': cardId, 'archived': archived};
}

/// 取消归档结果（`DELETE /recall/cards/{cardId}/archive`）。
class RecallRestoreResult {
  final int cardId;

  /// true = 恢复了一条状态行；false = 本来就没有归档记录（不算错误）。
  final bool restored;

  const RecallRestoreResult({required this.cardId, required this.restored});

  factory RecallRestoreResult.fromJson(Map<String, dynamic> json) {
    return RecallRestoreResult(
      cardId: readInt(json['cardId']),
      restored: readBool(json['restored']),
    );
  }

  Map<String, dynamic> toJson() => {'cardId': cardId, 'restored': restored};
}

/// 幂等键生成器签名（测试要能注入确定性实现）。
typedef RecallClientKeyFactory = String Function();

/// 生成一个 UUID v4 形态的幂等键。
///
/// 为什么手写而不加 `uuid` 依赖：这条 lane 不新增依赖（`pubspec.yaml` 一行不改），
/// 而幂等键只需要「同一台设备上不重复」，UUID v4 的 122 位随机数完全够用。
/// 用 `Random.secure()` 而不是默认 `Random`：默认实现是确定性种子，
/// 多进程/热重启后可能生成同一个序列。
///
/// 注意：**不要**用 `DateTime.now()` 生成 key。服务端幂等是 `(user_id, clientKey)`，
/// 时间戳在同一毫秒内重试会撞成同一个 key，把第二次真提交吞成重放。
String generateRecallClientKey({Random? random}) {
  final rnd = random ?? Random.secure();
  final bytes = List<int>.generate(16, (_) => rnd.nextInt(256));
  // 版本 4，variant RFC 4122（与 web 端 crypto.randomUUID() 的形状一致）
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes
      .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
      .join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

/// 一次作答的提交载荷 + 幂等键（本 lane 的核心不变量）。
///
/// 规则（与 web 端 `use-recall-session.ts` 的 `clientKeyRef` 同构）：
/// 1. **进入判分屏时构造一次**：构造时生成 `clientKey`；
/// 2. 失败重试只调用 [toPayload]，绝不重新构造 `clientKey`；
/// 3. [toPayload] 第一次调用即**冻结**载荷：之后再调用返回同一个 map（连改判都进不去），
///    这样「同一 key = 同一载荷」是结构保证，不靠调用方自觉；
/// 4. 要开始新一轮作答（放弃这次提交）必须显式 [reset]，它会换 key 并解冻。
///
/// 反过来的约束同样重要：**提交失败时不要 reset**——那会让重试变成一次新的作答，
/// 服务端会当新日志落库，进度被推进两次。
class RecallReviewDraft {
  /// 卡片数字主键。
  final int cardId;

  final RecallClientKeyFactory _newClientKey;

  late String _clientKey;
  String _typed;
  bool _allBlank;
  List<RecallOverride> _overrides;
  Map<String, dynamic>? _frozen;

  RecallReviewDraft({
    required this.cardId,
    String typed = '',
    bool allBlank = false,
    List<RecallOverride> overrides = const [],
    String? clientKey,
    RecallClientKeyFactory? clientKeyFactory,
  }) : _typed = typed,
       _allBlank = allBlank,
       _overrides = List<RecallOverride>.unmodifiable(overrides),
       _newClientKey = clientKeyFactory ?? generateRecallClientKey {
    _clientKey = clientKey ?? _newClientKey();
  }

  /// 本次作答的幂等键。跨重试**恒等**，直到 [reset]。
  String get clientKey => _clientKey;

  String get typed => _typed;

  bool get allBlank => _allBlank;

  List<RecallOverride> get overrides => _overrides;

  /// 载荷是否已冻结（= 已经用它发过请求）。
  bool get isFrozen => _frozen != null;

  /// 更新作答原文。载荷冻结后调用会抛 [StateError]。
  void setTyped(String value) {
    _ensureMutable();
    _typed = value;
  }

  /// 设置「全没想起」。载荷冻结后调用会抛 [StateError]。
  void setAllBlank(bool value) {
    _ensureMutable();
    _allBlank = value;
  }

  /// 设置改判项（传 `overrides: []` 即清空）。载荷冻结后调用会抛 [StateError]。
  ///
  /// 改为 `allBlank` 后改判项不会随载荷发出（见 [toPayload]）：两者语义互斥，
  /// 服务端也是按 `allBlank` 优先处理的。
  void setOverrides(List<RecallOverride> value) {
    _ensureMutable();
    _overrides = List<RecallOverride>.unmodifiable(value);
  }

  /// 构造提交载荷。可重复调用：第一次调用即冻结，后续返回同一个不可变 map。
  Map<String, dynamic> toPayload() {
    final cached = _frozen;
    if (cached != null) return cached;

    final payload = <String, dynamic>{
      'cardId': cardId,
      'typed': _typed,
      // allBlank 与 overrides 互斥：全没想起时服务端忽略改判，发了只是噪音
      if (_allBlank) 'allBlank': true,
      if (!_allBlank && _overrides.isNotEmpty)
        'overrides': List<Map<String, dynamic>>.unmodifiable(
          _overrides.map((override) => override.toJson()),
        ),
      'clientKey': _clientKey,
    };
    final frozen = Map<String, dynamic>.unmodifiable(payload);
    _frozen = frozen;
    return frozen;
  }

  /// 显式重置：换一个新的幂等键并解冻载荷。
  ///
  /// 用途是「放弃这次提交、开始新一轮」；**提交失败后不要调用**（见类注释）。
  /// 默认保留作答原文与改判（用户往往只想重发一次），传 `clearAnswer: true` 清空。
  void reset({bool clearAnswer = false}) {
    _clientKey = _newClientKey();
    _frozen = null;
    if (clearAnswer) {
      _typed = '';
      _allBlank = false;
      _overrides = const <RecallOverride>[];
    }
  }

  void _ensureMutable() {
    if (_frozen != null) {
      throw StateError(
        '这次作答的载荷已冻结（幂等键 $_clientKey 已随请求发出）：'
        '重试必须重放同一份载荷；要改答案请先 reset() 开始新一轮作答。',
      );
    }
  }
}
