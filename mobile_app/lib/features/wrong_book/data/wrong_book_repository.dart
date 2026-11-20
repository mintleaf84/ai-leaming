import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/dio_client.dart';
import '../domain/wrong_question.dart';

/// 错题本 Repository
class WrongBookRepository {
  final Dio _dio;

  WrongBookRepository(this._dio);

  /// 获取错题列表
  Future<List<WrongQuestion>> getWrongQuestions() async {
    final response = await _dio.get('/wrong-book');
    final list = response.data as List<dynamic>;
    return list
        .map((e) => WrongQuestion.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// 按知识点分组
  Future<List<WrongQuestionsByTag>> getWrongQuestionsByTag() async {
    final response = await _dio.get('/wrong-book/by-tag');
    final list = response.data as List<dynamic>;
    return list
        .map((e) => WrongQuestionsByTag.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// 统计数据
  Future<WrongBookStats> getStats() async {
    final response = await _dio.get('/wrong-book/stats');
    return WrongBookStats.fromJson(response.data as Map<String, dynamic>);
  }

  /// 题目详情
  Future<WrongQuestionDetail> getDetail(String questionId) async {
    final response = await _dio.get('/wrong-book/$questionId');
    return WrongQuestionDetail.fromJson(response.data as Map<String, dynamic>);
  }

  /// 创建错题练习会话
  Future<Map<String, dynamic>> createPractice(List<String> questionIds) async {
    final response = await _dio.post(
      '/wrong-book/practice',
      data: {'questionIds': questionIds},
    );
    return response.data as Map<String, dynamic>;
  }

  /// 标记已掌握
  Future<void> markAsMastered(String questionId) async {
    await _dio.post('/wrong-book/$questionId/master');
  }

  /// 取消掌握
  Future<void> unmarkMastered(String questionId) async {
    await _dio.delete('/wrong-book/$questionId/master');
  }
}

/// Repository Provider
///
/// 用 `watch` 而不是 `read`：dioProvider 会在服务器地址变更后重建，仓库必须跟着
/// 换成新 dio，否则换服务器后错题本仍然打旧地址。
final wrongBookRepositoryProvider = Provider<WrongBookRepository>((ref) {
  return WrongBookRepository(ref.watch(dioProvider));
});

/// 首页「累计 N 条」只读一个数字。
///
/// 为什么不用 `wrongBookControllerProvider`：它的 `loadData()` 会同时拉
/// 整份错题列表 + 按标签分组 + 统计（三份载荷，列表还带题干正文），
/// 首页为了一个角标付不起这个代价。这里单独打一次 `/wrong-book/stats`。
///
/// 进错题本页面后总数可能变化，本 provider 不会自动失效：首页重新挂载时
/// 会再取一次（与 statsController 的口径一致，不做后台轮询）。
final wrongBookTotalProvider = FutureProvider.autoDispose<int>((ref) async {
  final stats = await ref.watch(wrongBookRepositoryProvider).getStats();
  return stats.total;
});
