import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'app_router.dart';
import 'core/network/server_config.dart';
import 'core/sync/sync_providers.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_provider.dart';
import 'shared/widgets/server_config_gate.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // dioProvider 是同步构建的，持久化的服务器地址必须在 runApp 之前就绪。
  final storedBaseUrl = await _readStoredBaseUrl();
  runApp(
    ProviderScope(
      overrides: [
        initialServerBaseUrlProvider.overrideWithValue(storedBaseUrl),
      ],
      child: const MyApp(),
    ),
  );
}

/// 启动前读一次已保存的服务器地址。
///
/// 读失败（安全存储不可用等）按「未配置」处理并留日志：App 仍能启动，用户可以在
/// 启动页重新填写，而不是白屏。
Future<String?> _readStoredBaseUrl() async {
  try {
    return await const SecureServerBaseUrlStore().read();
  } catch (error) {
    debugPrint('[ServerConfig] 读取已保存的服务器地址失败: $error');
    return null;
  }
}

class MyApp extends ConsumerWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);
    final isServerConfigured = ref.watch(serverConfigProvider).isConfigured;
    if (isServerConfigured) {
      // 读一次同步服务：启动即注册网络监听并补交历史遗留的离线作答。
      // 未配置地址时不启动，避免无意义的请求与日志噪音。
      ref.watch(syncServiceProvider);
    }

    return ScreenUtilInit(
      designSize: const Size(390, 884),
      minTextAdapt: true,
      splitScreenMode: true,
      builder: (context, child) {
        return MaterialApp.router(
          title: 'AI Learning',
          theme: AppTheme.lightTheme,
          darkTheme: AppTheme.darkTheme,
          themeMode: themeMode,
          routerConfig: appRouter,
          // 没有任何可用后端地址时停在这里，而不是让各页面各自无限加载。
          builder: (context, routedChild) =>
              ServerConfigGate(child: routedChild ?? const SizedBox.shrink()),
        );
      },
    );
  }
}
