import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';
import '../../core/constants/api_constants.dart';
import '../../domain/entities/first_principles_response.dart';

part 'api_client.g.dart';

@RestApi(baseUrl: ApiConstants.baseUrl)
abstract class ApiClient {
  factory ApiClient(Dio dio, {String baseUrl}) = _ApiClient;

  // 认证相关
  @POST(ApiConstants.login)
  Future<dynamic> login(@Body() Map<String, dynamic> body);

  @POST('/auth/register')
  Future<dynamic> register(@Body() Map<String, dynamic> body);

  // 练习相关
  @POST('/practice/session')
  Future<dynamic> createSession(@Body() Map<String, dynamic> body);

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
}
