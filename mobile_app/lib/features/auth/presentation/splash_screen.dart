import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../../../core/navigation/app_nav.dart';
import '../../../core/auth/token_util.dart';
import '../../../core/theme/app_colors.dart';
import '../data/auth_repository_impl.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _checkLoginStatus();
  }

  Future<void> _checkLoginStatus() async {
    // 少量延迟以保证视觉过渡不会太突兀（可选）
    await Future.delayed(const Duration(milliseconds: 500));

    if (!mounted) return;

    try {
      final repo = ref.read(authRepositoryProvider);
      final token = await repo.getToken();

      final hasToken = token != null && token.isNotEmpty;
      final hasValidToken = hasToken && !TokenUtil.isExpired(token);
      if (hasToken && !hasValidToken) {
        // 已过期：清掉残留，避免带着废 token 进主界面后处处 401
        await repo.logout();
      }
      if (!mounted) return;
      context.replace(hasValidToken ? AppRoutes.dashboard : AppRoutes.login);
    } catch (e) {
      if (mounted) {
        context.replace(AppRoutes.login);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.colors.background,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('✨', style: TextStyle(fontSize: 64.sp)),
            SizedBox(height: 24.h),
            CircularProgressIndicator(color: context.colors.accent),
          ],
        ),
      ),
    );
  }
}
