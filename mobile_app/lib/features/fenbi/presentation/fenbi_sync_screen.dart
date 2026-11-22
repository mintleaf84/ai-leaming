import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:intl/intl.dart';

import '../../../core/a11y/status_announcer.dart';
import '../../../core/navigation/app_nav.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_icons.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/fenbi_status.dart';
import 'fenbi_providers.dart';

/// 粉笔账号同步页（设置 → 数据管理 → 粉笔同步）。
///
/// 三种形态，全部由 [FenbiSyncState] 决定：
/// 1. 未绑定：说明 + 「扫码绑定」「用密码绑定」；
/// 2. 已绑定：掩码手机号、上次同步时间/结果、立即同步、解绑（二次确认）；
/// 3. 动作失败：整屏换成 [AppErrorView]，重试直接重发刚才那个动作。
///
/// 文案口径（设计 §7）：必须如实说明「试卷/模考记录暂不支持」，不能假装全同步。
class FenbiSyncScreen extends ConsumerStatefulWidget {
  const FenbiSyncScreen({super.key});

  @override
  ConsumerState<FenbiSyncScreen> createState() => _FenbiSyncScreenState();
}

class _FenbiSyncScreenState extends ConsumerState<FenbiSyncScreen> {
  /// 动作失败（同步/解绑）时整屏错误视图的标题与原因。
  String? _actionErrorTitle;
  String? _actionErrorMessage;

  /// 「重试」要重发的动作。
  Future<void> Function()? _retryAction;

  @override
  void initState() {
    super.initState();
    // 首帧前读一次绑定状态；用 microtask 避开构建期改写 provider。
    Future.microtask(
      () => ref.read(fenbiSyncControllerProvider.notifier).load(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(fenbiSyncControllerProvider);

    return Scaffold(
      backgroundColor: context.colors.background,
      appBar: AppBar(
        elevation: 0,
        backgroundColor: context.colors.surface,
        leading: IconButton(
          tooltip: '返回',
          icon: Icon(AppIcons.arrowBack, color: context.colors.text),
          onPressed: () => context.backOrHome(),
        ),
        title: Text(
          '粉笔同步',
          style: TextStyle(
            fontSize: 18.sp,
            fontWeight: FontWeight.w600,
            color: context.colors.text,
          ),
        ),
      ),
      body: _buildBody(state),
    );
  }

  Widget _buildBody(FenbiSyncState state) {
    if (state.phase == FenbiSyncPhase.loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state.phase == FenbiSyncPhase.error) {
      return AppErrorView(
        title: '加载失败',
        message: state.errorMessage ?? '请检查网络后重试。',
        onRetry: () =>
            unawaited(ref.read(fenbiSyncControllerProvider.notifier).load()),
      );
    }

    if (_actionErrorMessage != null) {
      return AppErrorView(
        title: _actionErrorTitle ?? '操作失败',
        message: _actionErrorMessage!,
        onRetry: () => unawaited(_retryActionNow()),
        secondaryLabel: '返回',
        onSecondary: _clearActionError,
      );
    }

    final status = state.status;
    if (status == null || !status.linked) {
      return _buildUnlinked();
    }
    return _buildLinked(status, state);
  }

  // -------------------------------------------------------------------------
  // 未绑定
  // -------------------------------------------------------------------------

  Widget _buildUnlinked() {
    final colors = context.colors;
    return ListView(
      padding: EdgeInsets.symmetric(horizontal: 20.w, vertical: 12.h),
      children: [
        const AppEmptyView(
          emoji: '🔗',
          title: '还没有绑定粉笔账号',
          hint: '绑定后可以把粉笔里的知识点练习记录同步进来，自动生成练习历史和错题。',
        ),
        SizedBox(height: 8.h),
        FilledButton(
          onPressed: () => unawaited(_startQrBinding()),
          style: FilledButton.styleFrom(
            backgroundColor: colors.accent,
            foregroundColor: colors.onAccent,
            minimumSize: const Size.fromHeight(48),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10.r),
            ),
          ),
          child: Text(
            '扫码绑定',
            style: TextStyle(fontSize: 15.sp, fontWeight: FontWeight.w600),
          ),
        ),
        SizedBox(height: 4.h),
        ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 44, minWidth: 44),
          child: TextButton(
            onPressed: () => unawaited(_showPasswordSheet()),
            style: TextButton.styleFrom(foregroundColor: colors.accent),
            child: Text('用密码绑定', style: TextStyle(fontSize: 14.sp)),
          ),
        ),
        SizedBox(height: 16.h),
        _buildLimitationNote(),
      ],
    );
  }

  // -------------------------------------------------------------------------
  // 已绑定
  // -------------------------------------------------------------------------

  Widget _buildLinked(FenbiSyncStatus status, FenbiSyncState state) {
    final colors = context.colors;
    final result = state.displayResult;

    return ListView(
      padding: EdgeInsets.symmetric(horizontal: 20.w, vertical: 16.h),
      children: [
        if (!status.syncable) ...[
          _buildBanner(
            icon: AppIcons.errorOutline,
            color: colors.error,
            background: colors.errorContainer,
            text: '绑定已失效，同步已暂停。请先解绑再重新绑定。',
          ),
          SizedBox(height: 12.h),
        ],
        _buildStatusCard(status, colors),
        if (result != null) ...[
          SizedBox(height: 12.h),
          _buildResultCard(result, colors),
        ],
        SizedBox(height: 16.h),
        FilledButton.icon(
          // `syncable == false` 时按钮禁用：粉笔侧已失效，点了也只会再失败一次。
          onPressed: state.busy || !status.syncable
              ? null
              : () => unawaited(_sync()),
          icon: state.busy
              ? SizedBox(
                  width: 16.w,
                  height: 16.w,
                  child: const CircularProgressIndicator(strokeWidth: 2),
                )
              : Icon(AppIcons.refresh, size: 18.sp),
          label: Text(
            state.busy ? '同步中…' : '立即同步',
            style: TextStyle(fontSize: 15.sp, fontWeight: FontWeight.w600),
          ),
          style: FilledButton.styleFrom(
            backgroundColor: colors.accent,
            foregroundColor: colors.onAccent,
            minimumSize: const Size.fromHeight(48),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10.r),
            ),
          ),
        ),
        SizedBox(height: 4.h),
        ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 44, minWidth: 44),
          child: TextButton.icon(
            onPressed: state.busy ? null : () => unawaited(_confirmUnlink()),
            icon: Icon(AppIcons.deleteOutline, size: 18.sp),
            label: Text('解绑', style: TextStyle(fontSize: 14.sp)),
            style: TextButton.styleFrom(
              foregroundColor: colors.error,
              minimumSize: const Size.fromHeight(44),
            ),
          ),
        ),
        SizedBox(height: 16.h),
        _buildLimitationNote(),
      ],
    );
  }

  Widget _buildStatusCard(FenbiSyncStatus status, AppColors colors) {
    return Container(
      padding: EdgeInsets.all(16.w),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(12.r),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(AppIcons.personOutline, size: 20.sp, color: colors.accent),
              SizedBox(width: 8.w),
              Expanded(
                child: Text(
                  status.phoneMasked ?? '粉笔账号',
                  style: TextStyle(
                    fontSize: 16.sp,
                    fontWeight: FontWeight.w600,
                    color: colors.text,
                  ),
                ),
              ),
              Text(
                '已绑定',
                style: TextStyle(fontSize: 12.sp, color: colors.success),
              ),
            ],
          ),
          SizedBox(height: 12.h),
          _InfoRow(label: '上次同步', value: _formatTime(status.lastSyncAt)),
          SizedBox(height: 6.h),
          _InfoRow(label: '上次结果', value: _summarize(result: status.lastResult)),
        ],
      ),
    );
  }

  Widget _buildResultCard(FenbiSyncResult result, AppColors colors) {
    return Container(
      padding: EdgeInsets.all(16.w),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(12.r),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '同步结果',
            style: TextStyle(
              fontSize: 15.sp,
              fontWeight: FontWeight.w600,
              color: colors.text,
            ),
          ),
          SizedBox(height: 10.h),
          Wrap(
            spacing: 8.w,
            runSpacing: 8.h,
            children: [
              _StatChip(label: '导入', value: '${result.imported}', color: colors.success),
              _StatChip(label: '跳过', value: '${result.skipped}', color: colors.textSecondary),
              _StatChip(
                label: '新增题目',
                value: '${result.newQuestions}',
                color: colors.accent,
              ),
            ],
          ),
          if (result.note != null) ...[
            SizedBox(height: 10.h),
            Text(
              result.note!,
              style: TextStyle(fontSize: 13.sp, color: colors.textSecondary),
            ),
          ],
          if (result.hasFailed) ...[
            SizedBox(height: 12.h),
            Text(
              '未导入 ${result.failed.length} 条',
              style: TextStyle(
                fontSize: 13.sp,
                fontWeight: FontWeight.w600,
                color: colors.error,
              ),
            ),
            SizedBox(height: 6.h),
            for (final failure in result.failed) ...[
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(AppIcons.cancel, size: 14.sp, color: colors.error),
                  SizedBox(width: 6.w),
                  Expanded(
                    child: Text(
                      '${failure.label}：${failure.reason}',
                      style: TextStyle(
                        fontSize: 12.sp,
                        height: 1.4,
                        color: colors.textSecondary,
                      ),
                    ),
                  ),
                ],
              ),
              SizedBox(height: 4.h),
            ],
            Text(
              '这些记录本次没有同步成功；稍后再点一次「立即同步」会重试。',
              style: TextStyle(fontSize: 12.sp, color: colors.textSecondary),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildBanner({
    required IconData icon,
    required Color color,
    required Color background,
    required String text,
  }) {
    return Container(
      padding: EdgeInsets.all(12.w),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(10.r),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18.sp, color: color),
          SizedBox(width: 8.w),
          Expanded(
            child: Text(
              text,
              style: TextStyle(fontSize: 13.sp, height: 1.4, color: color),
            ),
          ),
        ],
      ),
    );
  }

  /// 接口限制的固定说明：两处（未绑定 / 已绑定）文案必须一致。
  Widget _buildLimitationNote() {
    return _buildBanner(
      icon: AppIcons.infoOutline,
      color: context.colors.textSecondary,
      background: context.colors.surfaceAlt,
      text: '试卷/模考记录暂不支持（接口未开放），目前只同步知识点练习。',
    );
  }

  // -------------------------------------------------------------------------
  // 动作
  // -------------------------------------------------------------------------

  Future<void> _sync() async {
    final outcome = await ref.read(fenbiSyncControllerProvider.notifier).sync();
    if (!mounted) return;

    if (!outcome.isOk) {
      _showActionError(
        title: '同步失败',
        message: outcome.error ?? '请稍后重试。',
        retry: _sync,
      );
      return;
    }

    final result = outcome.result;
    final base = result == null
        ? '同步完成'
        : '同步完成：导入 ${result.imported} 条，跳过 ${result.skipped} 条';
    final message = result != null && result.hasFailed
        ? '$base，${result.failed.length} 条未导入'
        : base;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
    announceStatus(context, message);
  }

  Future<void> _confirmUnlink() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => const _UnlinkConfirmDialog(),
    );
    if (confirmed != true || !mounted) return;
    await _unlink();
  }

  /// 真正的解绑动作（错误视图的「重试」直接走这里，不再弹一次确认）。
  Future<void> _unlink() async {
    final outcome = await ref
        .read(fenbiSyncControllerProvider.notifier)
        .unlink();
    if (!mounted) return;

    if (!outcome.isOk) {
      _showActionError(
        title: '解绑失败',
        message: outcome.error ?? '请稍后重试。',
        retry: _unlink,
      );
      return;
    }
    announceStatus(context, '已解除粉笔账号绑定');
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('已解除绑定，已同步的记录会保留')));
  }

  Future<void> _startQrBinding() async {
    final bound = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: context.colors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20.r)),
      ),
      builder: (_) => const _FenbiQrSheet(),
    );
    if (bound == true && mounted) {
      announceStatus(context, '粉笔账号已绑定');
      await ref.read(fenbiSyncControllerProvider.notifier).load();
    }
  }

  Future<void> _showPasswordSheet() async {
    final bound = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: context.colors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20.r)),
      ),
      builder: (_) => const _FenbiPasswordSheet(),
    );
    if (bound == true && mounted) {
      announceStatus(context, '粉笔账号已绑定');
      await ref.read(fenbiSyncControllerProvider.notifier).load();
    }
  }

  void _showActionError({
    required String title,
    required String message,
    Future<void> Function()? retry,
  }) {
    if (!mounted) return;
    setState(() {
      _actionErrorTitle = title;
      _actionErrorMessage = message;
      _retryAction = retry;
    });
    // 错误视图是「新插入的节点」，读屏焦点不会自己移过去。
    announceStatus(context, '$title。$message');
  }

  void _clearActionError() {
    if (_actionErrorMessage == null) return;
    setState(() {
      _actionErrorTitle = null;
      _actionErrorMessage = null;
      _retryAction = null;
    });
  }

  Future<void> _retryActionNow() async {
    final retry = _retryAction;
    _clearActionError();
    if (retry != null) await retry();
  }

  String _formatTime(DateTime? time) {
    if (time == null) return '还没有同步过';
    return DateFormat('yyyy-MM-dd HH:mm').format(time.toLocal());
  }

  String _summarize({required FenbiSyncResult? result}) {
    if (result == null) return '暂无记录';
    final base = '导入 ${result.imported} · 跳过 ${result.skipped} · 新增题目 ${result.newQuestions}';
    return result.hasFailed ? '$base · 失败 ${result.failed.length}' : base;
  }
}

// ---------------------------------------------------------------------------
// 小部件
// ---------------------------------------------------------------------------

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 68.w,
          child: Text(
            label,
            style: TextStyle(fontSize: 13.sp, color: colors.textSecondary),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: TextStyle(fontSize: 13.sp, color: colors.text),
          ),
        ),
      ],
    );
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 10.w, vertical: 6.h),
      decoration: BoxDecoration(
        color: colors.surfaceAlt,
        borderRadius: BorderRadius.circular(8.r),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: TextStyle(fontSize: 12.sp, color: colors.textSecondary),
          ),
          SizedBox(width: 4.w),
          Text(
            value,
            style: TextStyle(
              fontSize: 13.sp,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

/// 解绑二次确认：说明清掉什么、保留什么。
class _UnlinkConfirmDialog extends StatelessWidget {
  const _UnlinkConfirmDialog();

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return AlertDialog(
      title: const Text('解绑粉笔账号？'),
      content: const Text(
        '解绑后会清除服务器保存的粉笔密码与登录状态，之后不再自动同步。'
        '已经同步进来的练习记录会保留。',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: Text(
            '取消',
            style: TextStyle(fontSize: 14.sp, color: colors.textSecondary),
          ),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(true),
          child: Text(
            '解绑',
            style: TextStyle(fontSize: 14.sp, color: colors.error),
          ),
        ),
      ],
    );
  }
}

/// 扫码绑定弹层。
class _FenbiQrSheet extends ConsumerStatefulWidget {
  const _FenbiQrSheet();

  @override
  ConsumerState<_FenbiQrSheet> createState() => _FenbiQrSheetState();
}

class _FenbiQrSheetState extends ConsumerState<_FenbiQrSheet> {
  bool _closing = false;

  @override
  void initState() {
    super.initState();
    Future.microtask(
      () => ref.read(fenbiQrControllerProvider.notifier).start(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final state = ref.watch(fenbiQrControllerProvider);
    // 先拿好 Navigator：ref.listen 的回调在异步帧里跑，那里不能再读 context。
    final navigator = Navigator.of(context);

    // 扫码确认后服务端完成绑定：关掉弹层并让调用方刷新状态。
    ref.listen<FenbiQrScanState>(fenbiQrControllerProvider, (previous, next) {
      if (next.phase == FenbiQrPhase.confirmed && !_closing && mounted) {
        _closing = true;
        Future.microtask(() {
          if (mounted) navigator.pop(true);
        });
      }
    });

    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(20.w, 18.h, 20.w, 24.h),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                '扫码绑定粉笔',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 17.sp,
                  fontWeight: FontWeight.w600,
                  color: colors.text,
                ),
              ),
              SizedBox(height: 4.h),
              Text(
                '用粉笔 App 扫下面的二维码，并在手机上确认登录。',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 13.sp,
                  height: 1.4,
                  color: colors.textSecondary,
                ),
              ),
              SizedBox(height: 16.h),
              if (state.errorMessage != null)
                AppErrorView(
                  title: '二维码获取失败',
                  message: state.errorMessage!,
                  onRetry: () => unawaited(
                    ref.read(fenbiQrControllerProvider.notifier).start(),
                  ),
                  secondaryLabel: '关闭',
                  onSecondary: () => Navigator.of(context).pop(false),
                )
              else if (!state.hasSession)
                Padding(
                  padding: EdgeInsets.symmetric(vertical: 32.h),
                  child: Column(
                    children: [
                      const CircularProgressIndicator(),
                      SizedBox(height: 12.h),
                      Text(
                        '正在生成二维码…',
                        style: TextStyle(
                          fontSize: 13.sp,
                          color: colors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                )
              else
                _buildQrContent(state, colors),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildQrContent(FenbiQrScanState state, AppColors colors) {
    final session = state.session!;
    final phaseColor = switch (state.phase) {
      FenbiQrPhase.confirmed => colors.success,
      FenbiQrPhase.expired => colors.error,
      _ => colors.textSecondary,
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Center(
          child: Container(
            padding: EdgeInsets.all(12.w),
            decoration: BoxDecoration(
              // 二维码必须「深色码点 + 浅色底」才扫得出来，暗色主题下同样用白底。
              // 这是功能性例外：其余颜色仍一律走 context.colors。
              color: Colors.white,
              borderRadius: BorderRadius.circular(12.r),
            ),
            child: Semantics(
              label: '粉笔登录二维码',
              image: true,
              child: _QrImage(session: session, colors: colors),
            ),
          ),
        ),
        SizedBox(height: 12.h),
        Text(
          state.phase.label,
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13.sp, color: phaseColor),
        ),
        SizedBox(height: 8.h),
        ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 44, minWidth: 44),
          child: TextButton(
            onPressed: () => unawaited(
              ref.read(fenbiQrControllerProvider.notifier).start(),
            ),
            style: TextButton.styleFrom(foregroundColor: colors.accent),
            child: Text('重新生成二维码', style: TextStyle(fontSize: 14.sp)),
          ),
        ),
        ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 44, minWidth: 44),
          child: TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            style: TextButton.styleFrom(foregroundColor: colors.textSecondary),
            child: Text('取消', style: TextStyle(fontSize: 14.sp)),
          ),
        ),
      ],
    );
  }

}

/// 二维码图片。
///
/// 首选服务端下发的 PNG data URL：受限网络下 api.qrserver.com 不可达，
/// 而且把含 lgtoken 的登录内容发给第三方服务没有必要（真实故障）。
/// 旧服务端没有该字段时才回退到公共渲染服务。
class _QrImage extends StatelessWidget {
  const _QrImage({required this.session, required this.colors});

  final FenbiQrSession session;
  final AppColors colors;

  @override
  Widget build(BuildContext context) {
    final dataUrl = session.qrPngDataUrl;
    final Widget image;
    if (dataUrl.startsWith('data:image/png;base64,')) {
      image = Image.memory(
        base64Decode(dataUrl.substring('data:image/png;base64,'.length)),
        width: 200.w,
        height: 200.w,
        fit: BoxFit.contain,
      );
    } else {
      image = Image.network(
        _legacyQrUrl(session.qrContent),
        width: 200.w,
        height: 200.w,
        fit: BoxFit.contain,
        loadingBuilder: (context, child, progress) {
          if (progress == null) return child;
          return SizedBox(
            width: 200.w,
            height: 200.w,
            child: const Center(child: CircularProgressIndicator()),
          );
        },
        errorBuilder: (context, error, stackTrace) => Center(
          child: Text(
            '二维码图片加载失败，点下方「重新生成」',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12.sp, color: colors.textSecondary),
          ),
        ),
      );
    }
    return SizedBox(
      width: 200.w,
      height: 200.w,
      child: image,
    );
  }

  /// 仅用于兼容不返回 qrPngDataUrl 的旧服务端；`data` 必须整体 URL 编码。
  String _legacyQrUrl(String data) {
    final encoded = Uri.encodeComponent(data);
    return 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=$encoded';
  }
}

/// 手机号 + 密码绑定弹层。
///
/// 失败**不关弹层**：手机号还在输入框里，就地用 [AppErrorView] 说明原因并
/// 允许重试，比让用户从头再填一遍强。
class _FenbiPasswordSheet extends ConsumerStatefulWidget {
  const _FenbiPasswordSheet();

  @override
  ConsumerState<_FenbiPasswordSheet> createState() =>
      _FenbiPasswordSheetState();
}

class _FenbiPasswordSheetState extends ConsumerState<_FenbiPasswordSheet> {
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();

  /// 表单校验错误（11 位手机号 / 密码非空）。
  String? _phoneError;
  String? _passwordError;

  /// 请求失败原因；非空时表单被 [AppErrorView] 取代。
  String? _submitError;

  bool _submitting = false;
  bool _obscurePassword = true;

  @override
  void dispose() {
    _phoneController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_submitting) return;
    final phone = _phoneController.text.trim();
    final password = _passwordController.text;

    if (!RegExp(r'^1\d{10}$').hasMatch(phone)) {
      setState(() {
        _phoneError = '请输入 11 位手机号';
        _passwordError = null;
      });
      return;
    }
    if (password.isEmpty) {
      setState(() {
        _phoneError = null;
        _passwordError = '请输入密码';
      });
      return;
    }

    setState(() {
      _phoneError = null;
      _passwordError = null;
      _submitError = null;
      _submitting = true;
    });

    final outcome = await ref
        .read(fenbiSyncControllerProvider.notifier)
        .link(phone: phone, password: password);
    if (!mounted) return;

    if (outcome.isOk) {
      Navigator.of(context).pop(true);
      return;
    }
    setState(() {
      _submitting = false;
      _submitError = outcome.error ?? '请稍后重试。';
    });
    announceStatus(context, '绑定失败。${_submitError!}');
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(20.w, 18.h, 20.w, 24.h),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                '用密码绑定粉笔',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 17.sp,
                  fontWeight: FontWeight.w600,
                  color: colors.text,
                ),
              ),
              SizedBox(height: 6.h),
              Text(
                '密码只用于向粉笔换取登录状态，服务端加密保存，不会出现在日志里。'
                '如果连续失败或提示风控，请改用扫码绑定。',
                style: TextStyle(
                  fontSize: 12.sp,
                  height: 1.45,
                  color: colors.textSecondary,
                ),
              ),
              SizedBox(height: 16.h),
              if (_submitError != null)
                AppErrorView(
                  title: '绑定失败',
                  message: _submitError!,
                  onRetry: () => unawaited(_submit()),
                  secondaryLabel: '返回修改',
                  onSecondary: () => setState(() => _submitError = null),
                )
              else ...[
                TextField(
                  controller: _phoneController,
                  keyboardType: TextInputType.phone,
                  enabled: !_submitting,
                  autofillHints: const <String>[AutofillHints.telephoneNumber],
                  decoration: InputDecoration(
                    labelText: '粉笔手机号',
                    hintText: '11 位手机号',
                    errorText: _phoneError,
                    border: const OutlineInputBorder(),
                  ),
                  textInputAction: TextInputAction.next,
                ),
                SizedBox(height: 12.h),
                TextField(
                  controller: _passwordController,
                  obscureText: _obscurePassword,
                  enabled: !_submitting,
                  autofillHints: const <String>[AutofillHints.password],
                  decoration: InputDecoration(
                    labelText: '粉笔密码',
                    errorText: _passwordError,
                    border: const OutlineInputBorder(),
                    suffixIcon: IconButton(
                      tooltip: _obscurePassword ? '显示密码' : '隐藏密码',
                      icon: Icon(
                        _obscurePassword
                            ? AppIcons.visibility
                            : AppIcons.visibilityOff,
                        color: colors.textSecondary,
                      ),
                      onPressed: () => setState(
                        () => _obscurePassword = !_obscurePassword,
                      ),
                    ),
                  ),
                  onSubmitted: (_) => unawaited(_submit()),
                ),
                SizedBox(height: 16.h),
                FilledButton(
                  onPressed: _submitting ? null : () => unawaited(_submit()),
                  style: FilledButton.styleFrom(
                    backgroundColor: colors.accent,
                    foregroundColor: colors.onAccent,
                    minimumSize: const Size.fromHeight(48),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10.r),
                    ),
                  ),
                  child: _submitting
                      ? SizedBox(
                          width: 18.w,
                          height: 18.w,
                          child: const CircularProgressIndicator(
                            strokeWidth: 2,
                          ),
                        )
                      : Text(
                          '绑定',
                          style: TextStyle(
                            fontSize: 15.sp,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                ),
              ],
              ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 44, minWidth: 44),
                child: TextButton(
                  onPressed: _submitting
                      ? null
                      : () => Navigator.of(context).pop(false),
                  style: TextButton.styleFrom(
                    foregroundColor: colors.textSecondary,
                  ),
                  child: Text('取消', style: TextStyle(fontSize: 14.sp)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
