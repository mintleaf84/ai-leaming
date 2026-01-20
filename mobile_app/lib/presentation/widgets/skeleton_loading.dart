import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:shimmer/shimmer.dart';

/// 骨架屏基础组件 - 模拟文本行
class SkeletonText extends StatelessWidget {
  final double width;
  final double height;

  const SkeletonText({
    super.key,
    this.width = double.infinity,
    this.height = 14,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height.h,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(4.r),
      ),
    );
  }
}

/// 骨架屏基础组件 - 模拟卡片
class SkeletonCard extends StatelessWidget {
  final double height;

  const SkeletonCard({super.key, this.height = 100});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height.h,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12.r),
      ),
    );
  }
}

/// 历史记录列表骨架屏
class HistorySkeletonList extends StatelessWidget {
  const HistorySkeletonList({super.key});

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: Colors.grey[300]!,
      highlightColor: Colors.grey[100]!,
      child: ListView.builder(
        padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 12.h),
        itemCount: 5, // 显示 5 个骨架卡片
        itemBuilder: (context, index) => _buildSkeletonItem(),
      ),
    );
  }

  Widget _buildSkeletonItem() {
    return Container(
      margin: EdgeInsets.only(bottom: 12.h),
      padding: EdgeInsets.all(16.w),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12.r),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 标题行骨架
          Row(
            children: [
              SkeletonText(width: 60.w, height: 20),
              SizedBox(width: 8.w),
              SkeletonText(width: 80.w, height: 14),
            ],
          ),
          SizedBox(height: 12.h),
          // 统计行骨架
          Row(
            children: [
              SkeletonText(width: 50.w, height: 24),
              SizedBox(width: 16.w),
              SkeletonText(width: 100.w, height: 16),
            ],
          ),
          SizedBox(height: 8.h),
          // 进度条骨架
          const SkeletonText(height: 6),
        ],
      ),
    );
  }
}

/// 知识卡片列表骨架屏
class KnowledgeSkeletonList extends StatelessWidget {
  const KnowledgeSkeletonList({super.key});

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: Colors.grey[300]!,
      highlightColor: Colors.grey[100]!,
      child: ListView.builder(
        padding: EdgeInsets.all(16.w),
        itemCount: 4, // 显示 4 个骨架卡片
        itemBuilder: (context, index) => _buildSkeletonItem(),
      ),
    );
  }

  Widget _buildSkeletonItem() {
    return Container(
      margin: EdgeInsets.only(bottom: 12.h),
      padding: EdgeInsets.all(16.w),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12.r),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 标题骨架
          SkeletonText(width: 200.w, height: 18),
          SizedBox(height: 8.h),
          // 分类标签骨架
          Row(
            children: [
              SkeletonText(width: 50.w, height: 16),
              SizedBox(width: 8.w),
              SkeletonText(width: 60.w, height: 16),
            ],
          ),
        ],
      ),
    );
  }
}

/// 历史详情页骨架屏
class HistoryDetailSkeletonList extends StatelessWidget {
  const HistoryDetailSkeletonList({super.key});

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: Colors.grey[300]!,
      highlightColor: Colors.grey[100]!,
      child: ListView.builder(
        padding: EdgeInsets.all(16.w),
        itemCount: 3,
        itemBuilder: (context, index) => _buildQuestionSkeleton(),
      ),
    );
  }

  Widget _buildQuestionSkeleton() {
    return Container(
      margin: EdgeInsets.only(bottom: 16.h),
      padding: EdgeInsets.all(16.w),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12.r),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 题号骨架
          SkeletonText(width: 80.w, height: 14),
          SizedBox(height: 12.h),
          // 题目内容骨架 (多行)
          const SkeletonText(height: 16),
          SizedBox(height: 6.h),
          SkeletonText(width: 280.w, height: 16),
          SizedBox(height: 16.h),
          // 选项骨架
          SkeletonText(width: 220.w, height: 14),
          SizedBox(height: 8.h),
          SkeletonText(width: 200.w, height: 14),
          SizedBox(height: 8.h),
          SkeletonText(width: 180.w, height: 14),
        ],
      ),
    );
  }
}
