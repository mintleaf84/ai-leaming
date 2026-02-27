class ApiConstants {
  // Use 10.0.2.2 for Android Emulator to access localhost
  // Use localhost for iOS Simulator
  // Use actual IP for physical device / Windows Desktop apps
  // static const String baseUrl = 'http://192.168.0.101:3000/api';
  static const String baseUrl = 'http://localhost:3000/api';

  static const int connectTimeout = 10000; // 10秒
  static const int receiveTimeout = 15000; // 15秒（AI 分析等长耗时接口需要）

  // Endpoints
  static const String login = '/auth/login';
  static const String questions = '/questions';
  static const String practiceSession = '/practice/session';
  static const String history = '/history';
  static const String knowledgeCards = '/knowledge/cards';
  static const String masteryTree = '/mastery/tree';
  static const String masteryStats = '/mastery/stats';
  static const String firstPrinciples = '/practice/first-principles';
}
