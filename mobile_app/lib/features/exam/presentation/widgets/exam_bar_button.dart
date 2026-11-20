import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/app_colors.dart';

/// 底部动作按钮（上一题/答题卡/下一题共用）。
class ExamBarButton extends StatelessWidget {
  const ExamBarButton({
    super.key,
    required this.label,
    required this.icon,
    required this.colors,
    required this.onPressed,
    this.trailingIcon = false,
  });

  final String label;
  final IconData icon;
  final AppColors colors;
  final VoidCallback? onPressed;
  final bool trailingIcon;

  @override
  Widget build(BuildContext context) {
    final children = <Widget>[
      Icon(icon, size: 16.sp),
      SizedBox(width: 2.w),
      Flexible(
        child: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(fontSize: 13.sp, fontWeight: FontWeight.w500),
        ),
      ),
    ];
    return SizedBox(
      height: 44,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: colors.text,
          side: BorderSide(color: colors.border),
          padding: EdgeInsets.symmetric(horizontal: 6.w),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10.r),
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: trailingIcon
              ? children.reversed.toList(growable: false)
              : children,
        ),
      ),
    );
  }
}
