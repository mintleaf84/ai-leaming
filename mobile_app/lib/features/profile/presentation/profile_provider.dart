import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/foundation.dart';
import '../../../core/error/user_message.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/datasources/api_client.dart';
import '../domain/user_profile.dart';

/// 个人信息状态
class ProfileState {
  final UserProfile? profile;
  final bool isLoading;
  final String? error;

  const ProfileState({
    this.profile,
    this.isLoading = false,
    this.error,
  });

  ProfileState copyWith({
    UserProfile? profile,
    bool? isLoading,
    String? error,
  }) {
    return ProfileState(
      profile: profile ?? this.profile,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

/// 个人信息控制器
class ProfileController extends Notifier<ProfileState> {
  @override
  ProfileState build() => const ProfileState();

  ApiClient get _apiClient {
    // 用 read 而不是 watch：这里在控制器方法里取一次用，不参与 build 的依赖图。
    // watch 会把「后端地址变了」变成对本控制器的 invalidateSelf，正在加载的
    // 列表被重建回空态，方法里随后落地的 state 也就写不回去了。
    final dio = ref.read(dioProvider);
    return ApiClient(dio);
  }

  /// 加载个人信息
  Future<void> load() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final response = await _apiClient.getProfile();
      final profile = UserProfile.fromJson(response as Map<String, dynamic>);
      state = state.copyWith(isLoading: false, profile: profile);
    } catch (e) {
      debugPrint('[Profile] 加载个人信息失败: $e');
      state = state.copyWith(isLoading: false, error: userMessageOf(e));
    }
  }
}

final profileControllerProvider =
    NotifierProvider<ProfileController, ProfileState>(ProfileController.new);
