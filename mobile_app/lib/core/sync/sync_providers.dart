import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/practice/data/local_practice_store.dart';
import '../network/dio_client.dart';
import 'sync_service.dart';

/// 离线存储层单例。测试里可以 override 成注入了内存数据库的实例。
final localPracticeStoreProvider = Provider<LocalPracticeStore>((ref) {
  return LocalPracticeStore();
});

/// 同步服务：启动即开始监听网络恢复，并尝试补交一次历史遗留的待同步记录。
///
/// 首次读取（`ref.watch`/`ref.read`）时才创建，因此只要 App 启动路径上有任何
/// 地方 watch 它，就会生效；`main.dart` 里显式 watch 一次，避免"没人读就永不启动"。
final syncServiceProvider = Provider<SyncService>((ref) {
  final service = SyncService(
    ref.watch(localPracticeStoreProvider),
    ref.watch(dioProvider),
  );
  service.startAutoSync();
  // 启动时补交一次：上次退出前断网遗留的作答不必等用户切网络才上传。
  unawaited(
    service.flush().catchError((Object error) {
      debugPrint('[Sync] 启动补交失败: $error');
      return const SyncResult.empty();
    }),
  );
  ref.onDispose(service.dispose);
  return service;
});
