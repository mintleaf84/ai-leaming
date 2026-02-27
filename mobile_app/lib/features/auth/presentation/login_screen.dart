import 'package:flutter/material.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:dio/dio.dart';
import 'auth_provider.dart';

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
        context.go('/dashboard');
      } else if (next is AsyncError) {
        String errorMessage = '发生未知错误，请稍后重试';
        final error = next.error;
        if (error is DioException) {
          if (error.type == DioExceptionType.connectionTimeout ||
              error.type == DioExceptionType.receiveTimeout) {
            errorMessage = '网络连接超时，请检查您的网络';
          } else if (error.response?.statusCode == 401) {
            errorMessage = '账号或密码错误';
          } else if (error.type == DioExceptionType.connectionError) {
            errorMessage = '网络开了小差，请检查网络设置';
          } else {
            errorMessage = '服务器打盹了 (${error.response?.statusCode ?? "未知"})';
          }
        } else {
          errorMessage = error.toString();
        }

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(errorMessage),
            backgroundColor: const Color(0xFFEB5757),
          ),
        );
      }
    });

    return Scaffold(
      backgroundColor: Colors.white,
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
                            color: const Color(0xFF1A1A1A),
                            fontFamily: 'Inter',
                          ),
                        ),
                        SizedBox(height: 40.h),

                        // Form
                        _buildInputGroup(
                          '邮箱/用户名',
                          Icons.person_outline,
                          usernameController,
                          hint: '邮箱/用户名',
                        ),
                        SizedBox(height: 16.h),
                        _buildInputGroup(
                          '密码',
                          Icons.lock_outline,
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
                            onPressed: () {},
                            child: Text(
                              '忘记密码？',
                              style: TextStyle(
                                color: Colors.grey,
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
                              backgroundColor: const Color(0xFF135BEC),
                              foregroundColor: Colors.white,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8.r),
                              ),
                            ),
                            child: authState.isLoading
                                ? SizedBox(
                                    width: 20.w,
                                    height: 20.h,
                                    child: const CircularProgressIndicator(
                                      color: Colors.white,
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
                                      Icon(Icons.arrow_forward, size: 18.sp),
                                    ],
                                  ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),

              // Bottom Section: Divider, Social, Register
              Padding(
                padding: EdgeInsets.only(bottom: 24.h),
                child: Column(
                  children: [
                    // Divider
                    Row(
                      children: [
                        Expanded(child: Divider(color: Colors.grey[200])),
                        Padding(
                          padding: EdgeInsets.symmetric(horizontal: 16.w),
                          child: Text(
                            '或者',
                            style: TextStyle(
                              color: Colors.grey[400],
                              fontSize: 12.sp,
                            ),
                          ),
                        ),
                        Expanded(child: Divider(color: Colors.grey[200])),
                      ],
                    ),

                    SizedBox(height: 24.h),

                    // Social Logins
                    Row(
                      children: [
                        Expanded(
                          child: _buildSocialButton('Apple', Icons.apple),
                        ),
                        SizedBox(width: 12.w),
                        Expanded(
                          child: _buildSocialButton(
                            '微信',
                            Icons.chat_bubble_outline,
                            color: const Color(0xFF07C160),
                          ),
                        ),
                      ],
                    ),

                    SizedBox(height: 32.h),

                    // Register Link
                    Center(
                      child: GestureDetector(
                        onTap: () => context.go('/register'),
                        child: RichText(
                          text: TextSpan(
                            text: '还没有账号？ ',
                            style: TextStyle(
                              color: Colors.grey,
                              fontSize: 13.sp,
                            ),
                            children: const [
                              TextSpan(
                                text: '立即注册',
                                style: TextStyle(
                                  color: Color(0xFF135BEC),
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
        color: Colors.white,
        borderRadius: BorderRadius.circular(8.r),
        border: Border.all(color: Colors.grey[200]!),
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
          Icon(icon, color: Colors.grey[400], size: 20.sp),
          SizedBox(width: 12.w),
          Expanded(
            child: TextField(
              controller: controller,
              obscureText: obscureText ?? isPassword,
              showCursor: true,
              decoration: InputDecoration(
                border: InputBorder.none,
                hintText: hint ?? label,
                hintStyle: TextStyle(color: Colors.grey[400], fontSize: 16.sp),
                contentPadding: isPassword
                    ? EdgeInsets.only(top: 14.h)
                    : EdgeInsets.zero,
                isDense: true,
                suffixIcon: isPassword
                    ? IconButton(
                        icon: Icon(
                          (obscureText ?? true)
                              ? Icons.visibility_off
                              : Icons.visibility,
                          color: Colors.grey[400],
                          size: 20.sp,
                        ),
                        onPressed: onToggleVisibility,
                      )
                    : null,
              ),
              style: TextStyle(fontSize: 16.sp, color: const Color(0xFF1A1A1A)),
              cursorColor: const Color(0xFF135BEC),
            ),
          ),
          if (!isPassword) SizedBox(width: 14.w),
        ],
      ),
    );
  }

  Widget _buildSocialButton(String label, IconData icon, {Color? color}) {
    return Container(
      height: 44.h,
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey[200]!),
        color: Colors.white,
        borderRadius: BorderRadius.circular(8.r),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 20.sp, color: color ?? Colors.black),
          SizedBox(width: 8.w),
          Text(
            label,
            style: TextStyle(
              fontSize: 14.sp,
              fontWeight: FontWeight.normal,
              color: const Color(0xFF37352F), // Notion-like text color
            ),
          ),
        ],
      ),
    );
  }
}
