import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';

import 'core/auth/token_util.dart';
import 'core/navigation/app_nav.dart';
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
/// 路由表 —— **导航模型见 `core/navigation/app_nav.dart`**。
///
/// 三条规则（别在页面里再直接调 `context.go` / `context.pop`）：
///
/// 1. 进入下一层（详情页、流程页）用 `context.pushDetail(...)` —— 有返回栈；
/// 2. 替换当前位置（登录成功、练习结束去结果页、退出登录）用 `context.replace(...)`；
/// 3. 返回用 `context.backOrHome()` —— 栈里没有上一层时回首页，不会"点了没反应"。
///
/// 路径常量统一放在 [AppRoutes]，页面里不要再写字符串字面量。
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
    GoRoute(path: AppRoutes.splash, builder: (context, state) => const SplashScreen()),
    GoRoute(path: AppRoutes.login, builder: (context, state) => const LoginScreen()),
    GoRoute(
      path: AppRoutes.dashboard,
      builder: (context, state) => const DashboardScreen(),
    ),
    GoRoute(
      path: AppRoutes.register,
      builder: (context, state) => const RegisterScreen(),
    ),
    GoRoute(
      path: AppRoutes.questions,
      builder: (context, state) => const QuestionListScreen(),
    ),
    GoRoute(
      path: AppRoutes.practiceSetup,
      builder: (context, state) => const PracticeSetupScreen(),
    ),
    GoRoute(
      path: AppRoutes.practice,
      builder: (context, state) {
        // 接收来自练习配置页的参数
        final config = state.extra as Map<String, dynamic>?;
        return PracticeScreen(config: config);
      },
    ),
    GoRoute(path: AppRoutes.result, builder: (context, state) => const ResultScreen()),
    GoRoute(
      path: AppRoutes.history,
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
      path: AppRoutes.knowledge,
      builder: (context, state) => const KnowledgeScreen(),
    ),
    GoRoute(
      path: AppRoutes.mastery,
      builder: (context, state) => const MasteryScreen(),
    ),
    GoRoute(
      path: AppRoutes.settings,
      builder: (context, state) => const SettingsScreen(),
    ),
    GoRoute(path: AppRoutes.chat, builder: (context, state) => const ChatScreen()),
    GoRoute(
      path: AppRoutes.wrongBook,
      builder: (context, state) => const WrongBookScreen(),
    ),
    GoRoute(
      path: AppRoutes.profile,
      builder: (context, state) => const ProfileScreen(),
    ),
    GoRoute(
      path: AppRoutes.pricing,
      builder: (context, state) => const PricingScreen(),
    ),
    GoRoute(
      path: AppRoutes.textbooks,
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
