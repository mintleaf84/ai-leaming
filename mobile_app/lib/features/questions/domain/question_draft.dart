/// AI 草稿校对流的数据模型（§34）。
///
/// 服务端把 `question_drafts` + `question_draft_items` 两张表合成一组 JSON 给
/// 客户端（见 `docs/flutter-mobile-plan.md` §34.2）。这里的手写 fromJson 有两个
/// 刻意的宽松点：
///
/// 1. **`options` / `tags` 可能是 JSON 字符串**：DB 里这两列是 TEXT，服务端
///    如果直接透传，客户端拿到的是 `'["A. 甲","B. 乙"]'`。解析器两种都吃；
/// 2. **计数字段可能缺失**：列表接口可以只回 `items[]`，条数由数组长度兜底，
///    避免「服务端少给一个 itemCount，界面就显示 0 条」。
library;

import 'dart:convert';

/// 草稿状态机（与服务端 `status` 列一一对应）。
enum DraftStatus {
  captured('captured', '已采集'),
  analyzing('analyzing', '识别中'),
  ready('ready', '待校对'),
  failed('failed', '识别失败'),
  confirmed('confirmed', '已入库'),
  discarded('discarded', '已丢弃'),
  unknown('unknown', '未知状态');

  const DraftStatus(this.wire, this.label);

  final String wire;
  final String label;

  static DraftStatus fromWire(String? raw) {
    for (final status in values) {
      if (status.wire == raw) return status;
    }
    return DraftStatus.unknown;
  }

}

/// 草稿列表项（`GET /api/drafts`）。
class QuestionDraftSummary {
  const QuestionDraftSummary({
    required this.id,
    required this.status,
    this.source = 'text',
    this.errorCode,
    this.createdAt = '',
    this.itemCount = 0,
    this.confirmedCount = 0,
  });

  factory QuestionDraftSummary.fromJson(Map<String, dynamic> json) {
    return QuestionDraftSummary(
      id: json['id']?.toString() ?? '',
      status: DraftStatus.fromWire(json['status']?.toString()),
      source: json['source']?.toString() ?? 'text',
      errorCode: json['errorCode']?.toString() ?? json['error_code']?.toString(),
      createdAt: json['createdAt']?.toString() ?? json['created_at']?.toString() ?? '',
      itemCount: _intOf(json['itemCount'] ?? json['item_count']) ??
          _listOf(json['items']).length,
      confirmedCount:
          _intOf(json['confirmedCount'] ?? json['confirmed_count']) ?? 0,
    );
  }

  final String id;
  final DraftStatus status;

  /// `camera` / `gallery` / `text` / `pdf`。
  final String source;
  final String? errorCode;
  final String createdAt;
  final int itemCount;
  final int confirmedCount;

  String get sourceLabel => switch (source) {
    'camera' => '拍照',
    'gallery' => '相册',
    'pdf' => 'PDF',
    _ => '文本',
  };
}

/// 草稿里的一条识别结果（对应 `question_draft_items` 一行）。
class QuestionDraftItem {
  const QuestionDraftItem({
    required this.idx,
    required this.content,
    this.options = const <String>[],
    this.answer = '',
    this.explanation = '',
    this.tags = const <String>[],
    this.type = 'single',
    this.materialHtml,
    this.confirmed = false,
  });

  factory QuestionDraftItem.fromJson(Map<String, dynamic> json) {
    return QuestionDraftItem(
      idx: _intOf(json['idx']) ?? 0,
      content: json['content']?.toString() ?? '',
      options: _stringList(json['options']),
      answer: json['answer']?.toString() ?? '',
      explanation: json['explanation']?.toString() ?? '',
      tags: _stringList(json['tags']),
      type: json['type']?.toString() ?? 'single',
      materialHtml: json['materialHtml']?.toString() ??
          json['material_html']?.toString(),
      // SQLite 的布尔列是 0/1，服务端可能原样透传，也可能是 true/false。
      confirmed: _boolOf(json['confirmed']),
    );
  }

  final int idx;
  final String content;
  final List<String> options;
  final String answer;
  final String explanation;
  final List<String> tags;
  final String type;
  final String? materialHtml;

  /// 勾了「确认入库」的条目才会在 `POST /confirm` 时写进题库。
  final bool confirmed;

  QuestionDraftItem copyWith({
    String? content,
    List<String>? options,
    String? answer,
    String? explanation,
    List<String>? tags,
    String? type,
    bool? confirmed,
  }) {
    return QuestionDraftItem(
      idx: idx,
      content: content ?? this.content,
      options: options ?? this.options,
      answer: answer ?? this.answer,
      explanation: explanation ?? this.explanation,
      tags: tags ?? this.tags,
      type: type ?? this.type,
      materialHtml: materialHtml,
      confirmed: confirmed ?? this.confirmed,
    );
  }

  /// 单条修改的请求体（`PATCH /api/drafts/:id/items/:idx`）。
  ///
  /// 服务端按「给了哪个键就改哪个键」处理，所以这里不做整对象覆盖：
  /// 只勾确认的请求不会把用户正在编辑的题干冲掉。
  Map<String, dynamic> toPatchPayload() {
    return <String, dynamic>{
      'content': content.trim(),
      'options': options.map((option) => option.trim()).toList(),
      'answer': answer.trim(),
      'explanation': explanation.trim(),
      'tags': tags,
      'type': type,
      'confirmed': confirmed,
    };
  }
}

/// 草稿详情（`GET /api/drafts/:id`）。
class QuestionDraft {
  const QuestionDraft({
    required this.id,
    required this.status,
    this.source = 'text',
    this.errorCode,
    this.createdAt = '',
    this.items = const <QuestionDraftItem>[],
  });

  factory QuestionDraft.fromJson(Map<String, dynamic> json) {
    return QuestionDraft(
      id: json['id']?.toString() ?? '',
      status: DraftStatus.fromWire(json['status']?.toString()),
      source: json['source']?.toString() ?? 'text',
      errorCode: json['errorCode']?.toString() ?? json['error_code']?.toString(),
      createdAt: json['createdAt']?.toString() ?? json['created_at']?.toString() ?? '',
      items: _listOf(json['items'])
          .map((item) => QuestionDraftItem.fromJson(_asMap(item)))
          .toList(),
    );
  }

  final String id;
  final DraftStatus status;
  final String source;
  final String? errorCode;
  final String createdAt;
  final List<QuestionDraftItem> items;

  int get confirmedCount =>
      items.where((item) => item.confirmed).length;

  bool get hasConfirmed => confirmedCount > 0;
}

/// `POST /api/drafts/:id/confirm` 的结果。
class DraftConfirmResult {
  const DraftConfirmResult({
    required this.created,
    this.skipped = 0,
    this.conflicts = const <String>[],
  });

  factory DraftConfirmResult.fromJson(Map<String, dynamic> json) {
    return DraftConfirmResult(
      created: _intOf(json['created']) ?? 0,
      skipped: _intOf(json['skipped']) ?? 0,
      conflicts: _listOf(json['conflicts'])
          .map((conflict) => conflict.toString())
          .toList(),
    );
  }

  final int created;
  final int skipped;

  /// 因重复/冲突被跳过的条目说明（服务端给，可能是题目指纹）。
  final List<String> conflicts;

  /// 给用户看的一句话。
  String get summary {
    final parts = <String>['已入库 $created 题'];
    if (skipped > 0) parts.add('跳过 $skipped 题');
    return parts.join('，');
  }
}

// ---------------------------------------------------------------------------
// 解析工具（服务端字段可能是 JSON 字符串 / 0-1 / 缺失）
// ---------------------------------------------------------------------------

int? _intOf(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value.trim());
  return null;
}

bool _boolOf(Object? value) {
  if (value is bool) return value;
  if (value is num) return value != 0;
  if (value is String) {
    final normalized = value.trim().toLowerCase();
    return normalized == 'true' || normalized == '1';
  }
  return false;
}

List<dynamic> _listOf(Object? value) {
  if (value is List) return value;
  return const <dynamic>[];
}

Map<String, dynamic> _asMap(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return value.cast<String, dynamic>();
  return const <String, dynamic>{};
}

/// 列表字段：接受数组、JSON 数组字符串，以及用逗号分隔的普通字符串。
List<String> _stringList(Object? value) {
  if (value == null) return const <String>[];
  if (value is List) {
    return value.map((item) => item.toString()).toList();
  }
  if (value is String) {
    final raw = value.trim();
    if (raw.isEmpty) return const <String>[];
    if (raw.startsWith('[')) {
      try {
        final decoded = jsonDecode(raw);
        if (decoded is List) {
          return decoded.map((item) => item.toString()).toList();
        }
      } on FormatException {
        // 不是合法 JSON：按普通分隔字符串继续解析，别把整条草稿判成坏数据
      }
    }
    return raw
        .split(RegExp(r'[,，、;；\n]+'))
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty)
        .toList();
  }
  return const <String>[];
}
