import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../core/compat/app_version.dart';
import '../../core/compat/contract_compat.dart';
import '../../core/compat/contract_meta_repository.dart';
import '../../core/theme/app_icons.dart';
import '../../core/theme/app_theme.dart';

/// 首页「记忆卡」入口是否显示（能力协商的唯一判定点）。
///
/// 服务端能力清单里没有 `recall` 时**隐藏**入口，而不是灰显后让用户点出一个报错
/// ——"点了才知道不能用"比"根本没这个入口"更让人困惑。
///
/// 两种「还不知道」的情况一律按支持处理：
/// - 协商还没结果（`decision == null`，加载中）；
/// - 服务端不可达。
///
/// 离线刷题是既有能力，不能因为一次 `/meta` 请求失败就把功能藏起来。
bool recallEntryAvailable(ContractDecision? decision) {
  if (decision == null) return true;
  if (decision.status == ContractCompat.serverUnreachable) return true;
  return decision.supports('recall');
}

/// 版本错位闸：App 与服务端版本对不上时**明确降级**，而不是让用户在各页面里
/// 撞见「这张卡已经不存在了」这类误导性错误。
///
/// 挂在 `MaterialApp.router` 的 `builder` 里、`ServerConfigGate` 内部——只有在拿到
/// 服务器地址之后才发起 `/meta` 协商。判定逻辑全部在 `core/compat/`，这里只负责
/// 呈现与出口，不重复实现任何比较规则。
///
/// 三条呈现原则（见 `docs/mobile-compat.md` §3）：
/// 1. **首次绘制不等网络**：加载中 / 请求失败 / 服务端不可达都直接渲染 App 本体。
///    断网是移动端常态，把人挡在门外等于让整个 App 不可用；
/// 2. 阻断屏是「说明 + 两个出口」，不是转圈遮全屏——转圈既不说原因，也说不清出路；
/// 3. 每个阻断态都留一个人能走通的出口（本项目是手动安装的 APK，硬闸 = 锁死用户）。
class ContractGate extends ConsumerStatefulWidget {
  const ContractGate({required this.child, super.key});

  final Widget child;

  @override
  ConsumerState<ContractGate> createState() => _ContractGateState();
}

class _ContractGateState extends ConsumerState<ContractGate> {
  /// 本次会话内是否已选择出口（「先离线练习」/「仍然进入」）。
  ///
  /// 只存在内存里：重启 App 会重新协商一次，那时版本可能已经对上，不让上一次的
  /// 让步永久生效。
  bool _enteredAnyway = false;

  /// 「未与当前服务端版本一起验证过」提示条是否已在本次会话内关闭。
  bool _unverifiedNoticeDismissed = false;

  /// 下载地址是否已复制（用来给一次明确的反馈，而不是弹完提示就当没事）。
  bool _downloadUrlCopied = false;

  @override
  Widget build(BuildContext context) {
    final decisionState = ref.watch(contractDecisionProvider);
    // Riverpod 3 的 `AsyncValue.value` 可空：加载中且没有上一轮结果时为 null。
    final decision = decisionState.value;

    // 首次绘制不等网络：还没有结论时按"一切正常"渲染 App 本体。
    // 刷新期间 Riverpod 会保留上一次的值，所以点「重试」不会闪一下 App 再弹回来。
    if (decision == null) {
      return widget.child;
    }

    if (!decision.blocks) {
      if (decision.status == ContractCompat.clientUnverified &&
          !_unverifiedNoticeDismissed) {
        return _withNoticeBar(
          notice: _NoticeBar(
            icon: AppIcons.infoOutline,
            tint: Theme.of(context).colorScheme.secondary,
            text: '这个 App 未与当前服务端版本一起验证过。',
            onDismiss: () => setState(() => _unverifiedNoticeDismissed = true),
          ),
        );
      }
      return widget.child;
    }

    // 已经不阻断的状态下不再追认之前的让步：用户点了「重试」并真的修好了，
    // 就应该回到没有横幅的干净界面。
    if (_enteredAnyway && decision.canBypass) {
      if (decision.status == ContractCompat.serverTooOld) {
        // 服务端还是旧的，在线功能随时可能出错——进来之后必须常驻提醒，
        // 否则用户会把"接口 404 了"当成 App 的 bug。
        return _withNoticeBar(
          notice: const _NoticeBar(
            icon: AppIcons.dnsOutlined,
            tint: AppTheme.warningColor,
            text: '服务端版本过旧，在线功能可能不可用。',
          ),
        );
      }
      // clientTooOld 的出口是「仍然进入（可能出错）」，用户已明确接受风险，
      // 再挂一条横幅等于二次劝阻。
      return widget.child;
    }

    return _buildBlockedScreen(decision, retrying: decisionState.isLoading);
  }

  Widget _withNoticeBar({required Widget notice}) {
    return Column(
      children: [
        notice,
        Expanded(
          // 提示条已经占掉了顶部安全区；子树的顶部内边距必须扣掉，
          // 否则首页会多出一条与提示条等高的空白。
          child: MediaQuery.removePadding(
            context: context,
            removeTop: true,
            child: widget.child,
          ),
        ),
      ],
    );
  }

  Widget _buildBlockedScreen(
    ContractDecision decision, {
    required bool retrying,
  }) {
    // 前置条件：调用方只在 `decision.blocks` 为真时才走到这里。下面按状态分派，
    // 非阻断态落到这里是编程错误，而不是某一种合法的降级。
    assert(decision.blocks, '只有阻断态才渲染阻断屏');
    final meta = decision.meta;

    if (decision.status == ContractCompat.serverTooOld) {
      final facts = <_Fact>[
        const _Fact('需要服务端版本', '≥ $minServerContract'),
        if (meta != null) _Fact('当前服务端版本', '${meta.contractVersion}'),
      ];
      return _BlockedView(
        icon: AppIcons.dnsOutlined,
        iconTint: AppTheme.warningColor,
        title: '服务端版本过旧',
        message:
            '这台服务器还在运行旧版本，和手上的 App 对不上。'
            '在线功能先停用了，以免数据出问题。',
        facts: facts,
        hint: '升级服务端后点「重试」就能继续。',
        primaryLabel: '重试',
        primaryBusy: retrying,
        busyLabel: '正在重试…',
        onPrimary: () => ref.invalidate(contractDecisionProvider),
        secondaryLabel: decision.canBypass ? '先离线练习' : null,
        onSecondary: decision.canBypass
            ? () => setState(() => _enteredAnyway = true)
            : null,
      );
    }

    // clientTooOld：App 旧、服务端要求更高版本。
    final downloadUrl = meta?.downloadUrl;
    final facts = <_Fact>[
      if (meta?.minClientVersion != null)
        _Fact('服务器要求的 App 版本', '≥ ${meta!.minClientVersion}'),
      const _Fact('当前 App 版本', appVersion),
    ];
    final copied = downloadUrl != null && _downloadUrlCopied;

    return _BlockedView(
      icon: AppIcons.archiveOutlined,
      iconTint: Theme.of(context).colorScheme.secondary,
      title: '需要更新 App',
      message:
          '这台服务器已经升级到新版本，你手上的 App 版本太旧了。'
          '继续使用可能会出错。',
      facts: facts,
      hint: downloadUrl == null ? '请联系管理员获取新版安装包。' : '复制后在浏览器里打开，即可下载安装包。',
      notice: copied ? '下载地址已复制，可在浏览器里粘贴打开。' : null,
      // 没有下载地址时，「复制」这个动作不存在，唯一可走的路就是带着警告进去。
      primaryLabel: downloadUrl == null ? '仍然进入（可能出错）' : '复制下载地址',
      onPrimary: downloadUrl == null
          ? () => setState(() => _enteredAnyway = true)
          : () => unawaited(_copyDownloadUrl(downloadUrl)),
      secondaryLabel: downloadUrl == null ? null : '仍然进入（可能出错）',
      onSecondary: downloadUrl == null
          ? null
          : () => setState(() => _enteredAnyway = true),
    );
  }

  Future<void> _copyDownloadUrl(String url) async {
    await Clipboard.setData(ClipboardData(text: url));
    if (!mounted) return;
    setState(() => _downloadUrlCopied = true);
  }
}

/// 阻断屏：说明 + 版本事实 + 提示 + 出口。
///
/// 内容不足一屏时垂直居中、超出时可滚动：375 宽 + 1.3 倍字号时这一屏会接近满屏，
/// 定高居中会把次按钮挤出可视区，而定高贴顶又会在高屏上显得空荡。
class _BlockedView extends StatelessWidget {
  const _BlockedView({
    required this.icon,
    required this.iconTint,
    required this.title,
    required this.message,
    required this.facts,
    this.hint,
    this.notice,
    required this.primaryLabel,
    this.primaryBusy = false,
    this.busyLabel,
    required this.onPrimary,
    this.secondaryLabel,
    this.onSecondary,
  });

  final IconData icon;
  final Color iconTint;
  final String title;
  final String message;
  final List<_Fact> facts;
  final String? hint;
  final String? notice;
  final String primaryLabel;
  final bool primaryBusy;
  final String? busyLabel;
  final VoidCallback onPrimary;
  final String? secondaryLabel;
  final VoidCallback? onSecondary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            // 内容不足一屏时居中，超过一屏时可滚动：1.3 倍字号 + 375 宽也不溢出。
            final minHeight = (constraints.maxHeight - 48.h).clamp(
              0.0,
              double.infinity,
            );
            return SingleChildScrollView(
              padding: EdgeInsets.symmetric(horizontal: 24.w, vertical: 24.h),
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: minHeight),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 460),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 52.r,
                          height: 52.r,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: Color.alphaBlend(
                              iconTint.withValues(alpha: 0.12),
                              scheme.surface,
                            ),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            icon,
                            size: 26.sp,
                            color: _legibleTint(context, iconTint),
                          ),
                        ),
                        SizedBox(height: 20.h),
                        Semantics(
                          header: true,
                          child: Text(
                            title,
                            style: theme.textTheme.headlineSmall?.copyWith(
                              fontSize: 22.sp,
                              fontWeight: FontWeight.bold,
                              height: 1.25,
                              color: scheme.onSurface,
                            ),
                          ),
                        ),
                        SizedBox(height: 10.h),
                        Text(
                          message,
                          style: TextStyle(
                            fontSize: 14.sp,
                            height: 1.6,
                            color: scheme.onSurfaceVariant,
                          ),
                        ),
                        if (facts.isNotEmpty) ...[
                          SizedBox(height: 20.h),
                          _FactsBox(facts: facts),
                        ],
                        if (hint != null) ...[
                          SizedBox(height: 16.h),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Padding(
                                padding: EdgeInsets.only(top: 2.h),
                                child: Icon(
                                  AppIcons.lightbulbOutline,
                                  size: 16.sp,
                                  color: scheme.onSurfaceVariant,
                                ),
                              ),
                              SizedBox(width: 8.w),
                              Expanded(
                                child: Text(
                                  hint!,
                                  style: TextStyle(
                                    fontSize: 13.sp,
                                    height: 1.5,
                                    color: scheme.onSurfaceVariant,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                        if (notice != null) ...[
                          SizedBox(height: 16.h),
                          Container(
                            width: double.infinity,
                            padding: EdgeInsets.symmetric(
                              horizontal: 12.w,
                              vertical: 10.h,
                            ),
                            decoration: BoxDecoration(
                              color: Color.alphaBlend(
                                AppTheme.successColor.withValues(alpha: 0.12),
                                scheme.surface,
                              ),
                              borderRadius: BorderRadius.circular(8.r),
                            ),
                            child: Row(
                              children: [
                                Icon(
                                  AppIcons.checkCircle,
                                  size: 16.sp,
                                  color: AppTheme.successColor,
                                ),
                                SizedBox(width: 8.w),
                                Expanded(
                                  child: Text(
                                    notice!,
                                    style: TextStyle(
                                      fontSize: 13.sp,
                                      color: scheme.onSurface,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                        SizedBox(height: 28.h),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                            onPressed: primaryBusy ? null : onPrimary,
                            style: FilledButton.styleFrom(
                              backgroundColor: scheme.primary,
                              foregroundColor: scheme.onPrimary,
                              // 触摸目标 48dp：这里刻意不乘 .h —— 触摸区不该随屏幕高度
                              // 缩放，矮屏上"差 2dp"就是差一点才点得到。
                              minimumSize: const Size.fromHeight(48),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10.r),
                              ),
                            ),
                            child: Text(
                              primaryBusy
                                  ? (busyLabel ?? primaryLabel)
                                  : primaryLabel,
                              style: TextStyle(
                                fontSize: 15.sp,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ),
                        if (secondaryLabel != null) ...[
                          SizedBox(height: 8.h),
                          SizedBox(
                            width: double.infinity,
                            child: TextButton(
                              onPressed: onSecondary,
                              style: TextButton.styleFrom(
                                foregroundColor: scheme.onSurface,
                                minimumSize: const Size.fromHeight(48),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(10.r),
                                ),
                              ),
                              child: Text(
                                secondaryLabel!,
                                style: TextStyle(fontSize: 15.sp),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

/// 「需要 / 当前」两行事实。
///
/// 用一行一条而不是塞进正文：版本号是用户唯一能拿去和别人核对的信息，
/// 混在句子里既难扫读，也没法在字号放大时保持对齐。
class _FactsBox extends StatelessWidget {
  const _FactsBox({required this.facts});

  final List<_Fact> facts;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final divider = scheme.onSurface.withValues(alpha: 0.08);

    return Container(
      width: double.infinity,
      padding: EdgeInsets.symmetric(horizontal: 14.w),
      decoration: BoxDecoration(
        // 用主题里的卡片色 + 分割线色，而不是在 surface 上叠一层透明度：
        // 浅色模式的页面底色是 #F7F7F5、surface 是纯白，4% 的叠加算出来
        // 恰好等于页面底色，事实框会"消失"成只有一个 1px 边框的空壳。
        color: theme.cardColor,
        borderRadius: BorderRadius.circular(10.r),
        border: Border.all(color: theme.dividerColor),
      ),
      child: Column(
        children: [
          for (var i = 0; i < facts.length; i++) ...[
            if (i > 0) Divider(height: 1, color: divider),
            Padding(
              padding: EdgeInsets.symmetric(vertical: 12.h),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      facts[i].label,
                      style: TextStyle(
                        fontSize: 13.sp,
                        height: 1.4,
                        color: scheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                  SizedBox(width: 12.w),
                  Text(
                    facts[i].value,
                    style: TextStyle(
                      fontSize: 13.sp,
                      height: 1.4,
                      fontWeight: FontWeight.w600,
                      color: scheme.onSurface,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Fact {
  const _Fact(this.label, this.value);

  final String label;
  final String value;
}

/// 图标在「同色系浅底」上的可见度。
///
/// 浅色模式把 tint 压暗 22%：橙色 #FF9500 放在 12% 橙底上原色对比只有 1.9:1，
/// 图标会糊进底色里；压暗后约 3.6:1，满足非文字图形 ≥3:1 的惯例。
/// 深色模式的 tint 在深底上本来就够亮，再压暗只会发脏，所以不动。
Color _legibleTint(BuildContext context, Color tint) {
  if (Theme.of(context).brightness == Brightness.dark) return tint;
  return Color.alphaBlend(Colors.black.withValues(alpha: 0.22), tint);
}

/// App 顶部的提示条（可关闭的「未验证」提示 / 不可关闭的「服务端过旧」提醒）。
///
/// 自带走自己的安全区：挂在 Navigator 之上，父级没有 Scaffold 或 AppBar 可以借。
///
/// 两种提示条**统一 48dp 高**：高度只由"最小触摸区"决定，不随内容与有无关闭按钮
/// 变化——否则同一位置换一种提示就换一个高度，界面看着像拼错了两张图。
class _NoticeBar extends StatelessWidget {
  const _NoticeBar({
    required this.icon,
    required this.tint,
    required this.text,
    this.onDismiss,
  });

  final IconData icon;
  final Color tint;
  final String text;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Material(
      color: Color.alphaBlend(tint.withValues(alpha: 0.12), scheme.surface),
      child: SafeArea(
        bottom: false,
        child: ConstrainedBox(
          // 48dp 触摸区不乘 .h：提示条的高度是可达性指标，不是版式微调。
          constraints: const BoxConstraints(minHeight: 48),
          child: Padding(
            padding: EdgeInsets.only(
              left: 16.w,
              right: onDismiss == null ? 16.w : 4.w,
            ),
            child: Row(
              children: [
                Icon(icon, size: 18.sp, color: _legibleTint(context, tint)),
                SizedBox(width: 8.w),
                Expanded(
                  child: Padding(
                    padding: EdgeInsets.symmetric(vertical: 10.h),
                    child: Text(
                      text,
                      style: TextStyle(
                        fontSize: 12.sp,
                        height: 1.4,
                        color: scheme.onSurface,
                      ),
                    ),
                  ),
                ),
                if (onDismiss != null)
                  IconButton(
                    onPressed: onDismiss,
                    icon: Icon(AppIcons.close, size: 18.sp),
                    color: scheme.onSurfaceVariant,
                    tooltip: '关闭提示',
                    padding: EdgeInsets.zero,
                    // 触摸目标 ≥48dp
                    constraints: const BoxConstraints(
                      minWidth: 48,
                      minHeight: 48,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
