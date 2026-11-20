import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/error/user_message.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import '../../../../core/settings/settings_provider.dart';
import '../../data/practice_backup_service.dart';
import '../practice_resume_provider.dart';

/// 设置页「数据管理」里的导出/导入（§30 P2）。
///
/// 为什么走剪贴板：不引 `path_provider` / `share_plus`，也不需要考虑「文件存哪」；
/// 用户复制后自己贴到便签/网盘，换机再粘回来。
///
/// 两条必须守住的安全边界：
/// 1. 导出前明确提示「包含作答记录，请勿分享给他人」；
/// 2. 导入时由 [PracticeBackupService] 校验 `userId`，备份不属于当前账号
///    就整份拒绝，并**保留粘贴框内容**让用户能重新复制走。
class PracticeBackupPanel extends ConsumerStatefulWidget {
  const PracticeBackupPanel({super.key});

  @override
  ConsumerState<PracticeBackupPanel> createState() =>
      _PracticeBackupPanelState();
}

class _PracticeBackupPanelState extends ConsumerState<PracticeBackupPanel> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Column(
      children: [
        _tile(
          icon: AppIcons.archiveOutlined,
          title: '导出备份（剪贴板）',
          colors: colors,
          onTap: _busy ? null : () => unawaited(_export()),
        ),
        Padding(
          padding: EdgeInsets.only(left: 52.w),
          child: Divider(height: 1, color: colors.border),
        ),
        _tile(
          icon: AppIcons.history,
          title: '导入备份（粘贴）',
          colors: colors,
          onTap: _busy ? null : () => unawaited(_openImportDialog()),
        ),
      ],
    );
  }

  Widget _tile({
    required IconData icon,
    required String title,
    required AppColors colors,
    VoidCallback? onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: 14.w, vertical: 14.h),
        child: Row(
          children: [
            Icon(icon, size: 22.sp, color: colors.text),
            SizedBox(width: 12.w),
            Expanded(
              child: Text(
                title,
                style: TextStyle(
                  fontSize: 15.sp,
                  fontWeight: FontWeight.w500,
                  color: colors.text,
                ),
              ),
            ),
            Icon(
              AppIcons.arrowForwardIos,
              size: 16.sp,
              color: colors.textSecondary.withValues(alpha: 0.7),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _export() async {
    final userId = await currentAccountId();
    if (!mounted) return;
    if (userId == null) {
      _showSnackBar('请先登录后再导出备份');
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('导出备份'),
        content: const Text(
          '备份包含你的作答记录（题号、对错、时长），请勿分享给他人。\n\n'
          '题库缓存不会导出（可联网重建）。',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('复制到剪贴板'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _busy = true);
    try {
      final json = await ref
          .read(practiceBackupServiceProvider)
          .exportJson(userId);
      await Clipboard.setData(ClipboardData(text: json));
      if (!mounted) return;
      _showSnackBar('备份已复制到剪贴板（请勿分享给他人）');
    } catch (error) {
      debugPrint('[PracticeBackup] 导出失败: $error');
      if (!mounted) return;
      _showSnackBar('导出失败：${userMessageOf(error)}');
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _openImportDialog() async {
    final controller = TextEditingController();
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('导入备份'),
        content: TextField(
          controller: controller,
          maxLines: 6,
          minLines: 4,
          autocorrect: false,
          decoration: const InputDecoration(
            hintText: '粘贴备份 JSON…',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () async {
              final raw = controller.text.trim();
              if (raw.isEmpty) {
                _showSnackBar('请先粘贴备份内容');
                return;
              }
              Navigator.of(dialogContext).pop();
              await _import(raw);
            },
            child: const Text('导入'),
          ),
        ],
      ),
    );
    controller.dispose();
  }

  Future<void> _import(String raw) async {
    final userId = await currentAccountId();
    if (!mounted) return;
    if (userId == null) {
      _showSnackBar('请先登录后再导入备份');
      return;
    }

    setState(() => _busy = true);
    try {
      final result = await ref
          .read(practiceBackupServiceProvider)
          .importJson(raw: raw, currentUserId: userId);
      if (!mounted) return;
      if (result.rejected) {
        _showSnackBar('导入失败：${result.rejection}');
        return;
      }
      // 断点/复习模式都缓存在各自 notifier 的内存状态里，导入后必须重建，
      // 否则设置页与首页仍显示导入前的值（重启才生效）。
      ref.invalidate(practiceResumeControllerProvider);
      if (result.settingsImported) {
        ref.invalidate(settingsProvider);
      }
      final suffix = result.resumeImported ? '，已恢复练习断点' : '';
      _showSnackBar('${result.summary}$suffix');
    } catch (error) {
      debugPrint('[PracticeBackup] 导入失败: $error');
      if (!mounted) return;
      _showSnackBar('导入失败：${userMessageOf(error)}');
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }
}
