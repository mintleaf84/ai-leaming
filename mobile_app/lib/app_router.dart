import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';

import 'core/auth/token_util.dart';
import 'features/auth/presentation/splash_screen.dart';
import 'features/auth/presentation/register_screen.dart';
import 'features/auth/presentation/login_screen.dart';
import 'features/dashboard/presentation/dashboard_screen.dart';
import 'features/practice/presentation/practice_screen.dart';
import 'features/practice/presentation/practice_setup_screen.dart';
import 'features/practice/presentation/result_screen.dart';
import 'features/history/presentation/history_screen.dart';
import 'features/history/presentation/history_detail_screen.dart';
import 'features/knowledge/presentation/knowledge_screen.dart';
import 'features/mastery/presentation/mastery_screen.dart';
import 'features/settings/presentation/settings_screen.dart';
import 'features/chat/presentation/chat_screen.dart';
import 'features/wrong_book/presentation/wrong_book_screen.dart';
import 'features/profile/presentation/profile_screen.dart';
import 'features/textbook/presentation/textbook_list_screen.dart';
import 'features/textbook/presentation/textbook_detail_screen.dart';
import 'features/pricing/presentation/pricing_screen.dart';

import 'features/practice/presentation/question_list_screen.dart';

/// 未登录（或 token 过期）时一律回登录页；已登录时不再停在登录/注册页。
///
/// redirect 是 async 的：每次导航读一次 secure storage，代价可接受，
/// 换来的是"深链接 / 系统恢复栈"也不会绕过登录。
final appRouter = GoRouter(
  initialLocation: '/',
  redirect: (context, state) async {
    final path = state.matchedLocation;
    const openRoutes = <String>{'/', '/login', '/register'};
    final isOpen = openRoutes.contains(path);

    final token = await const FlutterSecureStorage().read(key: 'jwt_token');
    final loggedIn =
        token != null && token.isNotEmpty && !TokenUtil.isExpired(token);

    if (!loggedIn && !isOpen) {
      return '/login';
    }
    if (loggedIn && (path == '/login' || path == '/register')) {
      return '/dashboard';
    }
    return null;
  },
  routes: [
    GoRoute(path: '/', builder: (context, state) => const SplashScreen()),
    GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
    GoRoute(
      path: '/dashboard',
      builder: (context, state) => const DashboardScreen(),
    ),
    GoRoute(
      path: '/register',
      builder: (context, state) => const RegisterScreen(),
    ),
    GoRoute(
      path: '/questions',
      builder: (context, state) => const QuestionListScreen(),
    ),
    GoRoute(
      path: '/practice/setup',
      builder: (context, state) => const PracticeSetupScreen(),
    ),
    GoRoute(
      path: '/practice',
      builder: (context, state) {
        // 接收来自练习配置页的参数
        final config = state.extra as Map<String, dynamic>?;
        return PracticeScreen(config: config);
      },
    ),
    GoRoute(path: '/result', builder: (context, state) => const ResultScreen()),
    GoRoute(
      path: '/history',
      builder: (context, state) => const HistoryScreen(),
      routes: [
        GoRoute(
          path: ':id',
          builder: (context, state) {
            final id = state.pathParameters['id']!;
            return HistoryDetailScreen(sessionId: id);
          },
        ),
      ],
    ),
    GoRoute(
      path: '/knowledge',
      builder: (context, state) => const KnowledgeScreen(),
    ),
    GoRoute(
      path: '/mastery',
      builder: (context, state) => const MasteryScreen(),
    ),
    GoRoute(
      path: '/settings',
      builder: (context, state) => const SettingsScreen(),
    ),
    GoRoute(path: '/chat', builder: (context, state) => const ChatScreen()),
    GoRoute(
      path: '/wrong-book',
      builder: (context, state) => const WrongBookScreen(),
    ),
    GoRoute(
      path: '/profile',
      builder: (context, state) => const ProfileScreen(),
    ),
    GoRoute(
      path: '/pricing',
      builder: (context, state) => const PricingScreen(),
    ),
    GoRoute(
      path: '/textbooks',
      builder: (context, state) => const TextbookListScreen(),
      routes: [
        GoRoute(
          path: ':id',
          builder: (context, state) {
            final id = int.parse(state.pathParameters['id']!);
            return TextbookDetailScreen(textbookId: id);
          },
        ),
      ],
    ),
  ],
);
