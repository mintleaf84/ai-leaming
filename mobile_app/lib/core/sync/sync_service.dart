import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

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

  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;

  static const String _offlineAnswersPath = '/practice/offline-answers';
  static const String _sessionName = '离线练习';

  /// 把所有待同步会话推给后端。
  ///
  /// 单个会话失败不影响其余会话；401 时立即中止整个 flush
  /// （token 失效，继续发只会继续 401）。
  Future<SyncResult> flush() async {
    final sessions = await _store.pendingSessions();
    if (sessions.isEmpty) {
      return const SyncResult.empty();
    }

    var syncedSessions = 0;
    var syncedAnswers = 0;
    var duplicatedSessions = 0;
    final errors = <String>[];

    for (final session in sessions) {
      try {
        final response = await _dio.post<dynamic>(
          _offlineAnswersPath,
          data: <String, dynamic>{
            'sessionKey': session.localId,
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
        await _store.markSessionSynced(session.localId, serverSessionId);
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
