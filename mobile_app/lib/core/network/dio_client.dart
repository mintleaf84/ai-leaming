import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../constants/api_constants.dart';

final dioProvider = Provider<Dio>((ref) {
  final dio = Dio();

  dio.options.baseUrl = ApiConstants.baseUrl;
  dio.options.connectTimeout = const Duration(
    milliseconds: ApiConstants.connectTimeout,
  );
  dio.options.receiveTimeout = const Duration(
    milliseconds: ApiConstants.receiveTimeout,
  );
  dio.options.headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  // Add logging interceptor
  dio.interceptors.add(LogInterceptor(requestBody: true, responseBody: true));

  // TODO: Add AuthInterceptor here

  return dio;
});
