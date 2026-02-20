import 'package:flutter/material.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'auth_provider.dart';

class RegisterScreen extends HookConsumerWidget {
  const RegisterScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final usernameController = useTextEditingController();
    final emailController = useTextEditingController();
    final passwordController = useTextEditingController();
    final isPasswordVisible = useState(false);

    final authState = ref.watch(authControllerProvider);

    // Listen to Auth State changes for navigation
    ref.listen<AsyncValue<void>>(authControllerProvider, (previous, next) {
      if (next is AsyncData) {
        context.go('/dashboard');
      } else if (next is AsyncError) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: ${next.error}')));
      }
    });

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: 32.w),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Top Back Button (Not Scrollable, Pinned to Top)
              IconButton(
                onPressed: () => context.pop(),
                icon: const Icon(Icons.arrow_back),
                style: IconButton.styleFrom(
                  backgroundColor: Colors.grey[100],
                  padding: EdgeInsets.all(12.w),
                ),
              ),

              // Centered Content (Scrollable)
              Expanded(
                child: Center(
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Header
                        Center(
                          child: Text('👋', style: TextStyle(fontSize: 64.sp)),
                        ),
                        SizedBox(height: 16.h),
                        Center(
                          child: Text(
                            '加入学习空间',
                            style: TextStyle(
                              fontSize: 28.sp,
                              fontWeight: FontWeight.bold,
                              color: const Color(0xFF1A1A1A),
                              fontFamily: 'Inter',
                            ),
                          ),
                        ),
                        SizedBox(height: 8.h),
                        Center(
                          child: Text(
                            '开启你的极简学习之旅',
                            style: TextStyle(
                              fontSize: 14.sp,
                              color: Colors.grey,
                            ),
                          ),
                        ),
                        SizedBox(height: 40.h),

                        // Form
                        _buildInputGroup(
                          '用户名',
                          Icons.person_outline,
                          usernameController,
                          hint: '请输入用户名',
                        ),
                        SizedBox(height: 20.h),
                        _buildInputGroup(
                          '电子邮箱',
                          Icons.mail_outline,
                          emailController,
                          hint: 'example@email.com',
                        ),
                        SizedBox(height: 20.h),
                        _buildInputGroup(
                          '密码',
                          Icons.lock_outline,
                          passwordController,
                          isPassword: true,
                          isVisible: isPasswordVisible.value,
                          onToggleVisibility: () => isPasswordVisible.value =
                              !isPasswordVisible.value,
                          hint: '设置密码',
                        ),

                        SizedBox(height: 40.h),

                        // Submit Button
                        SizedBox(
                          width: double.infinity,
                          height: 48.h,
                          child: FilledButton(
                            onPressed: authState.isLoading
                                ? null
                                : () {
                                    // Start registration
                                    ref
                                        .read(authControllerProvider.notifier)
                                        .register(
                                          usernameController.text,
                                          passwordController.text,
                                        );
                                  },
                            style: FilledButton.styleFrom(
                              backgroundColor: const Color(0xFF1A1A1A),
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
                                        '创建账号',
                                        style: TextStyle(
                                          fontSize: 15.sp,
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                      SizedBox(width: 8.w),
                                      Icon(Icons.arrow_forward, size: 18.sp),
                                    ],
                                  ),
                          ),
                        ),

                        // Footer
                        SizedBox(height: 20.h),
                        Center(
                          child: GestureDetector(
                            onTap: () => context.go('/login'),
                            child: RichText(
                              text: TextSpan(
                                text: '已有账号？ ',
                                style: TextStyle(
                                  color: Colors.grey,
                                  fontSize: 13.sp,
                                ),
                                children: const [
                                  TextSpan(
                                    text: '立即登录',
                                    style: TextStyle(
                                      color: Color(0xFF1A1A1A),
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
                ),
              ),

              // Bottom Decorative Line (Pinned to bottom via Column layout)
              Padding(
                padding: EdgeInsets.only(bottom: 16.h),
                child: Center(
                  child: Container(
                    width: 48.w,
                    height: 4.h,
                    decoration: BoxDecoration(
                      color: Colors.grey[300],
                      borderRadius: BorderRadius.circular(2.r),
                    ),
                  ),
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
    bool isVisible = false,
    VoidCallback? onToggleVisibility,
    String? hint,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Semantic label for accessibility (hidden visually to match reference)
        Semantics(label: label, child: const SizedBox.shrink()),
        Container(
          height: 48.h,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(8.r),
            border: Border.all(color: Colors.grey[200]!),
            // Removed BoxShadow to match the flat Notion reference
          ),
          child: Row(
            children: [
              SizedBox(width: 14.w),
              Icon(icon, color: Colors.grey[400], size: 20.sp),
              SizedBox(width: 12.w),
              Expanded(
                child: TextField(
                  controller: controller,
                  obscureText: isPassword && !isVisible,
                  decoration: InputDecoration(
                    border: InputBorder.none,
                    hintText: hint ?? label, // Use hint as the main label
                    hintStyle: TextStyle(
                      color: Colors.grey[400],
                      fontSize: 15.sp,
                    ),
                    contentPadding: EdgeInsets.zero,
                    isDense: true,
                  ),
                  style: TextStyle(
                    fontSize: 16.sp,
                    color: const Color(0xFF1A1A1A),
                  ),
                  cursorColor: const Color(0xFF135BEC),
                ),
              ),
              if (isPassword)
                IconButton(
                  icon: Icon(
                    isVisible ? Icons.visibility : Icons.visibility_off,
                    color: Colors.grey[400],
                    size: 20.sp,
                  ),
                  onPressed: onToggleVisibility,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  splashRadius: 20.r,
                )
              else
                SizedBox(width: 14.w),
              if (isPassword) SizedBox(width: 14.w),
            ],
          ),
        ),
      ],
    );
  }
}
