import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:skeletonizer/skeletonizer.dart';
import 'app_router.dart';
import 'core/network/server_config.dart';
import 'core/sync/sync_providers.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_provider.dart';
import 'shared/widgets/contract_gate.dart';
import 'shared/widgets/server_config_gate.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // dioProvider 是同步构建的，持久化的服务器地址必须在 runApp 之前就绪。
  final storedBaseUrl = await readInitialServerBaseUrl(
    const SecureServerBaseUrlStore(),
  );
  runApp(
    ProviderScope(
      overrides: [
        initialServerBaseUrlProvider.overrideWithValue(storedBaseUrl),
      ],
      child: const MyApp(),
    ),
  );
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
          //
          // SkeletonizerConfig 统一给所有骨架屏定"跟随当前主题明暗"的着色；
          // 不配的话它按平台亮度判断，App 内手动切到暗色时骨架会仍是浅色。
          builder: (context, routedChild) => SkeletonizerConfig(
            data: SkeletonizerConfigData(
              brightness: Theme.of(context).brightness,
            ),
            // 两层闸的先后有语义：先确认「有服务器地址」，再拿这个地址问
            // `/meta` 做版本协商。没有地址就协商，只会得到一个必然失败的请求。
            child: ServerConfigGate(
              child: ContractGate(
                child: routedChild ?? const SizedBox.shrink(),
              ),
            ),
          ),
        );
      },
    );
  }
}
