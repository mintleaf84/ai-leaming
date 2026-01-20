import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:go_router/go_router.dart';
import '../providers/history_provider.dart';
import '../../domain/entities/history_item.dart';
import '../../domain/entities/practice_log.dart';

class HistoryDetailScreen extends ConsumerStatefulWidget {
  final String sessionId;

  const HistoryDetailScreen({super.key, required this.sessionId});

  @override
  ConsumerState<HistoryDetailScreen> createState() =>
      _HistoryDetailScreenState();
}

class _HistoryDetailScreenState extends ConsumerState<HistoryDetailScreen> {
  @override
  Widget build(BuildContext context) {
    final asyncState = ref.watch(historyDetailProvider(widget.sessionId));

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
          '练习详情',
          style: TextStyle(
            fontSize: 18.sp,
            fontWeight: FontWeight.w600,
            color: const Color(0xFF37352F),
          ),
        ),
        centerTitle: true,
      ),
      body: asyncState.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.error_outline, size: 48.sp, color: Colors.red),
              SizedBox(height: 16.h),
              Text('加载失败: $error'),
              ElevatedButton(
                onPressed: () {
                  ref.invalidate(historyDetailProvider(widget.sessionId));
                },
                child: const Text('重试'),
              ),
            ],
          ),
        ),
        data: (state) => _buildBody(state),
      ),
    );
  }

  Widget _buildBody(HistoryDetailState state) {
    if (state.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state.error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 48.sp, color: Colors.red),
            SizedBox(height: 16.h),
            Text('加载失败: ${state.error}'),
            ElevatedButton(
              onPressed: () {
                ref.invalidate(historyDetailProvider(widget.sessionId));
              },
              child: const Text('重试'),
            ),
          ],
        ),
      );
    }

    if (state.session == null) {
      return const Center(child: Text('未找到记录'));
    }

    return SingleChildScrollView(
      padding: EdgeInsets.all(16.w),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildSummaryCard(state.session!),
          SizedBox(height: 20.h),
          Text(
            '题目回顾',
            style: TextStyle(
              fontSize: 16.sp,
              fontWeight: FontWeight.bold,
              color: const Color(0xFF37352F),
            ),
          ),
          SizedBox(height: 12.h),
          ...state.logs.map((log) => _buildQuestionCard(log)),
        ],
      ),
    );
  }

  Widget _buildSummaryCard(HistoryItem session) {
    return Container(
      padding: EdgeInsets.all(20.w),
      decoration: BoxDecoration(
        color: Colors.white,
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
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Column(
                children: [
                  Text(
                    '${session.accuracy}%',
                    style: TextStyle(
                      fontSize: 36.sp,
                      fontWeight: FontWeight.bold,
                      color: _getAccuracyColor(session.accuracy),
                    ),
                  ),
                  Text(
                    '正确率',
                    style: TextStyle(fontSize: 12.sp, color: Colors.grey),
                  ),
                ],
              ),
              Container(
                height: 40.h,
                width: 1,
                color: Colors.grey[200],
                margin: EdgeInsets.symmetric(horizontal: 30.w),
              ),
              Column(
                children: [
                  Text(
                    '${session.correctCount}/${session.totalQuestions}',
                    style: TextStyle(
                      fontSize: 24.sp,
                      fontWeight: FontWeight.bold,
                      color: const Color(0xFF37352F),
                    ),
                  ),
                  Text(
                    '答对/总题',
                    style: TextStyle(fontSize: 12.sp, color: Colors.grey),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildQuestionCard(PracticeLog log) {
    return Container(
      margin: EdgeInsets.only(bottom: 16.h),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12.r),
        border: Border.all(
          color: log.isCorrect
              ? const Color(0xFFE8F5E9)
              : const Color(0xFFFFEBEE),
          width: 1,
        ),
      ),
      child: ExpansionTile(
        tilePadding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 8.h),
        leading: Container(
          padding: EdgeInsets.all(8.w),
          decoration: BoxDecoration(
            color: log.isCorrect
                ? const Color(0xFF4CAF50)
                : const Color(0xFFEF5350),
            shape: BoxShape.circle,
          ),
          child: Icon(
            log.isCorrect ? Icons.check : Icons.close,
            color: Colors.white,
            size: 16.sp,
          ),
        ),
        title: Text(
          log.questionContent,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 14.sp,
            fontWeight: FontWeight.w500,
            color: const Color(0xFF37352F),
          ),
        ),
        children: [
          Padding(
            padding: EdgeInsets.all(16.w),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildAnswerRow('你的答案', log.userAnswer, log.isCorrect),
                SizedBox(height: 8.h),
                _buildAnswerRow('正确答案', log.correctAnswer, true),
                SizedBox(height: 16.h),
                if (log.explanation.isNotEmpty) ...[
                  Text(
                    '解析',
                    style: TextStyle(
                      fontSize: 14.sp,
                      fontWeight: FontWeight.bold,
                      color: const Color(0xFF37352F),
                    ),
                  ),
                  SizedBox(height: 4.h),
                  Text(
                    log.explanation,
                    style: TextStyle(
                      fontSize: 14.sp,
                      color: Colors.grey[700],
                      height: 1.5,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAnswerRow(String label, String content, bool isCorrect) {
    return Row(
      children: [
        Text(
          '$label：',
          style: TextStyle(fontSize: 14.sp, color: Colors.grey),
        ),
        Expanded(
          child: Text(
            content,
            style: TextStyle(
              fontSize: 14.sp,
              fontWeight: FontWeight.bold,
              color: isCorrect
                  ? const Color(0xFF4CAF50)
                  : const Color(0xFFEF5350),
            ),
          ),
        ),
      ],
    );
  }

  Color _getAccuracyColor(int accuracy) {
    if (accuracy >= 80) return const Color(0xFF4EA05E);
    if (accuracy >= 60) return const Color(0xFFFF9500);
    return const Color(0xFFD95656);
  }
}
