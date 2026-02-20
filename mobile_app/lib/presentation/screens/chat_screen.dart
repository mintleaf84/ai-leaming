import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import '../providers/chat_provider.dart';

class ChatScreen extends HookConsumerWidget {
  const ChatScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chatState = ref.watch(chatProvider);
    final textController = TextEditingController();

    // Automatically scrolling could be handled via a ScrollController later
    final scrollController = ScrollController();

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
              Icons.cleaning_services_outlined,
              color: Colors.grey,
              size: 20.sp,
            ),
            onPressed: () => ref.read(chatProvider.notifier).clearMessages(),
          ),
        ],
      ),
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
              top: 12.h,
              bottom: MediaQuery.of(context).padding.bottom + 12.h,
            ),
            decoration: BoxDecoration(
              color: Colors.white,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.05),
                  offset: const Offset(0, -4),
                  blurRadius: 8,
                ),
              ],
            ),
            child: Row(
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
                              .sendMessage(val.trim());
                          textController.clear();
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
                      ref.read(chatProvider.notifier).sendMessage(val.trim());
                      textController.clear();

                      // Auto scroll to bottom
                      Future.delayed(const Duration(milliseconds: 100), () {
                        if (scrollController.hasClients) {
                          scrollController.animateTo(
                            scrollController.position.maxScrollExtent + 200,
                            duration: const Duration(milliseconds: 300),
                            curve: Curves.easeOut,
                          );
                        }
                      });
                    }
                  },
                  child: Container(
                    padding: EdgeInsets.all(12.w),
                    decoration: const BoxDecoration(
                      color: Color(0xFF37352F),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(Icons.send, color: Colors.white, size: 20.sp),
                  ),
                ),
              ],
            ),
          ),
        ],
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
