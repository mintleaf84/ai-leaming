import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/user_message.dart';
import '../../../core/sync/sync_providers.dart';
import '../data/local_practice_store.dart';
import '../data/practice_repository_impl.dart';

/// 题库预下载的状态。
enum PrefetchStatus {
  /// 没下过，或下了一部分停下（看 `pagesDone` 区分）。
  idle,

  /// 正在逐页拉取。
  running,

  /// 整库下载完成（`fetched_at` 已统一）。
  done,

  /// 中途失败；已下页数保留，可继续。
  failed,
}

class QuestionPrefetchState {
  const QuestionPrefetchState({
    this.status = PrefetchStatus.idle,
    this.localCount = 0,
    this.serverTotal = 0,
    this.version = 0,
    this.pagesDone = 0,
    this.totalPages = 0,
    this.error,
  });

  final PrefetchStatus status;

  /// 本地已缓存题数（`cached_questions` 行数）。
  final int localCount;

  /// 服务端总题数；0 = 还不知道（从未下载过）。
  final int serverTotal;

  /// 题库版本：完整下载的批次数。服务端没有版本号，这是唯一诚实的计数——
  /// 它只说明「本地题库被完整刷新过几次」，不代表服务端内容版本。
  final int version;

  final int pagesDone;
  final int totalPages;
  final String? error;

  bool get isRunning => status == PrefetchStatus.running;

  bool get isDone => status == PrefetchStatus.done;

  /// 下过一部分但没完成（用来把按钮文案切成「继续下载」）。
  bool get isPartial =>
      status != PrefetchStatus.running &&
      status != PrefetchStatus.done &&
      pagesDone > 0;

  String get versionLabel => 'v$version';

  /// 0~1，供进度条使用；未知总量时返回 null（不显示不确定进度）。
  double? get progress {
    if (totalPages <= 0) {
      return null;
    }
    return (pagesDone / totalPages).clamp(0, 1).toDouble();
  }

  QuestionPrefetchState copyWith({
    PrefetchStatus? status,
    int? localCount,
    int? serverTotal,
    int? version,
    int? pagesDone,
    int? totalPages,
    String? error,
    bool clearError = false,
  }) {
    return QuestionPrefetchState(
      status: status ?? this.status,
      localCount: localCount ?? this.localCount,
      serverTotal: serverTotal ?? this.serverTotal,
      version: version ?? this.version,
      pagesDone: pagesDone ?? this.pagesDone,
      totalPages: totalPages ?? this.totalPages,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

/// 题库预下载（设置页「题库预下载」）。
///
/// 为什么需要它：离线出题只从 `cached_questions` 抽题，平时缓存靠「用户翻到
/// 哪页就存哪页」攒，换机/长期断网时本地可能只有零星几十题。预下载按页拉全量，
/// 一次把整库落到本地。
///
/// **已知口径**：`GET /questions` 列表接口只返回题面（不含 `answer` /
/// `explanation`），所以预下载解决的是「题面齐全、有题可看」，离线判分仍受
/// `LocalPracticeStore.pickRandom` 的「必须有答案」过滤限制——给列表接口补答案
/// 属于后端契约变更，不在本功能范围内。
///
/// 三条行为约定：
/// 1. **可中断**：每拉完一页就落一次进度（`sync_meta`），随时停下都不丢进度；
/// 2. **可从断点续**：下次点「继续下载」只拉剩下的页，不从头再来；
/// 3. **完成时统一 `fetched_at`**：逐页写 `now` 会让先下的页提前过期，
///    整库完成才代表「同一时刻拿到的一版题库」，见
///    [LocalPracticeStore.markAllQuestionsFetchedAt]。
class QuestionPrefetchController extends Notifier<QuestionPrefetchState> {
  /// 每页条数；服务端 `limit` 上限是 100（见 `parsePagination`）。
  static const int pageSize = 100;

  /// 进度落盘键（JSON：pagesDone / totalPages / total）。
  static const String progressMetaKey = 'question_prefetch_progress';

  /// 题库版本键（整数，完整下载次数）。
  static const String versionMetaKey = 'question_bank_version';

  /// 中断标记：由 [cancel] 置位，循环在下一页开始前检查。
  bool _cancelRequested = false;

  /// 用户已手动开始/取消过：迟到的读盘结果不许覆盖当前状态。
  bool _touched = false;

  Future<void>? _restoreFuture;

  @override
  QuestionPrefetchState build() {
    unawaited(restore());
    return const QuestionPrefetchState();
  }

  /// 从本地库恢复「本地题数 / 版本 / 上次下到第几页」。测试里可以 `await`。
  Future<void> restore() => _restoreFuture ??= _restoreFromStore();

  Future<void> _restoreFromStore() async {
    final store = ref.read(localPracticeStoreProvider);
    var localCount = 0;
    var version = 0;
    var progress = _PrefetchProgress.empty;

    try {
      localCount = await store.cachedQuestionCount();
      version = int.tryParse(await store.getMeta(versionMetaKey) ?? '') ?? 0;
      progress = await _readProgress(store);
    } catch (error) {
      // 读不出来就按「没下过」显示：不影响用户重新下一遍。
      debugPrint('[QuestionPrefetch] 读取本地进度失败: $error');
    }

    if (!ref.mounted || _touched) return;
    final completed =
        progress.totalPages > 0 &&
        progress.pagesDone >= progress.totalPages &&
        version > 0;
    state = state.copyWith(
      status: completed ? PrefetchStatus.done : PrefetchStatus.idle,
      localCount: localCount,
      version: version,
      pagesDone: progress.pagesDone,
      totalPages: progress.totalPages,
      serverTotal: progress.total,
    );
  }

  /// 开始（或继续）逐页下载整库。
  ///
  /// 已完成后再次调用 = 重新下载一遍（服务端题库可能已更新）。
  Future<void> start() async {
    if (state.status == PrefetchStatus.running) {
      return;
    }
    _touched = true;
    _cancelRequested = false;

    final store = ref.read(localPracticeStoreProvider);
    final repository = ref.read(practiceRepositoryProvider);

    // 完成态再点 = 重下；部分完成 = 续传（从 pagesDone+1 页开始）。
    var pagesDone = state.isDone ? 0 : state.pagesDone;
    var totalPages = state.isDone ? 0 : state.totalPages;
    if (totalPages > 0 && pagesDone >= totalPages) {
      pagesDone = 0;
      totalPages = 0;
    }
    var serverTotal = state.isDone ? 0 : state.serverTotal;

    state = state.copyWith(
      status: PrefetchStatus.running,
      pagesDone: pagesDone,
      totalPages: totalPages,
      serverTotal: serverTotal,
      clearError: true,
    );

    try {
      var page = pagesDone + 1;
      while (true) {
        final response = await repository.getQuestions(
          page: page,
          limit: pageSize,
        );
        serverTotal = response.total;
        totalPages = serverTotal <= 0
            ? 0
            : (serverTotal + pageSize - 1) ~/ pageSize;
        if (serverTotal <= 0) {
          // 服务端说没有题：不缓存、不记进度，交给循环后的「题库为空」处理。
          break;
        }
        if (response.items.isEmpty) {
          // 还有页要拉却拿到空页：服务端/网关返回不一致，宁可中断也不假装下完
          // （假装下完会把整库 fetched_at 刷新成「新鲜」，用户却抽不到题）。
          throw StateError('第 $page 页未返回题目（服务端共 $serverTotal 题）');
        }

        // 显式缓存一次：仓储实现也会缓存（同一 upsert，重复无害），但预下载的
        // 进度与统一时间戳语义由本控制器负责，不能依赖别处顺手写的副作用。
        await store.cacheQuestions(response.items);
        pagesDone = page;

        final localCount = await store.cachedQuestionCount();
        await _writeProgress(
          store,
          _PrefetchProgress(
            pagesDone: pagesDone,
            totalPages: totalPages,
            total: serverTotal,
          ),
        );

        if (!ref.mounted) {
          return;
        }
        state = state.copyWith(
          pagesDone: pagesDone,
          totalPages: totalPages,
          serverTotal: serverTotal,
          localCount: localCount,
        );

        if (_cancelRequested) {
          // 用户主动中断：保留断点，状态回到「可继续」而不是 error。
          state = state.copyWith(status: PrefetchStatus.idle, clearError: true);
          return;
        }

        // 已到服务端题数对应的页数：整库已拉完。
        if (page >= totalPages) {
          break;
        }
        page++;
      }

      if (serverTotal <= 0) {
        if (!ref.mounted) return;
        state = state.copyWith(
          status: PrefetchStatus.failed,
          error: '服务端题库为空，暂无可下载的题目',
        );
        return;
      }

      // 整库完成：把全部题目的 fetched_at 统一成完成时刻，再 +1 版本。
      final fetchedAt = DateTime.now().millisecondsSinceEpoch;
      await store.markAllQuestionsFetchedAt(fetchedAt);
      final version = state.version + 1;
      await store.setMeta(versionMetaKey, '$version');
      final localCount = await store.cachedQuestionCount();

      if (!ref.mounted) return;
      state = state.copyWith(
        status: PrefetchStatus.done,
        version: version,
        localCount: localCount,
        pagesDone: totalPages,
        totalPages: totalPages,
        serverTotal: serverTotal,
        clearError: true,
      );
    } catch (error) {
      // 失败不丢进度：每页都已落盘，用户下次可以接着下。
      debugPrint('[QuestionPrefetch] 下载中断（已完成 $pagesDone 页）: $error');
      if (!ref.mounted) return;
      state = state.copyWith(
        status: PrefetchStatus.failed,
        pagesDone: pagesDone,
        totalPages: totalPages,
        serverTotal: serverTotal,
        error: userMessageOf(error),
      );
    }
  }

  /// 请求中断；当前页会跑完，进度照常落盘。
  void cancel() {
    if (state.status != PrefetchStatus.running) {
      return;
    }
    _cancelRequested = true;
  }

  Future<_PrefetchProgress> _readProgress(LocalPracticeStore store) async {
    final raw = await store.getMeta(progressMetaKey);
    if (raw == null || raw.isEmpty) {
      return _PrefetchProgress.empty;
    }
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) {
        return _PrefetchProgress.empty;
      }
      final pagesDone = decoded['pagesDone'];
      final totalPages = decoded['totalPages'];
      final total = decoded['total'];
      return _PrefetchProgress(
        pagesDone: pagesDone is int && pagesDone >= 0 ? pagesDone : 0,
        totalPages: totalPages is int && totalPages >= 0 ? totalPages : 0,
        total: total is int && total >= 0 ? total : 0,
      );
    } on FormatException catch (error) {
      debugPrint('[QuestionPrefetch] 进度格式损坏，按未下载处理: $error');
      return _PrefetchProgress.empty;
    }
  }

  Future<void> _writeProgress(
    LocalPracticeStore store,
    _PrefetchProgress progress,
  ) async {
    try {
      await store.setMeta(progressMetaKey, jsonEncode(progress.toJson()));
    } catch (error) {
      // 进度写失败只影响「断了要重下」，不该让整次下载失败。
      debugPrint('[QuestionPrefetch] 保存进度失败: $error');
    }
  }
}

class _PrefetchProgress {
  const _PrefetchProgress({
    required this.pagesDone,
    required this.totalPages,
    required this.total,
  });

  static const _PrefetchProgress empty = _PrefetchProgress(
    pagesDone: 0,
    totalPages: 0,
    total: 0,
  );

  final int pagesDone;
  final int totalPages;
  final int total;

  Map<String, dynamic> toJson() => <String, dynamic>{
    'pagesDone': pagesDone,
    'totalPages': totalPages,
    'total': total,
  };
}

final questionPrefetchControllerProvider =
    NotifierProvider<QuestionPrefetchController, QuestionPrefetchState>(
      QuestionPrefetchController.new,
    );
