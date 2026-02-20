import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../domain/first_principles_response.dart';
import '../domain/first_principles_params.dart';
import '../../../shared/datasources/api_client.dart';
import '../../../core/network/dio_client.dart';

final firstPrinciplesProvider =
    FutureProvider.family<FirstPrinciplesResponse, FirstPrinciplesParams>((
      ref,
      params,
    ) async {
      final dio = ref.watch(dioProvider);
      final client = ApiClient(dio);
      return client.analyzeFirstPrinciples(params.toJson());
    });
