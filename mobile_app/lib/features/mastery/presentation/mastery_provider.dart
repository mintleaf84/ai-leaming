import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/datasources/api_client.dart';

/// 掌握度节点
class MasteryNode {
  final String name;
  final String path;
  final num score; // Changed to num to handle int/double safely
  final int level;
  final List<MasteryNode> children;

  MasteryNode({
    required this.name,
    required this.path,
    required this.score,
    required this.level,
    this.children = const [],
  });

  factory MasteryNode.fromJson(Map<String, dynamic> json) {
    return MasteryNode(
      name: json['name'] as String,
      path: json['path'] as String,
      score: json['score'] as num,
      level: json['level'] as int,
      children:
          (json['children'] as List?)
              ?.map((e) => MasteryNode.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }
}

/// 掌握度状态
class MasteryState {
  final List<MasteryNode> tree;
  final bool isLoading;
  final String? error;

  const MasteryState({
    this.tree = const [],
    this.isLoading = false,
    this.error,
  });

  MasteryState copyWith({
    List<MasteryNode>? tree,
    bool? isLoading,
    String? error,
  }) {
    return MasteryState(
      tree: tree ?? this.tree,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

/// 掌握度控制器
class MasteryController extends Notifier<MasteryState> {
  @override
  MasteryState build() => const MasteryState();

  ApiClient get _apiClient {
    final dio = ref.watch(dioProvider);
    return ApiClient(dio);
  }

  /// 加载掌握度树
  Future<void> loadTree() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final response = await _apiClient.getMasteryTree();

      // response might be a List directly
      final tree = (response as List<dynamic>)
          .map((e) => MasteryNode.fromJson(e as Map<String, dynamic>))
          .toList();

      state = state.copyWith(isLoading: false, tree: tree);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }
}

final masteryControllerProvider =
    NotifierProvider<MasteryController, MasteryState>(MasteryController.new);
