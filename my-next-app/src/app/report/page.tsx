"use client";

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
const RadarChart = dynamic(
  () => import('@/components/viz/RadarChart').then(mod => mod.RadarChart),
  { ssr: false, loading: () => <div className="animate-pulse w-full h-[300px] bg-slate-800 rounded-full" /> }
);
import { generateDiagnosticReportAction, getSessionReportAction, SessionReportData } from '@/server/actions/report';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, TrendingUp, Clock, Target, CheckCircle2 } from 'lucide-react';

export default function ReportPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId') || undefined;

  const [reportData, setReportData] = useState<SessionReportData | null>(null);
  const [aiReport, setAiReport] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载会话数据
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getSessionReportAction(sessionId);
        if (data) {
          setReportData(data);
          // 自动开始生成 AI 报告
          setIsGeneratingAI(true);
          try {
            const text = await generateDiagnosticReportAction({
              totalQuestions: data.totalQuestions,
              correctCount: data.correctCount,
              errorTags: data.errorTags,
              avgDuration: data.avgDuration
            });
            setAiReport(text);
          } catch (e) {
            console.error('AI 报告生成失败:', e);
            setAiReport('AI 诊断报告生成失败，请稍后重试。');
          } finally {
            setIsGeneratingAI(false);
          }
        } else {
          setError('未找到练习记录，请先完成一次练习。');
        }
      } catch (e) {
        console.error('加载报告失败:', e);
        setError('加载报告数据失败，请稍后重试。');
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [sessionId]);

  // 加载状态
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p>正在加载练习报告...</p>
      </div>
    );
  }

  // 错误或无数据状态
  if (error || !reportData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
        <AlertCircle className="w-12 h-12 text-amber-500" />
        <p className="text-lg text-muted-foreground">{error || '暂无报告数据'}</p>
        <Button onClick={() => window.location.href = '/practice/setup'}>
          开始练习
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 pb-20">
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold mb-8 text-foreground">练习结算报告</h1>

        {/* 核心指标卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <div className="text-2xl md:text-3xl font-bold text-foreground">{reportData.totalQuestions}</div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <Target className="w-3 h-3" /> 总题数
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <div className="text-2xl md:text-3xl font-bold text-green-600 dark:text-green-400">
              {reportData.correctCount}
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> 正确数
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <div className={`text-2xl md:text-3xl font-bold ${reportData.accuracy >= 80 ? 'text-green-600 dark:text-green-400' :
              reportData.accuracy >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
              }`}>
              {reportData.accuracy}%
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <TrendingUp className="w-3 h-3" /> 正确率
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <div className="text-2xl md:text-3xl font-bold text-foreground">
              {Math.round(reportData.avgDuration / 1000)}s
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <Clock className="w-3 h-3" /> 平均耗时
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {/* 左侧：雷达图 */}
          <div className="bg-slate-900 rounded-xl p-6 shadow-lg flex flex-col items-center justify-center text-white">
            <h2 className="text-lg font-semibold mb-4 text-slate-200">能力维度雷达</h2>
            <div className="w-full max-w-xs">
              <RadarChart data={reportData.dimensionStats} />
            </div>
            {reportData.dimensionStats.length > 0 && (
              <div className="mt-4 text-sm text-slate-400 text-center">
                {(() => {
                  const weakest = reportData.dimensionStats.reduce((min, d) =>
                    d.value < min.value ? d : min
                  );
                  if (weakest.value < 60) {
                    return `您的"${weakest.axis}"能力相对薄弱（${weakest.value}%），建议加强相关练习。`;
                  } else if (weakest.value < 80) {
                    return `整体表现均衡，"${weakest.axis}"维度（${weakest.value}%）仍有提升空间。`;
                  } else {
                    return '🎉 各维度表现优秀，继续保持！';
                  }
                })()}
              </div>
            )}
          </div>

          {/* 右侧：AI 诊断 */}
          <div className="bg-card rounded-xl p-6 shadow-lg border border-border">
            <h2 className="text-lg font-semibold mb-4 text-foreground flex items-center">
              <span className="bg-primary w-1 h-6 mr-2 rounded-full"></span>
              AI 智能诊断
            </h2>

            {isGeneratingAI ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-4 bg-muted rounded w-full"></div>
                <div className="h-4 bg-muted rounded w-5/6"></div>
                <p className="text-xs text-muted-foreground mt-2">
                  AI 正在根据您的答题表现生成专属建议...
                </p>
              </div>
            ) : (
              <div className="prose prose-slate dark:prose-invert text-muted-foreground text-sm leading-relaxed max-w-none">
                {aiReport.split('\n').map((line, i) => (
                  <p key={i} className="mb-2">{line}</p>
                ))}
              </div>
            )}

            {/* 错题知识点 */}
            {reportData.errorTags.length > 0 && (
              <div className="mt-6 pt-4 border-t border-border">
                <h3 className="text-sm font-medium text-foreground mb-2">待强化知识点</h3>
                <div className="flex flex-wrap gap-2">
                  {reportData.errorTags.slice(0, 5).map((tag, i) => (
                    <span
                      key={i}
                      className="px-2 py-1 text-xs bg-red-500/10 text-red-600 dark:text-red-400 rounded-md"
                    >
                      {tag}
                    </span>
                  ))}
                  {reportData.errorTags.length > 5 && (
                    <span className="px-2 py-1 text-xs text-muted-foreground">
                      +{reportData.errorTags.length - 5} 个
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 底部操作 */}
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-end">
          <Button variant="outline" onClick={() => window.location.href = '/history'}>
            查看历史记录
          </Button>
          <Button onClick={() => window.location.href = '/dashboard'}>
            返回仪表盘
          </Button>
        </div>
      </div>
    </div>
  );
}