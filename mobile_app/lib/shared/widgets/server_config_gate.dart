import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../core/network/server_config.dart';
import 'server_address_form.dart';

/// 没有任何可用后端地址时，挡在整个 App 前面的「先配置服务器地址」页。
///
/// 三级回落（运行时设置 > 编译期 dart-define > 未配置）在
/// `ApiConstants.resolveBaseUrl` 里判定；这里只负责在未配置时给出明确的配置
/// 入口，而不是让各页面自己转圈或抛一屏 Dio 错误。
class ServerConfigGate extends ConsumerWidget {
  const ServerConfigGate({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(serverConfigProvider);
    if (state.isConfigured) {
      return child;
    }

    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: EdgeInsets.symmetric(horizontal: 24.w, vertical: 32.h),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('🔌', style: TextStyle(fontSize: 40.sp)),
                SizedBox(height: 12.h),
                Text(
                  '需要配置服务器地址',
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                SizedBox(height: 8.h),
                Text(
                  '当前安装包没有内置后端地址。填入后端地址后即可开始使用，之后也能在设置页修改。',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontSize: 14.sp,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                SizedBox(height: 24.h),
                ServerAddressForm(initialValue: state.effectiveBaseUrl),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
