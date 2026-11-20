import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/diagnostics/error_log.dart';
import '../../../../core/navigation/app_nav.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../auth/presentation/auth_provider.dart';

/// 设置页的弹窗 / 底部选择器。
///
/// 为什么是函数而不是 `StatelessWidget`：这些弹窗必须用**屏的** context 做
/// 路由与提示（例如诊断日志复制后的 SnackBar、退出登录后 `replace` 到登录页），
/// 用弹窗自己的 context 会随弹窗一起失效。所以这里把 context / ref 显式传入，
/// 其余代码与 `settings_screen.dart` 里逐字一致。

void _snack(BuildContext context, String message) {
  ScaffoldMessenger.of(
    context,
  ).showSnackBar(SnackBar(content: Text(message)));
}

void showDiagnosticsDialog(BuildContext context, WidgetRef ref) {
  final log = ref.read(errorLogProvider);
  showDialog(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('诊断日志'),
      content: SizedBox(
        width: double.maxFinite,
        child: ListenableBuilder(
          listenable: log,
          builder: (context, _) {
            final entries = log.entries;
            if (entries.isEmpty) {
              return const Text('暂无记录');
            }
            // 只展示最近 20 条：弹窗是用来「快速看一眼 + 复制」的，
            // 完整内容交给「复制全部」。
            final recent = entries.take(20).map(log.formatEntry).join('\n');
            return SingleChildScrollView(
              child: Text(
                recent,
                style: TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 11.sp,
                  height: 1.4,
                  color: context.colors.textSecondary,
                ),
              ),
            );
          },
        ),
      ),
      actions: [
        TextButton(
          onPressed: () async {
            await Clipboard.setData(ClipboardData(text: log.exportText()));
            if (!context.mounted) return;
            _snack(context, '诊断日志已复制到剪贴板');
          },
          child: const Text('复制全部'),
        ),
        TextButton(
          onPressed: () async {
            await log.clear();
          },
          child: Text('清空', style: TextStyle(color: context.colors.error)),
        ),
      ],
    ),
  );
}

void showClearCacheDialog(BuildContext context) {
  showDialog(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('清理缓存'),
      content: const Text('确定要清理本地缓存吗？这不会影响您的学习进度，但重新加载图片等资源可能需要一些时间。'),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext),
          child: const Text('取消'),
        ),
        TextButton(
          onPressed: () {
            Navigator.pop(dialogContext);
            _snack(context, '缓存已清理完毕');
          },
          child: const Text('确定'),
        ),
      ],
    ),
  );
}

void showFeedbackDialog(BuildContext context) {
  final controller = TextEditingController();
  showDialog(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('反馈建议'),
      content: TextField(
        controller: controller,
        maxLines: 4,
        decoration: const InputDecoration(
          hintText: '描述您遇到的问题或建议...',
          border: OutlineInputBorder(),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext),
          child: const Text('取消'),
        ),
        TextButton(
          onPressed: () {
            if (controller.text.isNotEmpty) {
              Navigator.pop(dialogContext);
              _snack(context, '谢谢您的反馈！我们会尽快处理。');
            }
          },
          child: const Text('提交'),
        ),
      ],
    ),
  );
}

void showAppAboutDialog(BuildContext context, String versionLabel) {
  showAboutDialog(
    context: context,
    applicationName: 'Zhuoyu AI',
    applicationVersion: versionLabel,
    applicationIcon: Padding(
      padding: EdgeInsets.symmetric(vertical: 8.h),
      child: Text('🧠', style: TextStyle(fontSize: 48.sp)),
    ),
    applicationLegalese: '© 2026 Zhuoyu AI Team. All Rights Reserved.',
    children: [
      SizedBox(height: 16.h),
      const Text('琢玉 (Zhuoyu) 是一款基于第一性原理的学习辅助工具，旨在帮助用户通过 AI 辅助深度理解知识点。'),
    ],
  );
}

/// 每日学习目标选择器。选中结果通过 [onSelected] 交回调用方（由屏的 setState
/// 落地，和原来一样只存在页面状态里）。
void showDailyGoalPicker(
  BuildContext context, {
  required int current,
  required ValueChanged<int> onSelected,
  required Color textColor,
  required Color borderColor,
}) {
  showModalBottomSheet(
    context: context,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16.r)),
    ),
    builder: (context) {
      return Container(
        padding: EdgeInsets.all(24.w),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '每日学习目标',
              style: TextStyle(
                fontSize: 18.sp,
                fontWeight: FontWeight.bold,
                color: textColor,
              ),
            ),
            SizedBox(height: 16.h),
            Wrap(
              spacing: 12.w,
              runSpacing: 12.h,
              children: [20, 30, 50, 80, 100].map((goal) {
                final isSelected = current == goal;
                return GestureDetector(
                  onTap: () {
                    onSelected(goal);
                    Navigator.pop(context);
                  },
                  child: Container(
                    padding: EdgeInsets.symmetric(
                      horizontal: 20.w,
                      vertical: 12.h,
                    ),
                    decoration: BoxDecoration(
                      color: isSelected ? textColor : Colors.transparent,
                      borderRadius: BorderRadius.circular(8.r),
                      border: Border.all(
                        color: isSelected ? textColor : borderColor,
                      ),
                    ),
                    child: Text(
                      '$goal 题',
                      style: TextStyle(
                        fontSize: 14.sp,
                        fontWeight: FontWeight.w500,
                        color: isSelected
                            ? Theme.of(context).scaffoldBackgroundColor
                            : textColor,
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
            SizedBox(height: 24.h),
          ],
        ),
      );
    },
  );
}

void showClearConfirmDialog(BuildContext context) {
  showDialog(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('清空错题本'),
      content: const Text('确定要清空所有错题吗？此操作不可撤销。'),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext),
          child: const Text('取消'),
        ),
        TextButton(
          onPressed: () {
            Navigator.pop(dialogContext);
            _snack(context, '错题本已清空');
          },
          child: Text('确定', style: TextStyle(color: context.colors.error)),
        ),
      ],
    ),
  );
}

void showLogoutConfirmDialog(BuildContext context, WidgetRef ref) {
  showDialog(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('退出登录'),
      content: const Text('确定要退出当前账号吗？'),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('取消'),
        ),
        TextButton(
          onPressed: () async {
            Navigator.pop(context);
            await ref.read(authControllerProvider.notifier).logout();
            if (!context.mounted) return;
            // 登出失败：state 里已经是 AsyncError，界面停在原页（不弹新 UI）。
            if (ref.read(authControllerProvider).hasError) return;
            context.replace(AppRoutes.login);
          },
          child: Text('退出', style: TextStyle(color: context.colors.error)),
        ),
      ],
    ),
  );
}
