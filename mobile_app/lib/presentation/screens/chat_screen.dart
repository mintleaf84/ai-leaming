import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import '../providers/chat_provider.dart';
import '../../data/repositories/chat_repository_impl.dart';
import '../../domain/entities/chat_message.dart';

import 'package:flutter/scheduler.dart';
import 'package:flutter_hooks/flutter_hooks.dart';

class ChatScreen extends HookConsumerWidget {
  const ChatScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chatState = ref.watch(chatProvider);
    final textController = useTextEditingController();
    final scrollController = useScrollController();
    final isRagEnabled = useState(false);

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
      backgroundColor: const Color(0xFFF7F7F5),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: Icon(
            Icons.arrow_back_ios,
            color: const Color(0xFF37352F),
            size: 20.sp,
          ),
          onPressed: () => context.go('/dashboard'),
        ),
        title: Text(
          '智能教研助手',
          style: TextStyle(
            color: const Color(0xFF37352F),
            fontSize: 18.sp,
            fontWeight: FontWeight.bold,
          ),
        ),
        actions: [
          IconButton(
            icon: Icon(
              Icons.add_circle_outline,
              color: const Color(0xFF37352F),
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
                Icons.history,
                color: const Color(0xFF37352F),
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
                          style: TextStyle(color: Colors.grey, fontSize: 16.sp),
                        ),
                        Text(
                          '有什么可以帮你的吗？',
                          style: TextStyle(color: Colors.grey, fontSize: 14.sp),
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

                    return _buildMessageBubble(isUser, msg.content);
                  },
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (err, stack) => Center(child: Text('错误：$err')),
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
              color: Colors.white,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.05),
                  offset: const Offset(0, -4),
                  blurRadius: 8,
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // RAG Toggle
                Padding(
                  padding: EdgeInsets.only(bottom: 8.h, left: 4.w),
                  child: Row(
                    children: [
                      Icon(
                        Icons.library_books,
                        size: 14.sp,
                        color: isRagEnabled.value
                            ? const Color(0xFF135BEC)
                            : Colors.grey,
                      ),
                      SizedBox(width: 4.w),
                      Text(
                        '检索知识库以增强回答',
                        style: TextStyle(
                          fontSize: 12.sp,
                          color: isRagEnabled.value
                              ? const Color(0xFF135BEC)
                              : Colors.grey,
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
                            activeColor: const Color(0xFF135BEC),
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
                          color: const Color(0xFFF0F0F0),
                          borderRadius: BorderRadius.circular(24.r),
                        ),
                        child: TextField(
                          controller: textController,
                          decoration: InputDecoration(
                            hintText: '输入你想问的问题...',
                            hintStyle: TextStyle(
                              color: Colors.grey,
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
                    GestureDetector(
                      onTap: () {
                        final val = textController.text;
                        if (val.trim().isNotEmpty) {
                          ref
                              .read(chatProvider.notifier)
                              .sendMessage(
                                val.trim(),
                                enableRag: isRagEnabled.value,
                              );
                          textController.clear();
                          ref.invalidate(chatSessionsProvider);
                        }
                      },
                      child: Container(
                        padding: EdgeInsets.all(12.w),
                        decoration: const BoxDecoration(
                          color: Color(0xFF37352F),
                          shape: BoxShape.circle,
                        ),
                        child: chatState is AsyncLoading
                            ? SizedBox(
                                width: 20.sp,
                                height: 20.sp,
                                child: const CircularProgressIndicator(
                                  color: Colors.white,
                                  strokeWidth: 2,
                                ),
                              )
                            : Icon(
                                Icons.send,
                                color: Colors.white,
                                size: 20.sp,
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

  Widget _buildEndDrawer(BuildContext context, WidgetRef ref) {
    final sessionsAsync = ref.watch(chatSessionsProvider);
    final currentSessionId = ref.watch(chatProvider.notifier).currentSessionId;

    return Drawer(
      backgroundColor: const Color(0xFFF7F7F5),
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
                  color: const Color(0xFF37352F),
                ),
              ),
            ),
            Divider(height: 1, color: Colors.grey[300]),
            Expanded(
              child: sessionsAsync.when(
                data: (sessions) {
                  if (sessions.isEmpty) {
                    return Center(
                      child: Text(
                        '暂无会话记录',
                        style: TextStyle(color: Colors.grey, fontSize: 14.sp),
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
                                ? const Color(0xFF135BEC)
                                : const Color(0xFF37352F),
                          ),
                        ),
                        subtitle: Text(
                          session['updated_at']?.toString().substring(0, 10) ??
                              '',
                          style: TextStyle(fontSize: 12.sp, color: Colors.grey),
                        ),
                        selected: isSelected,
                        selectedTileColor: const Color(0xFFE8F3FF),
                        onTap: () {
                          Navigator.pop(context); // Close Drawer
                          ref
                              .read(chatProvider.notifier)
                              .loadSession(sessionId);
                        },
                        trailing: IconButton(
                          icon: Icon(
                            Icons.delete_outline,
                            size: 18.sp,
                            color: Colors.grey,
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
                                    child: const Text(
                                      '删除',
                                      style: TextStyle(color: Colors.red),
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
                                  ref
                                      .read(chatProvider.notifier)
                                      .createNewSession();
                                }
                              } catch (e) {
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(content: Text('删除失败: $e')),
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
                    style: TextStyle(color: Colors.red, fontSize: 14.sp),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMessageBubble(bool isUser, String content) {
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
              backgroundColor: const Color(0xFFE8F3FF),
              radius: 16.r,
              child: Text('🤖', style: TextStyle(fontSize: 16.sp)),
            ),
            SizedBox(width: 12.w),
          ],

          Flexible(
            child: Container(
              padding: EdgeInsets.all(16.w),
              decoration: BoxDecoration(
                color: isUser ? const Color(0xFF37352F) : Colors.white,
                borderRadius: BorderRadius.circular(16.r).copyWith(
                  bottomRight: isUser ? const Radius.circular(0) : null,
                  topLeft: !isUser ? const Radius.circular(0) : null,
                ),
                border: !isUser
                    ? Border.all(color: const Color(0xFFE0E0E0))
                    : null,
              ),
              child: MarkdownBody(
                data: content.isEmpty && !isUser ? '正在思考...' : content,
                styleSheet: MarkdownStyleSheet(
                  p: TextStyle(
                    color: isUser ? Colors.white : const Color(0xFF37352F),
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
              backgroundColor: const Color(0xFFF0F0F0),
              radius: 16.r,
              child: Icon(Icons.person, size: 16.sp, color: Colors.grey),
            ),
          ],
        ],
      ),
    );
  }
}
