import 'package:flutter/material.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import '../chat_provider.dart';

/// 聊天输入区：离线提示 + RAG 开关 + 输入框 + 发送/停止。
///
/// 从 `chat_screen.dart` 的输入区原样搬出。输入框控制器与 RAG 开关原本就是
/// build 里的 hook，随这块 UI 一起搬进本控件（作用域一致）；发送动作仍由屏注入
/// [onSend]（屏还要负责刷新会话列表）。
class ChatInputBar extends HookConsumerWidget {
  const ChatInputBar({
    super.key,
    required this.isOnline,
    required this.onSend,
  });

  final bool isOnline;

  /// 发送一条**已 trim 且非空**的消息。
  final void Function(String text, bool enableRag) onSend;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final textController = useTextEditingController();
    final isRagEnabled = useState(false);

    return Container(
      padding: EdgeInsets.only(
        left: 16.w,
        right: 16.w,
        top: 8.h,
        bottom: MediaQuery.of(context).padding.bottom + 12.h,
      ),
      decoration: BoxDecoration(
        color: context.colors.surface,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            offset: const Offset(0, -4),
            blurRadius: 8,
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 离线提示（审计 #20 方案 A）：断网时发送会被拦下，所以先在输入区
          // 上方说明原因，而不是让用户点一下才发现发不出去。
          if (!isOnline)
            Padding(
              padding: EdgeInsets.only(bottom: 8.h, left: 4.w),
              child: Row(
                children: [
                  Icon(
                    AppIcons.cloudOffOutlined,
                    size: 14.sp,
                    color: context.colors.warning,
                  ),
                  SizedBox(width: 4.w),
                  Expanded(
                    child: Text(
                      '当前离线，发送已暂停，联网后自动恢复',
                      style: TextStyle(
                        fontSize: 12.sp,
                        color: context.colors.warning,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          // RAG Toggle
          // 整行可点（原来只有 40×24 的开关能点，旁边文字点不动），
          // 命中区撑到 ≥44 高；开关只保留视觉，点击统一由本行处理，
          // 避免开关与 InkWell 抢手势导致「点一次跳两下」。
          Semantics(
            container: true,
            toggled: isRagEnabled.value,
            label: '检索知识库以增强回答',
            child: InkWell(
              onTap: () => isRagEnabled.value = !isRagEnabled.value,
              borderRadius: BorderRadius.circular(8.r),
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 44),
                child: Padding(
                  padding: EdgeInsets.only(bottom: 8.h, left: 4.w),
                  child: Row(
                    children: [
                      Icon(
                        AppIcons.libraryBooks,
                        size: 14.sp,
                        color: isRagEnabled.value
                            ? context.colors.accent
                            : context.colors.textSecondary,
                      ),
                      SizedBox(width: 4.w),
                      Expanded(
                        child: Text(
                          '检索知识库以增强回答',
                          style: TextStyle(
                            fontSize: 12.sp,
                            color: isRagEnabled.value
                                ? context.colors.accent
                                : context.colors.textSecondary,
                            fontWeight: isRagEnabled.value
                                ? FontWeight.bold
                                : FontWeight.normal,
                          ),
                        ),
                      ),
                      SizedBox(width: 8.w),
                      SizedBox(
                        height: 24.h,
                        width: 40.w,
                        // 开关只做视觉：语义与点击都由整行负责，
                        // 否则读屏会把「可切换」播报两遍。
                        child: ExcludeSemantics(
                          child: IgnorePointer(
                            child: FittedBox(
                              fit: BoxFit.fill,
                              child: Switch(
                                value: isRagEnabled.value,
                                onChanged: (val) => isRagEnabled.value = val,
                                activeTrackColor: context.colors.accent,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          Row(
            children: [
              Expanded(
                child: Container(
                  decoration: BoxDecoration(
                    color: context.colors.surfaceAlt,
                    borderRadius: BorderRadius.circular(24.r),
                  ),
                  child: TextField(
                    controller: textController,
                    decoration: InputDecoration(
                      hintText: '输入你想问的问题...',
                      hintStyle: TextStyle(
                        color: context.colors.textSecondary,
                        fontSize: 14.sp,
                      ),
                      border: InputBorder.none,
                      contentPadding: EdgeInsets.symmetric(
                        horizontal: 20.w,
                        vertical: 12.h,
                      ),
                    ),
                    maxLines: null,
                    onSubmitted: (val) {
                      if (!isOnline) {
                        _showOfflineSendHint(context);
                        return;
                      }
                      if (val.trim().isNotEmpty) {
                        onSend(val.trim(), isRagEnabled.value);
                        textController.clear();
                      }
                    },
                  ),
                ),
              ),
              SizedBox(width: 12.w),
              Semantics(
                button: true,
                label: ref.watch(chatProvider.notifier).isGenerating
                    ? '停止生成'
                    : '发送消息',
                child: GestureDetector(
                  onTap: () {
                    final notifier = ref.read(chatProvider.notifier);
                    // 生成中 → 停止；否则 → 发送
                    if (notifier.isGenerating) {
                      notifier.stopGeneration();
                      return;
                    }
                    // 离线不发：发了也只会在列表里留下一条空的 assistant 占位
                    // 和一句 ⚠️，不如直接说清楚「等联网」。
                    if (!isOnline) {
                      _showOfflineSendHint(context);
                      return;
                    }
                    final val = textController.text;
                    if (val.trim().isNotEmpty) {
                      onSend(val.trim(), isRagEnabled.value);
                      textController.clear();
                    }
                  },
                  child: Opacity(
                    // 离线且不在生成中：发送键视觉上也「按不动」，与文案一致。
                    opacity:
                        !isOnline && !ref.watch(chatProvider.notifier).isGenerating
                        ? 0.5
                        : 1,
                    child: Container(
                      padding: EdgeInsets.all(12.w),
                      decoration: BoxDecoration(
                        color: ref.watch(chatProvider.notifier).isGenerating
                            ? context.colors.error
                            : context.colors.primary,
                        shape: BoxShape.circle,
                      ),
                      child: ref.watch(chatProvider.notifier).isGenerating
                          ? Icon(
                              AppIcons.stop,
                              color: context.colors.onError,
                              size: 20.sp,
                            )
                          : Icon(
                              AppIcons.send,
                              color: context.colors.onPrimary,
                              size: 20.sp,
                            ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// 离线时点发送的即时反馈。
  ///
  /// 输入区上方已经有一条常驻说明；这里再给一次 SnackBar，是因为用户往往直接
  /// 盯输入框和发送键，不看上方那行小字。
  void _showOfflineSendHint(BuildContext context) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(content: Text('当前离线，联网后才能发送消息')));
  }
}
