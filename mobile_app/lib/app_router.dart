import 'package:go_router/go_router.dart';
import 'presentation/screens/register_screen.dart';
import 'presentation/screens/login_screen.dart';
import 'presentation/screens/dashboard_screen.dart';
import 'presentation/screens/practice_screen.dart';
import 'presentation/screens/result_screen.dart';
import 'presentation/screens/history_screen.dart';
import 'presentation/screens/history_detail_screen.dart';
import 'presentation/screens/knowledge_screen.dart';
import 'presentation/screens/mastery_screen.dart';
import 'presentation/screens/settings_screen.dart';
import 'presentation/screens/chat_screen.dart';

final appRouter = GoRouter(
  initialLocation: '/login',
  routes: [
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
      path: '/practice',
      builder: (context, state) => const PracticeScreen(),
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
  ],
);
