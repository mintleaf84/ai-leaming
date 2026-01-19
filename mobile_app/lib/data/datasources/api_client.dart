import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';
import '../../core/constants/api_constants.dart';

part 'api_client.g.dart';

@RestApi(baseUrl: ApiConstants.baseUrl)
abstract class ApiClient {
  factory ApiClient(Dio dio, {String baseUrl}) = _ApiClient;

  @POST(ApiConstants.login)
  Future<dynamic> login(@Body() Map<String, dynamic> body);

  @POST('/auth/register')
  Future<dynamic> register(@Body() Map<String, dynamic> body);
}
