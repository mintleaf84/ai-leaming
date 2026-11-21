import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../../../../core/error/user_message.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import '../chat_provider.dart';
import '../../data/chat_repository_impl.dart';

/// 聊天页右侧的历史会话抽屉。
///
/// 从 `chat_screen.dart` 的 `_buildEndDrawer` 原样搬出：加载/空/失败三态、
/// 删除前确认、删除后刷新列表与「删的是当前会话就新开一个」都保持不变。
class ChatEndDrawer extends ConsumerWidget {
  const ChatEndDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
}
