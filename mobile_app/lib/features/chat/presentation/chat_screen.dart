import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../../../core/navigation/app_nav.dart';
import '../../../core/network/connectivity_provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_icons.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/chat_message.dart';
import 'chat_provider.dart';
import 'widgets/chat_end_drawer.dart';
import 'widgets/chat_input_bar.dart';
import 'widgets/chat_message_list.dart';

/// 聊天页。
///
/// 本文件只剩 AppBar、消息区三态与「新消息 → 自动滚到底部」；输入区、消息列表
/// 与历史抽屉都在 `widgets/` 下（纯搬移）。
class ChatScreen extends HookConsumerWidget {
  const ChatScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chatState = ref.watch(chatProvider);
    final scrollController = useScrollController();
    // 离线判定（审计 #20）：loading 按在线处理，理由见 connectivity_provider.dart。
    final isOnline = ref.watch(isOnlineProvider).value ?? true;

    // 监听消息变化，并在绘制下一帧时自动滚到最底部
    ref.listen<AsyncValue<List<ChatMessage>>>(chatProvider, (previous, next) {
      if (next is AsyncData && next.value != null && next.value!.isNotEmpty) {
        SchedulerBinding.instance.addPostFrameCallback((_) {
          if (scrollController.hasClients) {
            scrollController.animateTo(
              scrollController.position.maxScrollExtent,
              duration: const Duration(milliseconds: 150),
              curve: Curves.easeOut,
            );
          }
        });
      }
    });

    return Scaffold(
      backgroundColor: context.colors.background,
      appBar: AppBar(
        elevation: 0,
        leading: IconButton(
          tooltip: '返回',
          icon: Icon(
            AppIcons.arrowBackIos,
            color: context.colors.text,
            size: 20.sp,
          ),
          onPressed: () => context.backOrHome(),
        ),
        title: Text(
          '智能教研助手',
          style: TextStyle(
            color: context.colors.text,
            fontSize: 18.sp,
            fontWeight: FontWeight.bold,
          ),
        ),
        actions: [
          IconButton(
            icon: Icon(
              AppIcons.addCircleOutline,
              color: context.colors.text,
              size: 22.sp,
            ),
            onPressed: () {
              ref.read(chatProvider.notifier).createNewSession();
            },
            tooltip: '新对话',
          ),
          Builder(
            builder: (context) => IconButton(
              icon: Icon(
                AppIcons.history,
                color: context.colors.text,
                size: 22.sp,
              ),
              onPressed: () => Scaffold.of(context).openEndDrawer(),
              tooltip: '历史记录',
            ),
          ),
          SizedBox(width: 8.w),
        ],
      ),
      endDrawer: const ChatEndDrawer(),
      body: Column(
        children: [
          Expanded(
            child: chatState.when(
              data: (messages) => ChatMessageList(
                messages: messages,
                scrollController: scrollController,
              ),
              loading: () => const Center(child: CircularProgressIndicator()),
              // 统一错误态（审计 #9）：不再本屏自写一套图标/字号/按钮。
              error: (err, stack) => AppErrorView(
                message: '会话没加载出来，请检查网络后重试',
                onRetry: () => ref.invalidate(chatProvider),
              ),
            ),
          ),

          // 输入区
          ChatInputBar(
            isOnline: isOnline,
            onSend: (text, enableRag) {
              ref
                  .read(chatProvider.notifier)
                  .sendMessage(text, enableRag: enableRag);
              // Refresh sessions list after sending a message to see the new title
              ref.invalidate(chatSessionsProvider);
            },
          ),
        ],
      ),
    );
  }
}
