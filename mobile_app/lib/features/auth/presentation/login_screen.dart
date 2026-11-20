import 'package:flutter/material.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:dio/dio.dart';
import '../../../core/navigation/app_nav.dart';
import '../../../core/error/user_message.dart';
import 'auth_provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_icons.dart';

class LoginScreen extends HookConsumerWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final usernameController = useTextEditingController();
    final passwordController = useTextEditingController();
    final isPasswordVisible = useState(false);
    final authState = ref.watch(authControllerProvider);

    // Listen to Auth State changes for navigation & error handling
    ref.listen<AsyncValue<void>>(authControllerProvider, (previous, next) {
      if (next is AsyncData) {
        context.replace(AppRoutes.dashboard);
      } else if (next is AsyncError) {
        final error = next.error;
        // 登录页的 401 是「账号或密码错误」，不是通用的「登录已过期」，
        // 所以这一条在统一文案之前单独拦下（审计 #24 的唯一例外）。
        final String errorMessage =
            error is DioException && error.response?.statusCode == 401
            ? '账号或密码错误'
            : userMessageOf(error);
        debugPrint('[Login] 登录失败: $error');

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(errorMessage),
            backgroundColor: context.colors.error,
          ),
        );
      }
    });

    return Scaffold(
      backgroundColor: context.colors.background,
      body: SafeArea(
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: 32.w),
          child: Column(
            children: [
              Expanded(
                child: Center(
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        // Hero Icon
                        Text('🗝️', style: TextStyle(fontSize: 64.sp)),
                        SizedBox(height: 24.h),

                        // Headline
                        Text(
                          '欢迎回来',
                          style: TextStyle(
                            fontSize: 28.sp,
                            fontWeight: FontWeight.bold,
                            color: context.colors.text,
                          ),
                        ),
                        SizedBox(height: 40.h),

                        // Form
                        _buildInputGroup(
                          context,
                          '邮箱/用户名',
                          AppIcons.personOutline,
                          usernameController,
                          hint: '邮箱/用户名',
                        ),
                        SizedBox(height: 16.h),
                        _buildInputGroup(
                          context,
                          '密码',
                          AppIcons.lockOutline,
                          passwordController,
                          isPassword: true,
                          obscureText: !isPasswordVisible.value,
                          onToggleVisibility: () {
                            isPasswordVisible.value = !isPasswordVisible.value;
                          },
                          hint: '密码',
                        ),

                        // Forgot Password
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton(
                            // 后端目前没有找回密码接口（/api/auth 只有
                            // login / register / logout），点进新页面只会再
                            // 造一个死页面，所以这里如实告知，不做假跳转。
                            onPressed: () {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text('暂未开放：请联系管理员重置密码'),
                                ),
                              );
                            },
                            style: TextButton.styleFrom(
                              // 13sp 字只有约 17dp 高，撑到 44dp 命中区。
                              minimumSize: const Size(44, 44),
                              padding: EdgeInsets.symmetric(horizontal: 8.w),
                            ),
                            child: Text(
                              '忘记密码？',
                              style: TextStyle(
                                color: context.colors.textSecondary,
                                fontSize: 13.sp,
                              ),
                            ),
                          ),
                        ),

                        SizedBox(height: 16.h),

                        // Submit Button
                        SizedBox(
                          width: double.infinity,
                          height: 48.h,
                          child: FilledButton(
                            onPressed: authState.isLoading
                                ? null
                                : () {
                                    final username = usernameController.text
                                        .trim();
                                    final password = passwordController.text
                                        .trim();

                                    if (username.isEmpty) {
                                      ScaffoldMessenger.of(
                                        context,
                                      ).showSnackBar(
                                        const SnackBar(
                                          content: Text('请输入邮箱或用户名'),
                                        ),
                                      );
                                      return;
                                    }
                                    if (password.isEmpty) {
                                      ScaffoldMessenger.of(
                                        context,
                                      ).showSnackBar(
                                        const SnackBar(content: Text('请输入密码')),
                                      );
                                      return;
                                    }

                                    ref
                                        .read(authControllerProvider.notifier)
                                        .login(username, password);
                                  },
                            style: FilledButton.styleFrom(
                              backgroundColor: context.colors.accent,
                              foregroundColor: context.colors.onAccent,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8.r),
                              ),
                            ),
                            child: authState.isLoading
                                ? SizedBox(
                                    width: 20.w,
                                    height: 20.h,
                                    child: CircularProgressIndicator(
                                      color: context.colors.onAccent,
                                      strokeWidth: 2,
                                    ),
                                  )
                                : Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Text(
                                        '登录',
                                        style: TextStyle(
                                          fontSize: 16.sp,
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                      SizedBox(width: 8.w),
                                      Icon(AppIcons.arrowForward, size: 18.sp),
                                    ],
                                  ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),

              // Bottom Section: Register
              Padding(
                padding: EdgeInsets.only(bottom: 24.h),
                child: Column(
                  children: [
                    Text(
                      '更多登录方式即将开放',
                      style: TextStyle(
                        color: context.colors.textSecondary,
                        fontSize: 12.sp,
                      ),
                    ),

                    SizedBox(height: 8.h),

                    // Register Link
                    Center(
                      child: TextButton(
                        onPressed: () => context.replace(AppRoutes.register),
                        style: TextButton.styleFrom(
                          // 13sp 富文本只有约 17dp 高，撑到 44dp 命中区。
                          minimumSize: const Size(44, 44),
                          padding: EdgeInsets.symmetric(horizontal: 8.w),
                        ),
                        child: RichText(
                          text: TextSpan(
                            text: '还没有账号？ ',
                            style: TextStyle(
                              color: context.colors.textSecondary,
                              fontSize: 13.sp,
                            ),
                            children: [
                              TextSpan(
                                text: '立即注册',
                                style: TextStyle(
                                  color: context.colors.accent,
                                  fontWeight: FontWeight.w500,
                                  decoration: TextDecoration.underline,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildInputGroup(
    BuildContext context,
    String label,
    IconData icon,
    TextEditingController controller, {
    bool isPassword = false,
    bool? obscureText,
    VoidCallback? onToggleVisibility,
    String? hint,
  }) {
    return Container(
      height: 52.h,
      decoration: BoxDecoration(
        color: context.colors.surface,
        borderRadius: BorderRadius.circular(8.r),
        border: Border.all(color: context.colors.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 2.r,
            offset: Offset(0, 1.h),
          ),
        ],
      ),
      child: Row(
        children: [
          SizedBox(width: 14.w),
          Icon(icon, color: context.colors.textSecondary, size: 20.sp),
          SizedBox(width: 12.w),
          Expanded(
            child: TextField(
              controller: controller,
              obscureText: obscureText ?? isPassword,
              showCursor: true,
              decoration: InputDecoration(
                border: InputBorder.none,
                hintText: hint ?? label,
                hintStyle: TextStyle(
                  color: context.colors.textSecondary,
                  fontSize: 16.sp,
                ),
                contentPadding: isPassword
                    ? EdgeInsets.only(top: 14.h)
                    : EdgeInsets.zero,
                isDense: true,
                suffixIcon: isPassword
                    ? IconButton(
                      tooltip: (obscureText ?? true) ? '显示密码' : '隐藏密码',
                        icon: Icon(
                          (obscureText ?? true)
                              ? AppIcons.visibilityOff
                              : AppIcons.visibility,
                          color: context.colors.textSecondary,
                          size: 20.sp,
                        ),
                        onPressed: onToggleVisibility,
                      )
                    : null,
              ),
              style: TextStyle(fontSize: 16.sp, color: context.colors.text),
              cursorColor: context.colors.accent,
            ),
          ),
          if (!isPassword) SizedBox(width: 14.w),
        ],
      ),
    );
  }
}
