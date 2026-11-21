import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// 页内的成功/失败提示条（不留 SnackBar 的 4 秒，确认结果要一直看得见）。
///
/// 从 `draft_review_screen.dart` 原样搬出，参数仍是显式的四种颜色/图标/文案。
class DraftBanner extends StatelessWidget {
  const DraftBanner({
    super.key,
    required this.background,
    required this.foreground,
    required this.icon,
    required this.message,
  });

  final Color background;
  final Color foreground;
  final IconData icon;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: EdgeInsets.fromLTRB(16.w, 8.h, 16.w, 0),
      padding: EdgeInsets.all(12.w),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(8.r),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18.sp, color: foreground),
          SizedBox(width: 8.w),
          Expanded(
            child: Text(
              message,
              style: TextStyle(fontSize: 13.sp, color: foreground),
            ),
          ),
        ],
      ),
    );
  }
}
