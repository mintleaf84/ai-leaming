import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import '../../domain/chat_message.dart';
import '../chat_provider.dart';

/// 聊天消息列表（含空态与「失败后重试」入口）。
///
/// 从 `chat_screen.dart` build 里的 `ListView.builder` 原样搬出：气泡样式、
/// 失败消息只在最后一条下面给重试、以及空态的欢迎文案都逐字保留。
class ChatMessageList extends ConsumerWidget {
  const ChatMessageList({
    super.key,
    required this.messages,
    required this.scrollController,
  });

  final List<ChatMessage> messages;
  final ScrollController scrollController;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
      padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 24.h),
      itemCount: messages.length,
      itemBuilder: (context, index) {
        final msg = messages[index];
        final isUser = msg.role == 'user';
        final isFailed = !isUser && msg.content.startsWith('⚠️');

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ChatMessageBubble(isUser: isUser, content: msg.content),
            // 失败消息下方显示重试按钮
            if (isFailed && index == messages.length - 1)
              Padding(
                padding: EdgeInsets.only(top: 8.h, left: 8.w),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: () {
                      ref.read(chatProvider.notifier).retryLastMessage();
                    },
                    icon: Icon(AppIcons.refresh, size: 16.sp),
                    label: Text('重试', style: TextStyle(fontSize: 13.sp)),
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
  }
}

/// 单条消息气泡（用户靠右、助手靠左带头像）。
class ChatMessageBubble extends StatelessWidget {
  const ChatMessageBubble({
    super.key,
    required this.isUser,
    required this.content,
  });

  final bool isUser;
  final String content;

  @override
  Widget build(BuildContext context) {
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
