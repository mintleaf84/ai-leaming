import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:skeletonizer/skeletonizer.dart';
import 'app_router.dart';
import 'core/diagnostics/error_hooks.dart';
import 'core/diagnostics/error_log.dart';
import 'core/network/server_config.dart';
import 'core/sync/sync_providers.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_provider.dart';
import 'features/agent_sets/presentation/agent_set_inbox_provider.dart';
import 'shared/widgets/contract_gate.dart';
import 'shared/widgets/server_config_gate.dart';

Future<void> main() async {
  // Binding 初始化与 runApp 必须在**同一个 zone** 里。
  //
  // 之前 `ensureInitialized()` 在 root zone、`runApp` 在 `runZonedGuarded` 的
  // 子 zone，Flutter 会报 "Zone mismatch"（框架在 runApp 时校验「当前 zone 是否
  // 与初始化 Binding 的 zone 一致」）。把初始化整体搬进 zone 后，initialize 期间
  // 与运行期的异常也都由同一个 handler 收口。
  runZonedGuarded(
    () async {
      WidgetsFlutterBinding.ensureInitialized();
      // 先装钩子再干别的：初始化期间的异常也要能落到本地诊断日志里。
      installGlobalErrorHandlers();
      // 读回上次运行留下的记录。load 内部吞掉所有异常，读不到就当空日志，绝不阻塞启动。
      await ErrorLog.instance.load();
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
    },
    // zone 内未捕获的异步异常（没 await 的 Future 抛错）不会走 FlutterError.onError，
    // 只有 runZonedGuarded 能兜住。
    (Object error, StackTrace stack) {
      ErrorLog.instance.add(error, stack, kind: 'zone');
    },
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
            //
            // 未读监听挂在两层闸**之内**：协商判定客户端太旧而拦下 App 时，
            // 再去拉题集列表只是多一条无意义的失败请求。
            child: ServerConfigGate(
              child: ContractGate(
                child: AgentSetInboxWatcher(
                  child: routedChild ?? const SizedBox.shrink(),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
