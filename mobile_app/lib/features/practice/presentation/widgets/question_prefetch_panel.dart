import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import '../question_prefetch_provider.dart';

/// 设置页「题库预下载」。
///
/// 展示三件事：本地已缓存多少题、服务端一共多少题、本地题库是第几版；
/// 一个按钮完成「开始 / 继续 / 暂停 / 重新下载」。
///
/// 为什么把「本地 / 服务端 / 版本」写在同一行：只显示「已缓存 N 题」时，
/// 用户无法判断是「只剩这几题」还是「还没下完」。服务端总数给出了分母，
/// 版本号给出「这份题库完整刷新过几次」。
class QuestionPrefetchPanel extends ConsumerWidget {
  const QuestionPrefetchPanel({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.colors;
    final state = ref.watch(questionPrefetchControllerProvider);
    final controller = ref.read(questionPrefetchControllerProvider.notifier);

    final String statusText;
    switch (state.status) {
      case PrefetchStatus.running:
        statusText = state.totalPages > 0
            ? '下载中 ${state.pagesDone}/${state.totalPages} 页'
            : '下载中…';
      case PrefetchStatus.done:
        statusText = '已下载';
      case PrefetchStatus.failed:
        statusText = '下载中断';
      case PrefetchStatus.idle:
        statusText = state.isPartial
            ? '已下载 ${state.pagesDone}/${state.totalPages} 页'
            : '未下载';
    }

    final serverPart = state.serverTotal > 0 ? '${state.serverTotal}' : '未获取';

    final String actionLabel;
    VoidCallback? action;
    switch (state.status) {
      case PrefetchStatus.running:
        actionLabel = '暂停';
        action = controller.cancel;
      case PrefetchStatus.done:
        actionLabel = '重新下载';
        action = () => controller.start();
      case PrefetchStatus.failed:
        actionLabel = '继续下载';
        action = () => controller.start();
      case PrefetchStatus.idle:
        actionLabel = state.isPartial ? '继续下载' : '开始下载';
        action = () => controller.start();
    }

    return Padding(
      padding: EdgeInsets.fromLTRB(14.w, 12.h, 14.w, 14.h),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(AppIcons.libraryBooks, size: 22.sp, color: colors.text),
              SizedBox(width: 12.w),
              Expanded(
                child: Text(
                  '题库预下载',
                  style: TextStyle(
                    fontSize: 15.sp,
                    fontWeight: FontWeight.w500,
                    color: colors.text,
                  ),
                ),
              ),
              Text(
                statusText,
                key: const ValueKey('prefetch-status'),
                style: TextStyle(fontSize: 14.sp, color: colors.textSecondary),
              ),
            ],
          ),
          SizedBox(height: 6.h),
          Text(
            '本地 ${state.localCount} 题 / 服务端 $serverPart 题 / 版本 ${state.versionLabel}',
            key: const ValueKey('prefetch-summary'),
            style: TextStyle(fontSize: 13.sp, color: colors.textSecondary),
          ),
          if (state.isRunning)
            Padding(
              padding: EdgeInsets.only(top: 8.h),
              child: LinearProgressIndicator(
                value: state.progress,
                minHeight: 4.h,
                backgroundColor: colors.surfaceAlt,
              ),
            ),
          if (state.error != null)
            Padding(
              padding: EdgeInsets.only(top: 6.h),
              child: Text(
                state.error!,
                key: const ValueKey('prefetch-error'),
                style: TextStyle(fontSize: 13.sp, color: colors.error),
              ),
            ),
          Padding(
            padding: EdgeInsets.only(top: 10.h),
            child: FilledButton.tonal(
              onPressed: action,
              child: Text(actionLabel),
            ),
          ),
        ],
      ),
    );
  }
}
