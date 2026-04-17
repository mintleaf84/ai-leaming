import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:go_router/go_router.dart';
import '../../../core/network/dio_client.dart';

/// 定价页面（与 Web /pricing 功能对齐）
class PricingScreen extends ConsumerStatefulWidget {
  const PricingScreen({super.key});

  @override
  ConsumerState<PricingScreen> createState() => _PricingScreenState();
}

class _PricingScreenState extends ConsumerState<PricingScreen> {
  List<Map<String, dynamic>> _plans = [];
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadPlans();
  }

  Future<void> _loadPlans() async {
    try {
      final dio = ref.read(dioProvider);
      final response = await dio.get('/billing/plans');
      if (response.statusCode == 200) {
        final data = response.data as Map<String, dynamic>;
        final plans = data['plans'] as List<dynamic>? ?? [];
        setState(() {
          _plans = plans.cast<Map<String, dynamic>>();
          _isLoading = false;
        });
      }
    } catch (e) {
      // 接口失败时展示内置套餐，静默降级并记录日志
      debugPrint('加载套餐失败，降级展示内置套餐: $e');
      setState(() {
        _plans = [];
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7F7F5),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Color(0xFF37352F)),
          onPressed: () => context.pop(),
        ),
        title: Text(
          '订阅套餐',
          style: TextStyle(
            fontSize: 18.sp,
            fontWeight: FontWeight.w600,
            color: const Color(0xFF37352F),
          ),
        ),
        centerTitle: true,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _buildContent(),
    );
  }

  Widget _buildContent() {
    // 优先使用接口数据，否则展示内置套餐
    final plans = _plans.isNotEmpty ? _plans : _defaultPlans;

    return SingleChildScrollView(
      padding: EdgeInsets.all(20.w),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 标题介绍
          Center(
            child: Column(
              children: [
                Text(
                  '选择适合你的套餐',
                  style: TextStyle(
                    fontSize: 24.sp,
                    fontWeight: FontWeight.w700,
                    color: const Color(0xFF37352F),
                  ),
                ),
                SizedBox(height: 8.h),
                Text(
                  '解锁 AI 诊断与高级复盘能力',
                  style: TextStyle(
                    fontSize: 14.sp,
                    color: const Color(0xFF787774),
                  ),
                ),
              ],
            ),
          ),
          SizedBox(height: 28.h),
          // 套餐卡片列表
          ...plans.map((plan) => _buildPlanCard(plan)),
          SizedBox(height: 20.h),
          // 底部说明
          Center(
            child: Text(
              '价格含税 · 随时取消 · 支持支付宝/微信',
              style: TextStyle(
                fontSize: 12.sp,
                color: const Color(0xFF787774),
              ),
            ),
          ),
          SizedBox(height: 40.h),
        ],
      ),
    );
  }

  Widget _buildPlanCard(Map<String, dynamic> plan) {
    final name = plan['name'] as String? ?? '';
    final slug = plan['slug'] as String? ?? 'free';
    final priceCents = (plan['priceCents'] as num?)?.toInt() ?? 0;
    final features = plan['features'] as List<dynamic>? ?? [];
    final isHighlighted = slug == 'pro' || slug == 'basic';

    // 格式化价格显示
    final priceDisplay = priceCents == 0
        ? '免费'
        : '¥${(priceCents / 100).toStringAsFixed(0)}/月';

    // 套餐颜色
    final cardColor = slug == 'pro'
        ? const Color(0xFF37352F)
        : slug == 'basic'
            ? const Color(0xFF135BEC)
            : Colors.white;
    final textColor = (slug == 'pro' || slug == 'basic')
        ? Colors.white
        : const Color(0xFF37352F);

    return Container(
      margin: EdgeInsets.only(bottom: 16.h),
      padding: EdgeInsets.all(20.w),
      decoration: BoxDecoration(
        color: cardColor,
        borderRadius: BorderRadius.circular(16.r),
        border: isHighlighted
            ? null
            : Border.all(color: const Color(0xFFE8E8E5)),
        boxShadow: isHighlighted
            ? [
                BoxShadow(
                  color: cardColor.withValues(alpha: 0.3),
                  blurRadius: 16,
                  offset: const Offset(0, 6),
                ),
              ]
            : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 套餐名称与价格
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                name,
                style: TextStyle(
                  fontSize: 18.sp,
                  fontWeight: FontWeight.w700,
                  color: textColor,
                ),
              ),
              Text(
                priceDisplay,
                style: TextStyle(
                  fontSize: 20.sp,
                  fontWeight: FontWeight.w700,
                  color: textColor,
                ),
              ),
            ],
          ),
          SizedBox(height: 16.h),
          // 功能列表
          ...features.take(5).map(
                (feature) => Padding(
                  padding: EdgeInsets.only(bottom: 8.h),
                  child: Row(
                    children: [
                      Icon(
                        Icons.check_circle_outline,
                        size: 16.sp,
                        color: textColor.withValues(alpha: 0.8),
                      ),
                      SizedBox(width: 8.w),
                      Expanded(
                        child: Text(
                          feature.toString(),
                          style: TextStyle(
                            fontSize: 13.sp,
                            color: textColor.withValues(alpha: 0.9),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
        ],
      ),
    );
  }

  /// 默认套餐数据（后端不可用时展示）
  static const List<Map<String, dynamic>> _defaultPlans = [
    {
      'name': '免费版',
      'slug': 'free',
      'priceCents': 0,
      'features': [
        '每日 20 题练习',
        '基础 AI 解析',
        '历史记录查询',
        '错题本功能',
      ],
    },
    {
      'name': '基础版',
      'slug': 'basic',
      'priceCents': 1900,
      'features': [
        '无限题目练习',
        '完整 AI 复盘引擎',
        '第一性原理深度解读',
        '多维度诊断报告',
        '知识图谱可视化',
      ],
    },
    {
      'name': '专业版',
      'slug': 'pro',
      'priceCents': 3900,
      'features': [
        '包含基础版全部功能',
        '优先 AI 响应速度',
        '高级行为聚合分析',
        '个性化学习路径规划',
        '专属客服支持',
      ],
    },
  ];
}
