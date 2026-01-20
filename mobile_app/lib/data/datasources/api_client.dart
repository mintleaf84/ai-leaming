import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';
import '../../core/constants/api_constants.dart';

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
}
