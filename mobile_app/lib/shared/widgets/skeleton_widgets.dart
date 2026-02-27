import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// Shimmer 动画基础组件
/// 不依赖三方库，纯 Flutter 实现
class _ShimmerBox extends StatelessWidget {
  final double width;
  final double height;
  final double borderRadius;

  const _ShimmerBox({
    required this.width,
    required this.height,
    this.borderRadius = 6,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: const Color(0xFFE8E8E5),
        borderRadius: BorderRadius.circular(borderRadius),
      ),
    );
  }
}

/// Shimmer 动画包装器
class ShimmerWrap extends StatefulWidget {
  final Widget child;

  const ShimmerWrap({super.key, required this.child});

  @override
  State<ShimmerWrap> createState() => _ShimmerWrapState();
}

class _ShimmerWrapState extends State<ShimmerWrap>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return ShaderMask(
          shaderCallback: (bounds) {
            return LinearGradient(
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
              colors: const [
                Color(0xFFE8E8E5),
                Color(0xFFF5F5F3),
                Color(0xFFE8E8E5),
              ],
              stops: [
                (_controller.value - 0.3).clamp(0.0, 1.0),
                _controller.value.clamp(0.0, 1.0),
                (_controller.value + 0.3).clamp(0.0, 1.0),
              ],
            ).createShader(bounds);
          },
          blendMode: BlendMode.srcATop,
          child: child,
        );
      },
      child: widget.child,
    );
  }
}

/// 练习页骨架屏
class PracticeSkeleton extends StatelessWidget {
  const PracticeSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return ShimmerWrap(
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: 20.w),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(height: 60.h),
            // 进度条骨架
            _ShimmerBox(width: double.infinity, height: 6.h, borderRadius: 3),
            SizedBox(height: 32.h),
            // 面包屑骨架
            _ShimmerBox(width: 120.w, height: 14.h),
            SizedBox(height: 24.h),
            // 题型标签骨架
            _ShimmerBox(width: 50.w, height: 20.h, borderRadius: 4),
            SizedBox(height: 16.h),
            // 题目文字骨架（多行）
            _ShimmerBox(width: double.infinity, height: 20.h),
            SizedBox(height: 10.h),
            _ShimmerBox(width: 280.w, height: 20.h),
            SizedBox(height: 10.h),
            _ShimmerBox(width: 200.w, height: 20.h),
            SizedBox(height: 40.h),
            // 选项骨架 x4
            ...List.generate(
              4,
              (i) => Padding(
                padding: EdgeInsets.only(bottom: 12.h),
                child: _ShimmerBox(
                  width: double.infinity,
                  height: 56.h,
                  borderRadius: 8,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 题库列表骨架屏
class QuestionListSkeleton extends StatelessWidget {
  const QuestionListSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return ShimmerWrap(
      child: ListView.separated(
        physics: const NeverScrollableScrollPhysics(),
        padding: EdgeInsets.symmetric(horizontal: 20.w, vertical: 12.h),
        itemCount: 6,
        separatorBuilder: (context, index) => SizedBox(height: 12.h),
        itemBuilder: (_, index) {
          return Container(
            padding: EdgeInsets.all(16.w),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8.r),
              border: Border.all(color: const Color(0xFFE8E8E5)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    _ShimmerBox(width: 36.w, height: 18.h, borderRadius: 4),
                    SizedBox(width: 8.w),
                    _ShimmerBox(width: 60.w, height: 14.h),
                    const Spacer(),
                    _ShimmerBox(width: 40.w, height: 12.h),
                  ],
                ),
                SizedBox(height: 12.h),
                _ShimmerBox(width: double.infinity, height: 16.h),
                SizedBox(height: 6.h),
                _ShimmerBox(width: 200.w, height: 16.h),
              ],
            ),
          );
        },
      ),
    );
  }
}
