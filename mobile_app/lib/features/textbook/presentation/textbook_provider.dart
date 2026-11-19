import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/datasources/api_client.dart';
import '../domain/textbook.dart';

/// 教材列表状态
class TextbookListState {
  final List<Textbook> textbooks;
  final bool isLoading;
  final String? error;

  const TextbookListState({
    this.textbooks = const [],
    this.isLoading = false,
    this.error,
  });

  TextbookListState copyWith({
    List<Textbook>? textbooks,
    bool? isLoading,
    String? error,
  }) {
    return TextbookListState(
      textbooks: textbooks ?? this.textbooks,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

/// 教材列表控制器
class TextbookListController extends Notifier<TextbookListState> {
  /// 请求序号：每发起一次加载自增，回调落地前比对，避免「先发后到」的旧响应
  /// 覆盖新响应（连点刷新时会出现）。
  int _requestSeq = 0;

  @override
  TextbookListState build() => const TextbookListState();

  ApiClient get _apiClient {
    final dio = ref.watch(dioProvider);
    return ApiClient(dio);
  }

  /// 加载教材列表
  Future<void> load() async {
    final seq = ++_requestSeq;
    state = state.copyWith(isLoading: true, error: null);

    try {
      final response = await _apiClient.getTextbooks();
      final list = (response as List<dynamic>)
          .map((e) => Textbook.fromJson(e as Map<String, dynamic>))
          .toList();

      // 已经有更新的请求发出，这份旧结果（含其失败）必须整体丢弃。
      if (seq != _requestSeq) return;

      state = state.copyWith(isLoading: false, textbooks: list);
    } catch (e) {
      if (seq != _requestSeq) return;
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }
}

/// 教材详情状态
class TextbookDetailState {
  final TextbookDetail? detail;
  final bool isLoading;
  final String? error;

  const TextbookDetailState({
    this.detail,
    this.isLoading = false,
    this.error,
  });

  TextbookDetailState copyWith({
    TextbookDetail? detail,
    bool? isLoading,
    String? error,
  }) {
    return TextbookDetailState(
      detail: detail ?? this.detail,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

/// 教材详情异步 Provider（带 textbookId 参数）
final textbookDetailProvider =
    FutureProvider.autoDispose.family<TextbookDetailState, int>(
      (ref, textbookId) async {
        try {
          final dio = ref.watch(dioProvider);
          final apiClient = ApiClient(dio);
          final response = await apiClient.getTextbookDetail(textbookId);
          final detail =
              TextbookDetail.fromJson(response as Map<String, dynamic>);
          return TextbookDetailState(isLoading: false, detail: detail);
        } catch (e) {
          return TextbookDetailState(isLoading: false, error: e.toString());
        }
      },
    );

final textbookListControllerProvider =
    NotifierProvider<TextbookListController, TextbookListState>(
      TextbookListController.new,
    );
