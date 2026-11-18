import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../auth/token_util.dart';

import '../../features/practice/data/local_practice_store.dart';

/// 一次 flush 的结果统计。
class SyncResult {
  final int sessions;
  final int answers;
  final int duplicated;
  final String? error;

  const SyncResult({
    required this.sessions,
    required this.answers,
    required this.duplicated,
    this.error,
  });

  const SyncResult.empty()
      : sessions = 0,
        answers = 0,
        duplicated = 0,
        error = null;
}

/// 把本地离线练习记录推送给后端的服务。
///
/// 幂等性由后端 (user, sessionKey) 唯一索引保证：sessionKey 使用本地
/// localId，重发同一会话不会重复计数（响应 duplicated=true）。
class SyncService {
  SyncService(this._store, this._dio);

  final LocalPracticeStore _store;
  final Dio _dio;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;

  static const String _offlineAnswersPath = '/practice/offline-answers';
  static const String _sessionName = '离线练习';

  /// 把所有待同步会话推给后端。
  ///
  /// 单个会话失败不影响其余会话；401 时立即中止整个 flush
  /// （token 失效，继续发只会继续 401）。
  Future<SyncResult> flush() async {
    // 待同步数据按账号归属过滤：换账号后绝不能拿新账号的凭据上传旧账号的作答。
    final token = await _storage.read(key: 'jwt_token');
    final userId = token == null ? null : TokenUtil.userIdOf(token);
    if (userId == null) {
      return const SyncResult(
        sessions: 0,
        answers: 0,
        duplicated: 0,
        error: '未登录或登录已失效，已跳过同步',
      );
    }

    final sessions = await _store.pendingSessions(userId: userId);
    if (sessions.isEmpty) {
      return const SyncResult.empty();
    }

    var syncedSessions = 0;
    var syncedAnswers = 0;
    var duplicatedSessions = 0;
    final errors = <String>[];

    for (final session in sessions) {
      // 同一 localId 可能分多批补交（宽限期跳过的、断网期间新增的）。
      // 若固定用 localId 当幂等键，第二批会被服务端判为重复而整批丢弃；
      // 这里用「localId + 本批首条 clientKey」保证：同批重试幂等，新批次独立成场。
      final batchKey =
          '${session.localId}:${session.answers.first.clientKey}';
      final sentKeys = session.answers
          .map((answer) => answer.clientKey)
          .toList();
      try {
        final response = await _dio.post<dynamic>(
          _offlineAnswersPath,
          data: <String, dynamic>{
            'sessionKey': batchKey,
            'sessionName': _sessionName,
            'answers': <Map<String, dynamic>>[
              for (final answer in session.answers)
                <String, dynamic>{
                  'questionId': answer.questionId,
                  'userAnswer': answer.userAnswer,
                  'isCorrect': answer.isCorrect,
                  'durationMs': answer.durationMs,
                },
            ],
          },
        );
        final data = response.data;
        if (data is! Map) {
          errors.add('会话 ${session.localId} 响应格式非预期，未标记已同步');
          continue;
        }
        final String? serverSessionId = data['sessionId']?.toString();
        final bool duplicated = data['duplicated'] == true;
        // 只确认本次真正上传的作答，否则请求期间新增的记录会被误标为已同步
        await _store.markAnswersSynced(sentKeys);
        await _store.markLocalSessionServerId(session.localId, serverSessionId);
        syncedSessions++;
        syncedAnswers += session.answers.length;
        if (duplicated) {
          duplicatedSessions++;
        }
      } on DioException catch (error) {
        if (error.response?.statusCode == 401) {
          errors.add('登录已失效（401），本次同步中止');
          return SyncResult(
            sessions: syncedSessions,
            answers: syncedAnswers,
            duplicated: duplicatedSessions,
            error: errors.join('\n'),
          );
        }
        errors.add(_describeDioError(error, session.localId));
      } catch (error) {
        errors.add('会话 ${session.localId} 同步异常: $error');
      }
    }

    return SyncResult(
      sessions: syncedSessions,
      answers: syncedAnswers,
      duplicated: duplicatedSessions,
      error: errors.isEmpty ? null : errors.join('\n'),
    );
  }

  /// 监听网络状态，恢复联网时自动 flush。
  void startAutoSync() {
    if (_connectivitySubscription != null) {
      return;
    }
    _connectivitySubscription = Connectivity()
        .onConnectivityChanged
        .listen(_onConnectivityChanged);
  }

  void _onConnectivityChanged(List<ConnectivityResult> results) {
    final online = results.any((result) => result != ConnectivityResult.none);
    if (!online) {
      return;
    }
    unawaited(_flushAndLog());
  }

  Future<void> _flushAndLog() async {
    try {
      final result = await flush();
      if (result.error != null) {
        debugPrint('[SyncService] 自动同步未全部成功: ${result.error}');
      }
    } catch (error) {
      debugPrint('[SyncService] 自动同步异常: $error');
    }
  }

  void dispose() {
    unawaited(_connectivitySubscription?.cancel());
    _connectivitySubscription = null;
  }

  String _describeDioError(DioException error, String localId) {
    final status = error.response?.statusCode;
    final detail = error.message ?? error.type.name;
    return '会话 $localId 同步失败（HTTP ${status ?? '无响应'}）: $detail';
  }
}
