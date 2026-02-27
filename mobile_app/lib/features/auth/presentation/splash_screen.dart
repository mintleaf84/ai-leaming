import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
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

      if (mounted) {
        if (token != null && token.isNotEmpty) {
          // Token 存在，跳过登录页
          context.go('/dashboard');
        } else {
          // 无 Token，正常转入登录页面
          context.go('/login');
        }
      }
    } catch (e) {
      if (mounted) {
        context.go('/login');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('✨', style: TextStyle(fontSize: 64.sp)),
            SizedBox(height: 24.h),
            const CircularProgressIndicator(color: Color(0xFF135BEC)),
          ],
        ),
      ),
    );
  }
}
