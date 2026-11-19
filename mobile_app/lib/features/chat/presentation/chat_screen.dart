import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'chat_provider.dart';
import '../data/chat_repository_impl.dart';
import '../domain/chat_message.dart';

import 'package:flutter/scheduler.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import '../../../core/theme/app_icons.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/navigation/app_nav.dart';
import '../../../core/network/connectivity_provider.dart';
import '../../../core/error/user_message.dart';

class ChatScreen extends HookConsumerWidget {
  const ChatScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chatState = ref.watch(chatProvider);
    final textController = useTextEditingController();
    final scrollController = useScrollController();
    final isRagEnabled = useState(false);
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
      endDrawer: _buildEndDrawer(context, ref),
      body: Column(
        children: [
          Expanded(
            child: chatState.when(
              data: (messages) {
                if (messages.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text('🤖', style: TextStyle(fontSize: 48.sp)),
                        SizedBox(height: 16.h),
                        Text(
                          '你好，我是你的 AI 学习助手',
                          style: TextStyle(
                            color: context.colors.textSecondary,
                            fontSize: 16.sp,
                          ),
                        ),
                        Text(
                          '有什么可以帮你的吗？',
                          style: TextStyle(
                            color: context.colors.textSecondary,
                            fontSize: 14.sp,
                          ),
                        ),
                      ],
                    ),
                  );
                }

                return ListView.builder(
                  controller: scrollController,
                  padding: EdgeInsets.symmetric(
                    horizontal: 16.w,
                    vertical: 24.h,
                  ),
                  itemCount: messages.length,
                  itemBuilder: (context, index) {
                    final msg = messages[index];
                    final isUser = msg.role == 'user';
                    final isFailed = !isUser && msg.content.startsWith('⚠️');

                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _buildMessageBubble(context, isUser, msg.content),
                        // 失败消息下方显示重试按钮
                        if (isFailed && index == messages.length - 1)
                          Padding(
                            padding: EdgeInsets.only(top: 8.h, left: 8.w),
                            child: Align(
                              alignment: Alignment.centerLeft,
                              child: TextButton.icon(
                                onPressed: () {
                                  ref
                                      .read(chatProvider.notifier)
                                      .retryLastMessage();
                                },
                                icon: Icon(AppIcons.refresh, size: 16.sp),
                                label: Text(
                                  '重试',
                                  style: TextStyle(fontSize: 13.sp),
                                ),
                                style: TextButton.styleFrom(
                                  foregroundColor: context.colors.accent,
                                ),
                              ),
                            ),
                          ),
                      ],
                    );
                  },
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (err, stack) => Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      AppIcons.errorOutline,
                      size: 48.sp,
                      color: context.colors.error,
                    ),
                    SizedBox(height: 16.h),
                    Text(
                      '加载失败',
                      style: TextStyle(
                        fontSize: 16.sp,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    SizedBox(height: 8.h),
                    Text(
                      '请检查网络后重试',
                      style: TextStyle(
                        fontSize: 13.sp,
                        color: context.colors.textSecondary,
                      ),
                    ),
                    SizedBox(height: 16.h),
                    ElevatedButton.icon(
                      onPressed: () => ref.invalidate(chatProvider),
                      icon: const Icon(AppIcons.refresh, size: 16),
                      label: const Text('重试'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: context.colors.accent,
                        foregroundColor: context.colors.onAccent,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // 输入区
          Container(
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
                Padding(
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
                      Text(
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
                      SizedBox(width: 8.w),
                      SizedBox(
                        height: 24.h,
                        width: 40.w,
                        child: FittedBox(
                          fit: BoxFit.fill,
                          child: Switch(
                            value: isRagEnabled.value,
                            onChanged: (val) => isRagEnabled.value = val,
                            activeTrackColor: context.colors.accent,
                          ),
                        ),
                      ),
                    ],
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
                              ref
                                  .read(chatProvider.notifier)
                                  .sendMessage(
                                    val.trim(),
                                    enableRag: isRagEnabled.value,
                                  );
                              textController.clear();
                              // Refresh sessions list after sending a message to see the new title
                              ref.invalidate(chatSessionsProvider);
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
                      child:                     GestureDetector(
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
                          notifier.sendMessage(
                            val.trim(),
                            enableRag: isRagEnabled.value,
                          );
                          textController.clear();
                          ref.invalidate(chatSessionsProvider);
                        }
                      },
                      child: Opacity(
                        // 离线且不在生成中：发送键视觉上也「按不动」，与文案一致。
                        opacity:
                            !isOnline &&
                                !ref.watch(chatProvider.notifier).isGenerating
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

  Widget _buildEndDrawer(BuildContext context, WidgetRef ref) {
    final sessionsAsync = ref.watch(chatSessionsProvider);
    final currentSessionId = ref.watch(chatProvider.notifier).currentSessionId;

    return Drawer(
      backgroundColor: context.colors.background,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: EdgeInsets.all(16.w),
              child: Text(
                '历史对话',
                style: TextStyle(
                  fontSize: 18.sp,
                  fontWeight: FontWeight.bold,
                  color: context.colors.text,
                ),
              ),
            ),
            Divider(height: 1, color: context.colors.border),
            Expanded(
              child: sessionsAsync.when(
                data: (sessions) {
                  if (sessions.isEmpty) {
                    return Center(
                      child: Text(
                        '暂无会话记录',
                        style: TextStyle(
                          color: context.colors.textSecondary,
                          fontSize: 14.sp,
                        ),
                      ),
                    );
                  }
                  return ListView.builder(
                    itemCount: sessions.length,
                    itemBuilder: (context, index) {
                      final session = sessions[index];
                      final sessionId = session['id'].toString();
                      final isSelected = sessionId == currentSessionId;

                      return ListTile(
                        title: Text(
                          session['title'] ?? '未命名对话',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 14.sp,
                            fontWeight: isSelected
                                ? FontWeight.bold
                                : FontWeight.normal,
                            color: isSelected
                                ? context.colors.accent
                                : context.colors.text,
                          ),
                        ),
                        subtitle: Text(
                          session['updated_at']?.toString().substring(0, 10) ??
                              '',
                          style: TextStyle(
                            fontSize: 12.sp,
                            color: context.colors.textSecondary,
                          ),
                        ),
                        selected: isSelected,
                        selectedTileColor: context.colors.accentContainer,
                        onTap: () {
                          Navigator.pop(context); // Close Drawer
                          ref
                              .read(chatProvider.notifier)
                              .loadSession(sessionId);
                        },
                        trailing: IconButton(
                          tooltip: '删除对话',
                          icon: Icon(
                            AppIcons.deleteOutline,
                            size: 18.sp,
                            color: context.colors.textSecondary,
                          ),
                          onPressed: () async {
                            final confirm = await showDialog<bool>(
                              context: context,
                              builder: (c) => AlertDialog(
                                title: const Text('删除对话'),
                                content: const Text('确定要删除这条历史记录吗？'),
                                actions: [
                                  TextButton(
                                    onPressed: () => Navigator.pop(c, false),
                                    child: const Text('取消'),
                                  ),
                                  TextButton(
                                    onPressed: () => Navigator.pop(c, true),
                                    child: Text(
                                      '删除',
                                      style: TextStyle(
                                        color: context.colors.error,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            );

                            if (confirm == true) {
                              try {
                                await ref
                                    .read(chatRepositoryProvider)
                                    .deleteSession(sessionId);
                                ref.invalidate(chatSessionsProvider);
                                if (isSelected) {
                                  await ref
                                      .read(chatProvider.notifier)
                                      .createNewSession();
                                }
                              } catch (e) {
                                // 原始异常只进日志，界面只给统一文案（审计 #24）。
                                debugPrint('[Chat] 删除会话失败: $e');
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text('删除失败：${userMessageOf(e)}'),
                                    ),
                                  );
                                }
                              }
                            }
                          },
                        ),
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (error, stack) => Center(
                  child: Text(
                    '加载失败',
                    style: TextStyle(
                      color: context.colors.error,
                      fontSize: 14.sp,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMessageBubble(
    BuildContext context,
    bool isUser,
    String content,
  ) {
    return Padding(
      padding: EdgeInsets.only(bottom: 24.h),
      child: Row(
        mainAxisAlignment: isUser
            ? MainAxisAlignment.end
            : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!isUser) ...[
            CircleAvatar(
              backgroundColor: context.colors.accentContainer,
              radius: 16.r,
              child: Text('🤖', style: TextStyle(fontSize: 16.sp)),
            ),
            SizedBox(width: 12.w),
          ],

          Flexible(
            child: Container(
              padding: EdgeInsets.all(16.w),
              decoration: BoxDecoration(
                color: isUser ? context.colors.primary : context.colors.surface,
                borderRadius: BorderRadius.circular(16.r).copyWith(
                  bottomRight: isUser ? const Radius.circular(0) : null,
                  topLeft: !isUser ? const Radius.circular(0) : null,
                ),
                border: !isUser
                    ? Border.all(color: context.colors.border)
                    : null,
              ),
              child: MarkdownBody(
                data: content.isEmpty && !isUser ? '正在思考...' : content,
                styleSheet: MarkdownStyleSheet(
                  p: TextStyle(
                    color: isUser
                        ? context.colors.onPrimary
                        : context.colors.text,
                    fontSize: 15.sp,
                    height: 1.5,
                  ),
                ),
              ),
            ),
          ),

          if (isUser) ...[
            SizedBox(width: 12.w),
            CircleAvatar(
              backgroundColor: context.colors.surfaceAlt,
              radius: 16.r,
              child: Icon(
                AppIcons.person,
                size: 16.sp,
                color: context.colors.textSecondary,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
