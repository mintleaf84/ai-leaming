import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';

/// 未读数角标（首页入口、列表卡共用）。
///
/// 用 `error` 系而不是主题色：全长一个颜色的角标等于没有角标。数值为 0 时
/// 整块不渲染——留一个「0」比不留更难看，也让人以为还有别的东西要看。
class AgentSetUnreadBadge extends StatelessWidget {
  const AgentSetUnreadBadge({super.key, required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    if (count <= 0) return const SizedBox.shrink();
    // 三位数会把角标撑成一条长条，99 以上折叠。
    final label = count > 99 ? '99+' : '$count';
    return Semantics(
      label: '$count 道未读',
      excludeSemantics: true,
      child: Container(
        constraints: BoxConstraints(minWidth: 18.w, minHeight: 18.h),
        padding: EdgeInsets.symmetric(horizontal: 5.w, vertical: 1.h),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: context.colors.error,
          borderRadius: BorderRadius.circular(9.r),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11.sp,
            height: 1.2,
            fontWeight: FontWeight.w700,
            color: context.colors.onError,
          ),
        ),
      ),
    );
  }
}
