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
final wrongBookRepositoryProvider = Provider<WrongBookRepository>((ref) {
  return WrongBookRepository(ref.read(dioProvider));
});
