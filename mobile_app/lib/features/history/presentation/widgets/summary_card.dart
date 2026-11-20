import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:intl/intl.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_icons.dart';
import '../../domain/history_item.dart';

/// 练习摘要卡：时间、正确率环、答对/答错/总题数。
///
/// 从 `history_detail_screen` 原样搬出（清单模式与沉浸模式的第 0 页共用）。
class HistorySummaryCard extends StatelessWidget {
  const HistorySummaryCard({
    super.key,
    required this.session,
    required this.cardColor,
    required this.textColor,
    required this.secondaryColor,
  });

  final HistoryItem session;
  final Color cardColor;
  final Color textColor;
  final Color secondaryColor;

  @override
  Widget build(BuildContext context) {
    String formattedTime = '';
    try {
      final dateTime = DateTime.parse(session.createdAt);
      formattedTime = DateFormat('yyyy年MM月dd日 HH:mm').format(dateTime);
    } catch (_) {
      formattedTime = session.createdAt;
    }

    final accuracy = session.accuracy / 100.0;
    final accuracyColor = _accuracyColor(context, session.accuracy);

    return Hero(
      tag: 'history_item_${session.id}',
      child: Container(
        padding: EdgeInsets.all(20.w),
        decoration: BoxDecoration(
          color: cardColor,
          borderRadius: BorderRadius.circular(16.r),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          children: [
            Row(
              children: [
                Icon(AppIcons.accessTime, size: 16.sp, color: secondaryColor),
                SizedBox(width: 6.w),
                Text(
                  formattedTime,
                  style: TextStyle(
                    fontSize: 13.sp,
                    color: secondaryColor,
                    decoration: TextDecoration.none,
                  ),
                ),
              ],
            ),
            SizedBox(height: 20.h),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                SizedBox(
                  width: 100.w,
                  height: 100.h,
                  child: CustomPaint(
                    painter: _CircularProgressPainter(
                      progress: accuracy,
                      progressColor: accuracyColor,
                      backgroundColor: secondaryColor.withValues(alpha: 0.2),
                      strokeWidth: 8.w,
                    ),
                    child: Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            '${session.accuracy}%',
                            style: TextStyle(
                              fontSize: 24.sp,
                              fontWeight: FontWeight.bold,
                              color: accuracyColor,
                              decoration: TextDecoration.none,
                            ),
                          ),
                          Text(
                            '正确率',
                            style: TextStyle(
                              fontSize: 12.sp,
                              color: secondaryColor,
                              decoration: TextDecoration.none,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _StatRow(
                      label: '✓ 答对',
                      value: '${session.correctCount}',
                      labelColor: context.colors.success,
                      valueColor: textColor,
                    ),
                    SizedBox(height: 8.h),
                    _StatRow(
                      label: '✗ 答错',
                      value: '${session.totalQuestions - session.correctCount}',
                      labelColor: context.colors.error,
                      valueColor: textColor,
                    ),
                    SizedBox(height: 8.h),
                    _StatRow(
                      label: '总题数',
                      value: '${session.totalQuestions}',
                      labelColor: secondaryColor,
                      valueColor: textColor,
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Color _accuracyColor(BuildContext context, int accuracy) {
    if (accuracy >= 80) return context.colors.success;
    if (accuracy >= 60) return context.colors.warning;
    return context.colors.error;
  }
}

class _StatRow extends StatelessWidget {
  const _StatRow({
    required this.label,
    required this.value,
    required this.labelColor,
    required this.valueColor,
  });

  final String label;
  final String value;
  final Color labelColor;
  final Color valueColor;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          label,
          style: TextStyle(fontSize: 13.sp, color: labelColor),
        ),
        SizedBox(width: 12.w),
        Text(
          value,
          style: TextStyle(
            fontSize: 18.sp,
            fontWeight: FontWeight.bold,
            color: valueColor,
          ),
        ),
      ],
    );
  }
}

class _CircularProgressPainter extends CustomPainter {
  final double progress;
  final Color progressColor;
  final Color backgroundColor;
  final double strokeWidth;

  _CircularProgressPainter({
    required this.progress,
    required this.progressColor,
    required this.backgroundColor,
    required this.strokeWidth,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.width - strokeWidth) / 2;

    final bgPaint = Paint()
      ..color = backgroundColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;
    canvas.drawCircle(center, radius, bgPaint);

    final progressPaint = Paint()
      ..color = progressColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -math.pi / 2,
      2 * math.pi * progress,
      false,
      progressPaint,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}
