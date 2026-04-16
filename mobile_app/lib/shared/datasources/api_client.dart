import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';
import '../../core/constants/api_constants.dart';
import '../../features/practice/domain/first_principles_response.dart';
import '../../features/practice/domain/question.dart';
import '../../features/practice/domain/practice_session.dart';

part 'api_client.g.dart';

@RestApi()
abstract class ApiClient {
  factory ApiClient(Dio dio, {String baseUrl}) = _ApiClient;

  // 认证相关
  @POST(ApiConstants.login)
  Future<dynamic> login(@Body() Map<String, dynamic> body);

  @POST('/auth/register')
  Future<dynamic> register(@Body() Map<String, dynamic> body);

  // 题库相关
  @GET(ApiConstants.questions)
  Future<QuestionListResponse> getQuestions({
    @Query('page') int? page,
    @Query('limit') int? limit,
    @Query('search') String? search,
    @Query('type') String? type,
  });

  @GET('${ApiConstants.questions}/{id}')
  Future<Question> getQuestionDetail(@Path('id') String id);

  // 练习相关
  @POST('/practice/session')
  Future<PracticeSession> createSession(@Body() Map<String, dynamic> body);

  @POST('/practice/session/{sessionId}/submit')
  Future<dynamic> submitAnswer(
    @Path('sessionId') String sessionId,
    @Body() Map<String, dynamic> body,
  );

  // 历史记录
  @GET('/history')
  Future<dynamic> getHistory(
    @Query('page') int page,
    @Query('pageSize') int pageSize,
  );

  @GET('/history/{id}')
  Future<dynamic> getHistoryDetail(@Path('id') String id);

  // 知识卡片
  @POST(ApiConstants.knowledgeCards)
  Future<dynamic> createKnowledgeCard(@Body() Map<String, dynamic> body);

  @GET(ApiConstants.knowledgeCards)
  Future<dynamic> getKnowledgeCards({
    @Query('category') String? category,
    @Query('limit') int? limit,
  });

  // 掌握度
  @GET(ApiConstants.masteryTree)
  Future<dynamic> getMasteryTree();

  @GET(ApiConstants.masteryStats)
  Future<dynamic> getMasteryStats(@Query('tag') String tag);

  // 第一性原理
  @POST(ApiConstants.firstPrinciples)
  Future<FirstPrinciplesResponse> analyzeFirstPrinciples(
    @Body() Map<String, dynamic> body,
  );

  // 学习统计（Dashboard 数据）
  @GET('/stats')
  Future<dynamic> getStats();

  // 个人信息
  @GET('/profile')
  Future<dynamic> getProfile();

  // 教材库
  @GET('/textbook')
  Future<dynamic> getTextbooks();

  @GET('/textbook/{id}')
  Future<dynamic> getTextbookDetail(@Path('id') int id);
}
