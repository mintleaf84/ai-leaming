import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/first_principles_response.dart';
import '../../domain/entities/first_principles_params.dart';
import '../../data/datasources/api_client.dart';
import '../network/dio_client.dart';

final firstPrinciplesProvider =
    FutureProvider.family<FirstPrinciplesResponse, FirstPrinciplesParams>((
      ref,
      params,
    ) async {
      final dio = ref.watch(dioProvider);
      final client = ApiClient(dio);
      return client.analyzeFirstPrinciples(params.toJson());
    });
