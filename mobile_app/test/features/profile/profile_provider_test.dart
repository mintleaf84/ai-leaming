import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/profile/domain/user_profile.dart';
import 'package:mobile_app/features/profile/presentation/profile_provider.dart';

void main() {
  group('UserProfile fromJson 单元测试', () {
    final sampleJson = {
      'id': 1,
      'username': 'testuser',
      'role': 'student',
      'createdAt': '2024-01-01T00:00:00.000Z',
      'stats': {
        'totalSessions': 10,
        'totalAnswered': 100,
        'totalCorrect': 80,
        'overallAccuracy': 0.8,
        'knowledgeCardCount': 20,
        'wrongBookCount': 5,
      },
    };

    test('正常 JSON 反序列化', () {
      final profile = UserProfile.fromJson(sampleJson);

      expect(profile.id, 1);
      expect(profile.username, 'testuser');
      expect(profile.role, 'student');
      expect(profile.createdAt, '2024-01-01T00:00:00.000Z');
      expect(profile.stats.totalSessions, 10);
      expect(profile.stats.totalAnswered, 100);
      expect(profile.stats.totalCorrect, 80);
      expect(profile.stats.overallAccuracy, closeTo(0.8, 0.001));
      expect(profile.stats.knowledgeCardCount, 20);
      expect(profile.stats.wrongBookCount, 5);
    });

    test('overallAccuracy 为整数 0 时也能正确解析', () {
      final json = {
        ...sampleJson,
        'stats': {
          ...sampleJson['stats'] as Map<String, dynamic>,
          'overallAccuracy': 0, // 整数
        },
      };
      final profile = UserProfile.fromJson(json);
      expect(profile.stats.overallAccuracy, 0.0);
    });

    test('role 为 admin 时正确解析', () {
      final json = {...sampleJson, 'role': 'admin'};
      final profile = UserProfile.fromJson(json);
      expect(profile.role, 'admin');
    });
  });

  group('UserProfileStats fromJson 测试', () {
    test('各字段正确映射', () {
      final json = {
        'totalSessions': 5,
        'totalAnswered': 50,
        'totalCorrect': 40,
        'overallAccuracy': 0.8,
        'knowledgeCardCount': 15,
        'wrongBookCount': 3,
      };

      final stats = UserProfileStats.fromJson(json);

      expect(stats.totalSessions, 5);
      expect(stats.wrongBookCount, 3);
    });
  });

  group('ProfileState copyWith 测试', () {
    test('更新 profile', () {
      const initial = ProfileState();
      final profile = UserProfile.fromJson({
        'id': 1,
        'username': 'u',
        'role': 'student',
        'createdAt': '2024-01-01',
        'stats': {
          'totalSessions': 0,
          'totalAnswered': 0,
          'totalCorrect': 0,
          'overallAccuracy': 0,
          'knowledgeCardCount': 0,
          'wrongBookCount': 0,
        }
      });

      final updated = initial.copyWith(profile: profile);

      expect(updated.profile?.username, 'u');
      expect(updated.isLoading, false);
    });

    test('error 字段更新不影响其他字段', () {
      const initial = ProfileState();
      final withError = initial.copyWith(error: '请求超时');

      expect(withError.error, '请求超时');
      expect(withError.profile, isNull);
    });
  });
}
