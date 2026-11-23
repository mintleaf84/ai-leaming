/// 粉笔（fenbi）账号同步的领域模型与「读防御」。
///
/// 契约见 `docs/fenbi-sync-design.md` §5。这里只放**服务端返回什么就映射成什么**
/// 的纯数据，不含网络与界面逻辑。
///
/// 为什么不复用 `features/exam/domain/exam_json.dart`：那份工具在文件头写明了
/// 「只给试卷用」，跨 feature 反向引用会把两个模块的字段口径绑在一起（试卷改
/// 字段不该牵动粉笔同步）。这里保留同一套退化规则，只实现本 feature 用到的
/// 几个读取函数；服务端形状漂移时给退化值，而不是让界面层抛
/// `type 'int' is not a subtype of type 'String'` 把整屏打黑。
library;

import 'dart:convert';

/// 一条同步失败的记录。
///
/// 服务端 `failed` 的元素形状没有钉死（可能带 `exerciseId`，也可能只是一句
/// 说明），所以这里统一成「一条记录 + 一句原因」，界面只按这个形状渲染。
class FenbiSyncFailure {
  const FenbiSyncFailure({required this.label, required this.reason});

  /// 记录标识，如「练习 2173997585」。
  final String label;

  /// 失败原因（服务端原文，已截断到可读长度）。
  final String reason;
}

/// 一次同步的结果（`POST /api/fenbi/sync` 的返回，或 `status.lastResult`）。
class FenbiSyncResult {
  const FenbiSyncResult({
    this.imported = 0,
    this.skipped = 0,
    this.newQuestions = 0,
    this.failed = const <FenbiSyncFailure>[],
    this.note,
  });

  /// 本次导入的会话数。
  final int imported;

  /// 命中去重、跳过的会话数。
  final int skipped;

  /// 本次新建的题目数。
  final int newQuestions;

  /// 没导入成功的记录（必须展示给用户，不能静默吞掉）。
  final List<FenbiSyncFailure> failed;

  /// `lastResult` 是纯文本（旧数据 / 降级写入）时的原文。
  final String? note;

  bool get hasFailed => failed.isNotEmpty;

  factory FenbiSyncResult.fromJson(Map<String, dynamic> json) {
    return FenbiSyncResult(
      imported: _readInt(json['imported']),
      skipped: _readInt(json['skipped']),
      newQuestions: _readInt(json['newQuestions']),
      failed: _readFailures(json['failed']),
      note: _readOptionalString(json['note']),
    );
  }

  /// 解析 `status.lastResult`：可能是对象、JSON 字符串或一句纯文本。
  ///
  /// 返回 null 表示「从来没有同步过」，界面据此显示占位文案而不是「导入 0 条」。
  static FenbiSyncResult? tryParse(Object? raw) {
    if (raw == null) return null;
    final map = _readMap(raw);
    if (map != null) return FenbiSyncResult.fromJson(map);

    final text = raw is String ? raw.trim() : '';
    if (text.isEmpty) return null;
    // 服务端把结果存进 TEXT 列时是 JSON 字符串；解析不了就当说明文字。
    if (text.startsWith('{')) {
      try {
        final decoded = jsonDecode(text);
        final decodedMap = _readMap(decoded);
        if (decodedMap != null) return FenbiSyncResult.fromJson(decodedMap);
      } on FormatException {
        // 落到下面按纯文本展示。半截 JSON 不该让整屏报错。
      }
    }
    return FenbiSyncResult(note: text);
  }

  static List<FenbiSyncFailure> _readFailures(Object? value) {
    if (value is! List) return const <FenbiSyncFailure>[];
    final out = <FenbiSyncFailure>[];
    for (final item in value) {
      if (item is String) {
        final text = item.trim();
        if (text.isNotEmpty) {
          out.add(FenbiSyncFailure(label: '未知记录', reason: _truncate(text)));
        }
        continue;
      }
      final map = _readMap(item);
      if (map == null) continue;
      final id = _readString(map['exerciseId'] ?? map['id']);
      final label = _readString(
        map['label'] ?? map['name'],
        fallback: id.isEmpty ? '未知记录' : '练习 $id',
      );
      final reason = _readString(
        map['reason'] ?? map['message'] ?? map['error'] ?? map['msg'],
        fallback: '未知原因',
      );
      out.add(
        FenbiSyncFailure(label: label, reason: _truncate(reason)),
      );
    }
    return out;
  }
}

/// 账号绑定状态（`GET /api/fenbi/status`）。
class FenbiSyncStatus {
  const FenbiSyncStatus({
    this.linked = false,
    this.phoneMasked,
    this.fenbiUserId,
    this.lastSyncAt,
    this.lastResult,
    this.syncable = true,
    this.unsupported = const <String>['paper'],
  });

  /// 是否已绑定粉笔账号。
  final bool linked;

  /// 掩码手机号（如 `138****1234`）。服务端只回掩码，客户端不再拼完整号码。
  final String? phoneMasked;

  /// 粉笔侧的用户 id（展示用，不参与鉴权）。
  final String? fenbiUserId;

  final DateTime? lastSyncAt;
  final FenbiSyncResult? lastResult;

  /// 当前账号是否还能同步（`expired` / `revoked` 时为 false）。
  final bool syncable;

  /// 当前版本不支持同步的记录类型，如 `paper`（试卷/模考）。
  final List<String> unsupported;

  /// 服务端明确告知「试卷/模考记录同步不了」。
  bool get paperUnsupported => unsupported.contains('paper');

  factory FenbiSyncStatus.fromJson(Map<String, dynamic> json) {
    final masked = _readString(json['phoneMasked']);
    final rawPhone = _readString(json['phone']);
    final phone = masked.isNotEmpty
        ? masked
        : (rawPhone.isEmpty ? '' : _maskPhone(rawPhone));
    final fenbiUserId = _readString(json['fenbiUserId']);

    return FenbiSyncStatus(
      linked: _readBool(json['linked']),
      phoneMasked: phone.isEmpty ? null : phone,
      fenbiUserId: fenbiUserId.isEmpty ? null : fenbiUserId,
      lastSyncAt: _readDateTime(json['lastSyncAt']),
      lastResult: FenbiSyncResult.tryParse(json['lastResult']),
      syncable: _readBool(json['syncable'], fallback: true),
      unsupported: _readStringList(
        json['unsupported'],
        fallback: const <String>['paper'],
      ),
    );
  }

  FenbiSyncStatus copyWith({
    bool? linked,
    String? phoneMasked,
    String? fenbiUserId,
    DateTime? lastSyncAt,
    FenbiSyncResult? lastResult,
    bool? syncable,
    List<String>? unsupported,
  }) {
    return FenbiSyncStatus(
      linked: linked ?? this.linked,
      phoneMasked: phoneMasked ?? this.phoneMasked,
      fenbiUserId: fenbiUserId ?? this.fenbiUserId,
      lastSyncAt: lastSyncAt ?? this.lastSyncAt,
      lastResult: lastResult ?? this.lastResult,
      syncable: syncable ?? this.syncable,
      unsupported: unsupported ?? this.unsupported,
    );
  }

  /// 本地兜底掩码：只保留前 3 位与后 4 位。服务端已经给掩码时不会走到这里。
  static String _maskPhone(String phone) {
    if (phone.length < 7) return '****';
    return '${phone.substring(0, 3)}****${phone.substring(phone.length - 4)}';
  }
}

/// 一次扫码会话（`POST /api/fenbi/qrcode`）。
class FenbiQrSession {
  const FenbiQrSession({required this.lgtoken, required this.qrContent});

  final String lgtoken;

  /// 粉笔登录页的内容（`qrcode-login` 链路里的 `codeContent`）。
  final String qrContent;

  factory FenbiQrSession.fromJson(Map<String, dynamic> json) {
    return FenbiQrSession(
      lgtoken: _readString(json['lgtoken']),
      qrContent: _readString(json['qrContent']),
    );
  }

  bool get isUsable => lgtoken.isNotEmpty && qrContent.isNotEmpty;
}

/// 二维码状态机（`GET /api/fenbi/qrcode/status`）。
///
/// 取值与服务端 `FenbiQrStatus` 一一对应，语义见 docs/fenbi-sync-design.md §2.2：
/// 上游 `query_code_status` 的 data 是粉笔 PC 端枚举
/// （`0=Expired / 1=WaitingForScan / 2=Scanned / 3=Authorized / 4=Canceled / 5=Failed`），
/// 二维码实测只有约 100 秒有效期，所以 `expired` 是常态而不是异常。
enum FenbiQrPhase {
  pending,
  scanned,
  confirmed,
  expired,
  canceled,
  failed,
  unknown;

  static FenbiQrPhase parse(String? raw) {
    switch ((raw ?? '').trim().toLowerCase()) {
      case 'pending':
        return FenbiQrPhase.pending;
      case 'scanned':
        return FenbiQrPhase.scanned;
      case 'confirmed':
        return FenbiQrPhase.confirmed;
      case 'expired':
        return FenbiQrPhase.expired;
      case 'canceled':
        return FenbiQrPhase.canceled;
      case 'failed':
        return FenbiQrPhase.failed;
      default:
        return FenbiQrPhase.unknown;
    }
  }

  String get label {
    switch (this) {
      case FenbiQrPhase.pending:
        return '等待扫码';
      case FenbiQrPhase.scanned:
        return '已扫码，请在手机上点确认';
      case FenbiQrPhase.confirmed:
        return '已确认，正在绑定';
      case FenbiQrPhase.expired:
        return '二维码已过期（有效期约 100 秒），请重新生成';
      case FenbiQrPhase.canceled:
        return '已在手机上取消登录，需要请重新生成二维码';
      case FenbiQrPhase.failed:
        return '粉笔返回登录失败，请重新生成，或改用手机号绑定';
      case FenbiQrPhase.unknown:
        return '正在确认扫码状态…';
    }
  }

  /// 终态：继续轮询同一个 token 没有意义，必须让用户重新生成二维码。
  bool get isTerminal =>
      this == FenbiQrPhase.confirmed ||
      this == FenbiQrPhase.expired ||
      this == FenbiQrPhase.canceled ||
      this == FenbiQrPhase.failed;
}

// ---------------------------------------------------------------------------
// 读取工具（退化规则与 exam_json.dart / recall_json.dart 一致）
// ---------------------------------------------------------------------------

Map<String, dynamic>? _readMap(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) {
    return value.map((key, item) => MapEntry(key.toString(), item));
  }
  return null;
}

int _readInt(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value.trim()) ?? 0;
  return 0;
}

String _readString(Object? value, {String fallback = ''}) {
  if (value is String) return value;
  if (value is num || value is bool) return value.toString();
  return fallback;
}

String? _readOptionalString(Object? value) {
  final text = _readString(value).trim();
  return text.isEmpty ? null : text;
}

bool _readBool(Object? value, {bool fallback = false}) {
  if (value is bool) return value;
  if (value is num) return value != 0;
  if (value is String) {
    final raw = value.trim().toLowerCase();
    if (raw == 'true' || raw == '1') return true;
    if (raw == 'false' || raw == '0') return false;
  }
  return fallback;
}

List<String> _readStringList(Object? value, {List<String> fallback = const []}) {
  if (value is! List) return fallback;
  return value.whereType<String>().toList(growable: false);
}

/// 时间字段既可能是 ISO 字符串，也可能是毫秒时间戳。
DateTime? _readDateTime(Object? value) {
  if (value is num) {
    // 秒级时间戳兼容一下：小于 1e12 的值按秒算。
    final millis = value < 1000000000000 ? value * 1000 : value;
    return DateTime.fromMillisecondsSinceEpoch(millis.toInt());
  }
  if (value is String) {
    final raw = value.trim();
    if (raw.isEmpty) return null;
    final parsed = DateTime.tryParse(raw);
    if (parsed != null) return parsed;
    final numeric = int.tryParse(raw);
    if (numeric != null) return _readDateTime(numeric);
  }
  return null;
}

/// 失败原因只展示一句人话：多行/超长原文截断，避免把服务端堆栈塞进卡片。
String _truncate(String text) {
  final singleLine = text.replaceAll(RegExp(r'\s+'), ' ').trim();
  if (singleLine.length <= 80) return singleLine;
  return '${singleLine.substring(0, 80)}…';
}
