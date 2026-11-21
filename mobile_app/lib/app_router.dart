import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';

import 'core/auth/token_util.dart';
import 'core/navigation/app_nav.dart';
import 'core/navigation/app_shell.dart';
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
import 'features/fenbi/presentation/fenbi_sync_screen.dart';
import 'features/chat/presentation/chat_screen.dart';
import 'features/wrong_book/presentation/wrong_book_screen.dart';
import 'features/recall/presentation/recall_session_screen.dart';
import 'features/profile/presentation/profile_screen.dart';
import 'features/textbook/presentation/textbook_list_screen.dart';
import 'features/textbook/presentation/textbook_detail_screen.dart';
import 'features/pricing/presentation/pricing_screen.dart';
import 'features/exam/presentation/exam_list_screen.dart';
import 'features/exam/presentation/exam_paper_screen.dart';
import 'features/exam/presentation/exam_session_screen.dart';
import 'features/exam/domain/exam_attempt.dart';
import 'features/agent_sets/presentation/agent_sets_screen.dart';
import 'features/agent_sets/presentation/agent_set_practice_screen.dart';

import 'features/practice/presentation/question_list_screen.dart';
import 'features/questions/presentation/draft_review_screen.dart';
import 'features/questions/presentation/drafts_screen.dart';
import 'features/questions/presentation/question_form_screen.dart';

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
///
/// **底部导航**：首页 / 练习 / 记忆卡 / 错题本 是 `StatefulShellRoute.indexedStack`
/// 的四个分支（见 `core/navigation/app_shell.dart`）。切 tab 走 `goBranch`，
/// 不堆栈；详情页仍由 `pushDetail` 盖在 shell 之上（返回即回到当前 tab）。
///
/// 为什么是工厂函数而不是全局单例：`appRouter` 是进程内单例，测试里再想要一份
/// 干净的路由（同一进程跑多条用例）只能重建。`main.dart` / 401 拦截器继续用
/// [appRouter]，测试用 [buildAppRouter]。
///
/// [initialLocation] 默认是启动页；测试直接落在某个 tab 时传具体路径，
/// 省掉「启动页延时跳转」这段与用例无关的等待。
GoRouter buildAppRouter({String initialLocation = '/'}) {
  return GoRouter(
    initialLocation: initialLocation,
    redirect: (context, state) async {
      final path = state.matchedLocation;
      const openRoutes = <String>{
        AppRoutes.splash,
        AppRoutes.login,
        AppRoutes.register,
      };
      final isOpen = openRoutes.contains(path);

      final token = await const FlutterSecureStorage().read(key: 'jwt_token');
      final loggedIn =
          token != null && token.isNotEmpty && !TokenUtil.isExpired(token);

      if (!loggedIn && !isOpen) {
        return AppRoutes.login;
      }
      if (loggedIn && (path == AppRoutes.login || path == AppRoutes.register)) {
        return AppRoutes.dashboard;
      }
      return null;
    },
    routes: [
      GoRoute(
        path: AppRoutes.splash,
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: AppRoutes.login,
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: AppRoutes.register,
        builder: (context, state) => const RegisterScreen(),
      ),
      // 四个高频入口：每个分支各有自己的导航栈，切 tab 不丢栈、也不堆栈。
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            AppShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.dashboard,
                builder: (context, state) => const DashboardScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.practiceSetup,
                builder: (context, state) => const PracticeSetupScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              // 记忆卡：屏内的「返回」「先回去」走 context.backOrHome()，
              // 在 tab 根页时即切回首页分支。
              GoRoute(
                path: AppRoutes.recall,
                builder: (context, state) => const RecallSessionScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.wrongBook,
                builder: (context, state) => const WrongBookScreen(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.questions,
        builder: (context, state) => const QuestionListScreen(),
        routes: [
          // 子路由写相对段：go_router 会把父路径前缀补上（`/questions/new`）。
          GoRoute(
            path: 'new',
            builder: (context, state) => const QuestionFormScreen(),
          ),
          GoRoute(
            path: ':id/edit',
            builder: (context, state) =>
                QuestionFormScreen(questionId: state.pathParameters['id']),
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.drafts,
        builder: (context, state) => const DraftsScreen(),
        routes: [
          GoRoute(
            path: ':id',
            builder: (context, state) =>
                DraftReviewScreen(draftId: state.pathParameters['id']!),
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.practice,
        builder: (context, state) {
          // 接收来自练习配置页 / 待办直开练 / 续练的参数
          final config = state.extra as Map<String, dynamic>?;
          return PracticeScreen(config: config);
        },
      ),
      GoRoute(
        path: AppRoutes.result,
        builder: (context, state) => const ResultScreen(),
      ),
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
      // 粉笔账号同步：设置页「数据管理」里的入口压在这条路由上。
      GoRoute(
        path: AppRoutes.fenbiSync,
        builder: (context, state) => const FenbiSyncScreen(),
      ),
      GoRoute(
        path: AppRoutes.chat,
        builder: (context, state) => const ChatScreen(),
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
      GoRoute(
        path: AppRoutes.exam,
        builder: (context, state) => const ExamListScreen(),
        routes: [
          GoRoute(
            path: 'paper/:id',
            builder: (context, state) => ExamPaperScreen(
              paperId: int.tryParse(state.pathParameters['id'] ?? '') ?? 0,
            ),
          ),
          GoRoute(
            path: 'session/:id',
            builder: (context, state) {
              // `extra` 可能是从预览页带过来的开场数据，也可能是深链接（null）；
              // 只接受确切类型，避免历史路由参数形状把整屏打崩。
              final extra = state.extra;
              return ExamSessionScreen(
                sessionId: state.pathParameters['id']!,
                initialAttempt: extra is ExamAttempt ? extra : null,
              );
            },
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.agentSets,
        builder: (context, state) => const AgentSetsScreen(),
        routes: [
          GoRoute(
            path: ':id',
            builder: (context, state) => AgentSetPracticeScreen(
              setId: int.tryParse(state.pathParameters['id'] ?? '') ?? 0,
            ),
          ),
        ],
      ),
    ],
  );
}

/// 进程内唯一的路由实例（`main.dart` 与 401 拦截器用它）。
final appRouter = buildAppRouter();
