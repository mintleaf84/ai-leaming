import 'dart:convert';

import 'agent_set_json.dart';

/// 单题判分的结果（`POST /practice/session/{sessionId}/submit` 的响应）。
///
/// 题集页面复用练习的判分接口，所以这里只做「把响应读成人话」这一件事：
/// 判断对错、把正确答按题型排版。**不读解析**——题集接口不含答案解析
/// （契约 §4.2），判分响应也只有 `isCorrect` / `correctAnswer`，编一段解析
/// 出来比不给更糟。
class AgentJudgeOutcome {
  final bool isCorrect;

  /// 服务端给的正确答案原文（多选可能是 JSON 数组字符串）。
  final String correctAnswer;

  /// 判分是在本地降级完成的（断网）。界面据此提示「这次判分没上传」。
  final bool offline;

  const AgentJudgeOutcome({
    required this.isCorrect,
    required this.correctAnswer,
    this.offline = false,
  });

  /// 正确答案的展示文案：多选 `["A","B"]` → `A、B`；单选原样。
  String get correctAnswerLabel {
    final raw = correctAnswer.trim();
    if (raw.startsWith('[')) {
      try {
        final decoded = jsonDecode(raw);
        if (decoded is List) {
          final items = decoded
              .map((item) => item.toString().trim())
              .where((item) => item.isNotEmpty);
          if (items.isNotEmpty) return items.join('、');
        }
      } on FormatException {
        // 不是合法 JSON：按原文展示，交给下面的兜底
      }
    }
    return raw.isEmpty ? '未提供' : raw;
  }

  /// 正确答案对应的选项字母集合（A/B/C…），用于选项卡高亮。
  ///
  /// 三种写法都认：
  /// - 字母串 `A` / `AB`（含逗号、顿号分隔）；
  /// - JSON 数组 `["A","B"]`（多选的提交口径）；
  /// - 判断题的原文字「正确 / 错误」（没有选项时服务端按原文判）。
  ///
  /// 解析不出来就返回空集：宁可不给绿色高亮，也不要标错一个选项。
  Set<String> get correctOptionLetters {
    final raw = correctAnswer.trim();
    if (raw.isEmpty) return const <String>{};
    if (raw == '正确' || raw == '对' || raw.toLowerCase() == 'true') {
      return const <String>{'A'};
    }
    if (raw == '错误' || raw == '错' || raw.toLowerCase() == 'false') {
      return const <String>{'B'};
    }
    var text = raw;
    if (text.startsWith('[')) {
      try {
        final decoded = jsonDecode(text);
        if (decoded is List) {
          text = decoded.map((item) => item.toString()).join();
        }
      } on FormatException {
        return const <String>{};
      }
    }
    final normalized = text.replaceAll(RegExp(r'[\s,，、;；]'), '').toUpperCase();
    if (!RegExp(r'^[A-Z]+$').hasMatch(normalized)) return const <String>{};
    return normalized.split('').toSet();
  }

  factory AgentJudgeOutcome.fromResponse(Map<String, dynamic> json) {
    return AgentJudgeOutcome(
      isCorrect: readBool(json['isCorrect']),
      correctAnswer: readString(json['correctAnswer']),
      offline: readBool(json['offline']),
    );
  }
}
