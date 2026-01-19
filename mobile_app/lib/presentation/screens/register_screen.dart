import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';

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
          padding: const EdgeInsets.symmetric(horizontal: 32.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Back Button
              IconButton(
                onPressed: () => context.pop(),
                icon: const Icon(Icons.arrow_back),
                style: IconButton.styleFrom(
                  backgroundColor: Colors.grey[100],
                  padding: const EdgeInsets.all(12),
                ),
              ),
              const SizedBox(height: 40),

              // Header
              const Center(child: Text('👋', style: TextStyle(fontSize: 64))),
              const SizedBox(height: 16),
              const Center(
                child: Text(
                  '加入学习空间',
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF1A1A1A),
                    fontFamily: 'Inter',
                  ),
                ),
              ),
              const SizedBox(height: 8),
              const Center(
                child: Text(
                  '开启你的极简学习之旅',
                  style: TextStyle(fontSize: 14, color: Colors.grey),
                ),
              ),
              const SizedBox(height: 40),

              // Form
              _buildInputGroup(
                '用户名',
                Icons.person_outline,
                usernameController,
                hint: '请输入用户名',
              ),
              const SizedBox(height: 20),
              _buildInputGroup(
                '电子邮箱',
                Icons.mail_outline,
                emailController,
                hint: 'example@email.com',
              ), // Email not sent to backend yet
              const SizedBox(height: 20),
              _buildInputGroup(
                '密码',
                Icons.lock_outline,
                passwordController,
                isPassword: true,
                isVisible: isPasswordVisible.value,
                onToggleVisibility: () =>
                    isPasswordVisible.value = !isPasswordVisible.value,
                hint: '设置密码',
              ),

              const SizedBox(height: 40),

              // Submit Button
              SizedBox(
                width: double.infinity,
                height: 48,
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
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: authState.isLoading
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2,
                          ),
                        )
                      : const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              '创建账号',
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            SizedBox(width: 8),
                            Icon(Icons.arrow_forward, size: 18),
                          ],
                        ),
                ),
              ),

              // Footer
              const SizedBox(height: 20),
              Center(
                child: GestureDetector(
                  onTap: () => context.go('/login'),
                  child: RichText(
                    text: const TextSpan(
                      text: '已有账号？ ',
                      style: TextStyle(color: Colors.grey, fontSize: 13),
                      children: [
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
              const Spacer(),
              // Notion-style bottom line
              Center(
                child: Container(
                  width: 48,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey[300],
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
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
        Text(
          label,
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: Colors.grey,
          ),
        ),
        const SizedBox(height: 6),
        Container(
          height: 48,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.grey[300]!),
          ),
          child: Row(
            children: [
              const SizedBox(width: 14),
              Icon(icon, color: Colors.grey[400], size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: TextField(
                  controller: controller,
                  obscureText: isPassword && !isVisible,
                  decoration: InputDecoration(
                    border: InputBorder.none,
                    hintText: hint,
                    hintStyle: TextStyle(color: Colors.grey[400], fontSize: 15),
                    contentPadding: const EdgeInsets.symmetric(
                      vertical: 0,
                    ), // Centering
                  ),
                  style: const TextStyle(
                    fontSize: 15,
                    color: Color(0xFF1A1A1A),
                  ),
                ),
              ),
              if (isPassword)
                IconButton(
                  icon: Icon(
                    isVisible ? Icons.visibility : Icons.visibility_off,
                    color: Colors.grey[400],
                    size: 20,
                  ),
                  onPressed: onToggleVisibility,
                )
              else
                const SizedBox(width: 14),
            ],
          ),
        ),
      ],
    );
  }
}
