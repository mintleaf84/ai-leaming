import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/a11y/status_announcer.dart';
import '../../../../core/error/user_message.dart';
import '../../../../core/sync/sync_providers.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';

/// 设置页「数据管理」里的换机前检查（§30 P1）。
///
/// 规则很简单，但**必须诚实**：
/// - 有待同步 → 明确警告「换机前必须同步，否则这部分作答会丢」；
/// - 同步成功且本地真的一条不剩 → 才显示「已同步，可以换机了」；
/// - 同步失败（或同步后仍有剩余）→ 保留条数 + 显示失败原因，
///   绝不因为 `flush()` 没抛异常就宣称成功——`flush()` 对单个会话失败是
///   收集错误而不是抛出，只看异常会把失败当成功。
class DeviceMigrationPanel extends ConsumerStatefulWidget {
  const DeviceMigrationPanel({super.key});

  @override
  ConsumerState<DeviceMigrationPanel> createState() =>
      _DeviceMigrationPanelState();
}

class _DeviceMigrationPanelState extends ConsumerState<DeviceMigrationPanel> {
  int? _pending;
  bool _loading = true;
  bool _syncing = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    unawaited(_loadPending());
  }

  Future<void> _loadPending() async {
    try {
      final count = await ref.read(localPracticeStoreProvider).pendingCount();
      if (!mounted) return;
      setState(() {
        _pending = count;
        _loading = false;
      });
    } catch (error) {
      debugPrint('[换机检查] 读取待同步条数失败: $error');
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = '读取本地待同步记录失败';
      });
    }
  }

  Future<void> _syncNow() async {
    if (_syncing) return;
    setState(() {
      _syncing = true;
      _error = null;
    });

    String? failure;
    try {
      final result = await ref.read(syncServiceProvider).flush();
      failure = result.error;
    } catch (error) {
      // flush 自身抛异常属于预期外故障（例如数据库读失败），照实报错。
      debugPrint('[换机检查] 同步异常: $error');
      failure = userMessageOf(error);
    }

    // 以「同步后本地真实剩余条数」为准，不以返回值里的 error 为准：
    // error 为空但仍有剩余（例如刚作答的 5 秒宽限期）同样不能算成功。
    var pending = _pending ?? 0;
    try {
      pending = await ref.read(localPracticeStoreProvider).pendingCount();
    } catch (error) {
      debugPrint('[换机检查] 同步后读取剩余条数失败: $error');
    }
    if (!mounted) return;

    final succeeded = failure == null && pending == 0;
    setState(() {
      _syncing = false;
      _pending = pending;
      _error = succeeded
          ? null
          : (failure ?? '仍有 $pending 条待同步，请稍后再试');
    });
    announceStatus(
      context,
      succeeded ? '已同步，可以换机了' : '同步未完成：${_error ?? '请稍后再试'}',
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final secondary = colors.textSecondary;
    final pending = _pending;

    final String status;
    if (_loading) {
      status = '正在检查待同步数据…';
    } else if (pending == null) {
      status = '无法读取本地数据';
    } else if (pending == 0) {
      status = '已同步，可以换机了';
    } else {
      status = '待同步 $pending 条';
    }

    return Padding(
      padding: EdgeInsets.fromLTRB(14.w, 12.h, 14.w, 14.h),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                AppIcons.checkCircleOutline,
                size: 22.sp,
                color: colors.text,
              ),
              SizedBox(width: 12.w),
              Expanded(
                child: Text(
                  '换机前检查',
                  style: TextStyle(
                    fontSize: 15.sp,
                    fontWeight: FontWeight.w500,
                    color: colors.text,
                  ),
                ),
              ),
              if (_loading)
                SizedBox(
                  width: 14.w,
                  height: 14.w,
                  child: const CircularProgressIndicator(strokeWidth: 2),
                )
              else
                Text(
                  status,
                  key: const ValueKey('migration-status'),
                  style: TextStyle(
                    fontSize: 14.sp,
                    color: pending == 0 && _error == null
                        ? colors.success
                        : secondary,
                  ),
                ),
            ],
          ),
          SizedBox(height: 6.h),
          if (pending != null && pending > 0)
            Text(
              '换机前必须同步，否则这部分作答会丢',
              style: TextStyle(fontSize: 13.sp, color: colors.error),
            ),
          if (_error != null)
            Padding(
              padding: EdgeInsets.only(top: 4.h),
              child: Text(
                // 读库失败与同步失败是两种原因，不要都冠以「同步失败」。
                _pending == null ? _error! : '同步失败：$_error',
                key: const ValueKey('migration-error'),
                style: TextStyle(fontSize: 13.sp, color: colors.error),
              ),
            ),
          if (pending != null && pending > 0)
            Padding(
              padding: EdgeInsets.only(top: 10.h),
              child: FilledButton.tonal(
                onPressed: _syncing ? null : _syncNow,
                child: Text(_syncing ? '正在同步…' : '立即同步'),
              ),
            ),
        ],
      ),
    );
  }
}
