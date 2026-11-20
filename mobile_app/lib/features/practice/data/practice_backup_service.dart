import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../../core/auth/token_util.dart';
import '../../../core/storage/preferences.dart';
import '../../../core/sync/sync_providers.dart';
import '../domain/practice_backup.dart';
import '../domain/practice_resume.dart';
import 'local_practice_store.dart';

/// 换机备份的导出/导入（§30 P2）。
///
/// 只读写**本地库 + SharedPreferences**，不联网：这一步是「服务端不可用/长期
/// 离线」时的兜底，凡是需要后端参与的路径都不该出现在这里。
///
/// 三条硬约束：
/// 1. **导出只含不可重建数据**（见 [PracticeBackup]），题库缓存不导出；
/// 2. **导入按 `userId` 校验归属**：备份属于别的账号就整份拒绝，绝不合并——
///    `pending_answers` 是按 user_id 隔离的，混进来后会用当前账号的凭据上传；
/// 3. **幂等**：`client_key` / `local_id` 已存在就跳过，同一份备份导入两次
///    不会产生重复作答（否则服务端会收到两条互相矛盾的记录）。
///
/// 导出/导入**不写诊断日志**：内容含作答事实，日志一旦复制出去就多一份泄漏面。
class PracticeBackupService {
  PracticeBackupService({
    required LocalPracticeStore store,
    required PreferencesStore preferences,
  }) : _store = store,
       _preferences = preferences;

  final LocalPracticeStore _store;
  final PreferencesStore _preferences;

  /// 允许随备份迁移的设置项白名单。
  ///
  /// 不做「备份里有什么 key 就写什么」：剪贴板是用户可编辑的，任意 key 写进
  /// SharedPreferences 等于给了一份本地配置的写入口（诊断日志、断点等 key
  /// 都有各自的校验逻辑，绕过它们就等于绕过校验）。
  static const Set<String> importableSettings = <String>{
    PreferencesKeys.themeMode,
    PreferencesKeys.reviewMode,
  };

  /// 导出为可直接放进剪贴板的 JSON 字符串。
  ///
  /// [userId] 必须来自当前登录 token（见 [currentAccountId]）：
  /// 导出的每条作答都只属于这个账号。
  Future<String> exportJson(String userId) async {
    final answers = await _store.unsyncedAnswersFor(userId);
    final sessions = await _store.localSessionsFor(userId);
    final resume = await _readOwnResume(userId);
    final settings = await _readSettings();
    return PracticeBackup(
      exportedAt: DateTime.now(),
      userId: userId,
      pendingAnswers: answers,
      localSessions: sessions,
      resume: resume,
      settings: settings,
    ).encode();
  }

  /// 导入 JSON 并合并；返回新增/跳过统计或拒绝原因。
  ///
  /// [currentUserId] 由调用方从 token 解析后传入（不在这里读存储，便于单测）。
  Future<BackupImportResult> importJson({
    required String raw,
    required String currentUserId,
  }) async {
    final parsed = PracticeBackup.parse(raw);
    final backup = parsed.backup;
    if (backup == null) {
      return BackupImportResult.rejected(parsed.error ?? '备份内容无法解析');
    }

    // 这是唯一一条「整份拒绝」的业务规则：串账号比丢数据严重得多。
    if (backup.userId != currentUserId) {
      return const BackupImportResult.rejected('备份属于其他账号，已拒绝导入');
    }

    final addedAnswers = await _store.insertBackupAnswers(
      backup.pendingAnswers,
      userId: currentUserId,
    );
    final addedSessions = await _store.insertBackupSessions(
      backup.localSessions,
      userId: currentUserId,
    );

    final resumeImported = await _importResume(backup.resume, currentUserId);
    final settingsImported = await _importSettings(backup.settings);

    return BackupImportResult(
      addedAnswers: addedAnswers,
      skippedAnswers: backup.pendingAnswers.length - addedAnswers,
      addedSessions: addedSessions,
      skippedSessions: backup.localSessions.length - addedSessions,
      resumeImported: resumeImported,
      settingsImported: settingsImported,
    );
  }

  /// 断点只在「本地没有」或「备份里的更新」时写入。
  ///
  /// 反过来（备份更旧）就跳过：用户在新机上已经开了新的一场，导入旧备份
  /// 不该把他拽回三天前的进度。
  Future<bool> _importResume(PracticeResume? incoming, String userId) async {
    if (incoming == null) {
      return false;
    }
    // 断点归属必须与账号一致；旧格式（无 userId）的断点不导入——
    // 客户端读断点时本来就会把无归属的整份丢弃。
    if (incoming.userId != userId) {
      return false;
    }
    final existing = await _readResumeRaw();
    final current = PracticeResume.decode(existing);
    if (current != null && !current.savedAt.isBefore(incoming.savedAt)) {
      return false;
    }
    try {
      await _preferences.write(
        PreferencesKeys.practiceResume,
        jsonEncode(incoming.toJson()),
      );
      return true;
    } catch (error) {
      debugPrint('[PracticeBackup] 写入断点失败（其余数据已导入）: $error');
      return false;
    }
  }

  Future<bool> _importSettings(Map<String, String> settings) async {
    var imported = false;
    for (final entry in settings.entries) {
      if (!importableSettings.contains(entry.key)) {
        continue;
      }
      try {
        await _preferences.write(entry.key, entry.value);
        imported = true;
      } catch (error) {
        // 单项失败不影响其余项：设置本来就是「能带走最好」的非关键数据。
        debugPrint('[PracticeBackup] 写入设置 ${entry.key} 失败: $error');
      }
    }
    return imported;
  }

  Future<PracticeResume?> _readOwnResume(String userId) async {
    final resume = PracticeResume.decode(await _readResumeRaw());
    // 没有归属（旧格式）或不属于当前账号：不导出，导入端也装不进去。
    if (resume == null || resume.userId != userId) {
      return null;
    }
    return resume;
  }

  Future<String?> _readResumeRaw() async {
    try {
      return await _preferences.read(PreferencesKeys.practiceResume);
    } catch (error) {
      debugPrint('[PracticeBackup] 读取断点失败，按「没有断点」导出: $error');
      return null;
    }
  }

  Future<Map<String, String>> _readSettings() async {
    final settings = <String, String>{};
    for (final key in importableSettings) {
      try {
        final value = await _preferences.read(key);
        if (value != null) {
          settings[key] = value;
        }
      } catch (error) {
        debugPrint('[PracticeBackup] 读取设置 $key 失败，跳过: $error');
      }
    }
    return settings;
  }
}

/// 读取当前登录账号 id（`TokenUtil.userIdOf(jwt_token)`）。
///
/// 未登录、token 读失败或解析不出 user.id 时返回 null：调用方据此提示
/// 「请先登录再导出/导入」，而不是导出一份没有归属的备份。
Future<String?> currentAccountId() async {
  try {
    const storage = FlutterSecureStorage();
    final token = await storage.read(key: 'jwt_token');
    if (token == null || token.isEmpty) {
      return null;
    }
    return TokenUtil.userIdOf(token);
  } catch (error) {
    debugPrint('[PracticeBackup] 读取当前账号失败: $error');
    return null;
  }
}

final practiceBackupServiceProvider = Provider<PracticeBackupService>((ref) {
  return PracticeBackupService(
    store: ref.watch(localPracticeStoreProvider),
    preferences: ref.watch(preferencesStoreProvider),
  );
});
