import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// 带动画效果的选项卡片
///
/// 支持以下动画效果：
/// - 点击时轻微缩放
/// - 答对时绿色弹跳
/// - 答错时红色抖动
/// - 触感反馈
class AnimatedOptionCard extends StatefulWidget {
  final String label;
  final String text;
  final bool isSelected;
  final bool isCorrect;
  final bool isWrong;
  final bool isMultiSelect;
  final bool showCorrectHint;
  final VoidCallback? onTap;

  const AnimatedOptionCard({
    super.key,
    required this.label,
    required this.text,
    required this.isSelected,
    required this.isCorrect,
    required this.isWrong,
    this.isMultiSelect = false,
    this.showCorrectHint = false,
    this.onTap,
  });

  @override
  State<AnimatedOptionCard> createState() => _AnimatedOptionCardState();
}

class _AnimatedOptionCardState extends State<AnimatedOptionCard>
    with TickerProviderStateMixin {
  // 缩放动画控制器
  late AnimationController _scaleController;
  late Animation<double> _scaleAnimation;

  // 抖动动画控制器
  late AnimationController _shakeController;
  late Animation<double> _shakeAnimation;

  // 弹跳动画控制器
  late AnimationController _bounceController;
  late Animation<double> _bounceAnimation;

  @override
  void initState() {
    super.initState();

    // 缩放动画 (点击时)
    _scaleController = AnimationController(
      duration: const Duration(milliseconds: 100),
      vsync: this,
    );
    _scaleAnimation = Tween<double>(begin: 1.0, end: 0.97).animate(
      CurvedAnimation(parent: _scaleController, curve: Curves.easeInOut),
    );

    // 抖动动画 (答错时)
    _shakeController = AnimationController(
      duration: const Duration(milliseconds: 400),
      vsync: this,
    );
    _shakeAnimation = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _shakeController, curve: Curves.elasticIn),
    );

    // 弹跳动画 (答对时)
    _bounceController = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );
    _bounceAnimation = Tween<double>(begin: 1.0, end: 1.05).animate(
      CurvedAnimation(parent: _bounceController, curve: Curves.elasticOut),
    );
  }

  @override
  void didUpdateWidget(AnimatedOptionCard oldWidget) {
    super.didUpdateWidget(oldWidget);

    // 答对时触发弹跳动画
    if (widget.isCorrect && !oldWidget.isCorrect) {
      _triggerBounce();
      HapticFeedback.mediumImpact();
    }

    // 答错时触发抖动动画
    if (widget.isWrong && !oldWidget.isWrong) {
      _triggerShake();
      HapticFeedback.heavyImpact();
    }
  }

  void _triggerBounce() {
    _bounceController.forward().then((_) {
      _bounceController.reverse();
    });
  }

  void _triggerShake() {
    _shakeController.forward().then((_) {
      _shakeController.reset();
    });
  }

  @override
  void dispose() {
    _scaleController.dispose();
    _shakeController.dispose();
    _bounceController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([
        _scaleAnimation,
        _shakeAnimation,
        _bounceAnimation,
      ]),
      builder: (context, child) {
        // 计算抖动偏移
        final shakeOffset = _shakeController.isAnimating
            ? 8 *
                  (0.5 - _shakeAnimation.value).abs() *
                  (_shakeAnimation.value > 0.5 ? 1 : -1)
            : 0.0;

        // 计算缩放
        double scale = _scaleAnimation.value;
        if (_bounceController.isAnimating) {
          scale = _bounceAnimation.value;
        }

        return Transform.translate(
          offset: Offset(shakeOffset, 0),
          child: Transform.scale(scale: scale, child: child),
        );
      },
      child: GestureDetector(
        onTapDown: widget.onTap != null
            ? (_) {
                _scaleController.forward();
                HapticFeedback.lightImpact();
              }
            : null,
        onTapUp: widget.onTap != null
            ? (_) {
                _scaleController.reverse();
              }
            : null,
        onTapCancel: widget.onTap != null
            ? () {
                _scaleController.reverse();
              }
            : null,
        onTap: widget.onTap,
        child: _buildCard(),
      ),
    );
  }

  Widget _buildCard() {
    Color bgColor = Colors.white;
    Color borderColor = const Color(0xFFE1E1E1);
    Color? ringColor;
    Widget? leadingIcon;

    if (widget.isCorrect) {
      bgColor = const Color(0xFFEDF6EE);
      borderColor = const Color(0xFF5C9D6E).withValues(alpha: 0.3);
      ringColor = const Color(0xFF5C9D6E).withValues(alpha: 0.5);
      leadingIcon = Container(
        width: 20.w,
        height: 20.h,
        decoration: BoxDecoration(
          color: const Color(0xFF4EA05E),
          shape: widget.isMultiSelect ? BoxShape.rectangle : BoxShape.circle,
          borderRadius: widget.isMultiSelect
              ? BorderRadius.circular(4.r)
              : null,
        ),
        child: Icon(Icons.check, size: 14.sp, color: Colors.white),
      );
    } else if (widget.isWrong) {
      bgColor = const Color(0xFFFBE4E4);
      borderColor = const Color(0xFFE06C75).withValues(alpha: 0.3);
      ringColor = const Color(0xFFE06C75).withValues(alpha: 0.5);
      leadingIcon = Container(
        width: 20.w,
        height: 20.h,
        decoration: BoxDecoration(
          color: const Color(0xFFD95656),
          shape: widget.isMultiSelect ? BoxShape.rectangle : BoxShape.circle,
          borderRadius: widget.isMultiSelect
              ? BorderRadius.circular(4.r)
              : null,
        ),
        child: Icon(Icons.close, size: 14.sp, color: Colors.white),
      );
    } else if (widget.showCorrectHint && !widget.isSelected) {
      // 未选中但是正确答案（多选时提示用户漏选）
      bgColor = const Color(0xFFF0F9F1);
      borderColor = const Color(0xFF5C9D6E).withValues(alpha: 0.2);
      leadingIcon = Container(
        width: 20.w,
        height: 20.h,
        decoration: BoxDecoration(
          border: Border.all(color: const Color(0xFF4EA05E), width: 1.5),
          shape: widget.isMultiSelect ? BoxShape.rectangle : BoxShape.circle,
          borderRadius: widget.isMultiSelect
              ? BorderRadius.circular(4.r)
              : null,
        ),
        child: Icon(Icons.check, size: 12.sp, color: const Color(0xFF4EA05E)),
      );
    } else if (widget.isSelected) {
      borderColor = const Color(0xFF37352F).withValues(alpha: 0.4);
      leadingIcon = Container(
        width: 20.w,
        height: 20.h,
        decoration: BoxDecoration(
          color: const Color(0xFF37352F),
          shape: widget.isMultiSelect ? BoxShape.rectangle : BoxShape.circle,
          borderRadius: widget.isMultiSelect
              ? BorderRadius.circular(4.r)
              : null,
        ),
        child: Icon(
          widget.isMultiSelect ? Icons.check : Icons.circle,
          size: widget.isMultiSelect ? 14.sp : 10.sp,
          color: Colors.white,
        ),
      );
    } else {
      leadingIcon = Container(
        width: 20.w,
        height: 20.h,
        decoration: BoxDecoration(
          border: Border.all(
            color: const Color(0xFF37352F).withValues(alpha: 0.2),
          ),
          shape: widget.isMultiSelect ? BoxShape.rectangle : BoxShape.circle,
          borderRadius: widget.isMultiSelect
              ? BorderRadius.circular(4.r)
              : null,
        ),
      );
    }

    return Container(
      margin: EdgeInsets.only(bottom: 12.h),
      padding: EdgeInsets.all(14.w),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(8.r),
        border: Border.all(color: borderColor),
        boxShadow: ringColor != null
            ? [BoxShadow(color: ringColor, blurRadius: 0, spreadRadius: 1)]
            : null,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: EdgeInsets.only(top: 2.h),
            child: leadingIcon,
          ),
          SizedBox(width: 12.w),
          Expanded(
            child: Text(
              '${widget.label}. ${widget.text}',
              style: TextStyle(
                fontSize: 15.sp,
                fontWeight: FontWeight.w500,
                color: const Color(0xFF37352F),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
