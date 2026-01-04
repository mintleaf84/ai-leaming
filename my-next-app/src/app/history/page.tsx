"use client";

import React, { useEffect, useState, useCallback } from 'react';
import {
  getSessionHistoryAction,
  getAvailableModesAction,
  SessionHistoryItem,
  HistoryFilter,
  PaginatedHistory,
  deleteSessionAction,
  renameSessionAction
} from '@/server/actions/history';
import { getPracticeTrendAction, TrendDataItem } from '@/server/actions/stats';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { CombinedTrendChart } from '@/components/charts/TrendChart';
import Link from 'next/link';
import { toast } from 'sonner';
import { ImportFenbiModal } from '@/components/import/ImportFenbiModal';
import {
  History as HistoryIcon,
  ChevronRight,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowLeft,
  BrainCircuit,
  Trash2,
  Filter,
  X,
  Brain,
  RotateCcw,
  Target,
  FileCheck,
  Shuffle,
  TrendingUp,
  Upload,
  Pencil,
  Check
} from 'lucide-react';

// 练习模式标签映射
const MODE_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  smart: { label: '智能刷题', icon: <Brain className="w-3 h-3" />, color: 'bg-blue-500/10 text-blue-600' },
  review: { label: '错题回顾', icon: <RotateCcw className="w-3 h-3" />, color: 'bg-amber-500/10 text-amber-600' },
  focus: { label: '专项突破', icon: <Target className="w-3 h-3" />, color: 'bg-green-500/10 text-green-600' },
  exam: { label: '模拟考试', icon: <FileCheck className="w-3 h-3" />, color: 'bg-purple-500/10 text-purple-600' },
  random: { label: '随机挑战', icon: <Shuffle className="w-3 h-3" />, color: 'bg-pink-500/10 text-pink-600' },
  import: { label: '外部导入', icon: <Upload className="w-3 h-3" />, color: 'bg-cyan-500/10 text-cyan-600' },
};

export default function HistoryPage() {
  const [history, setHistory] = useState<PaginatedHistory>({
    items: [], total: 0, page: 1, pageSize: 10, totalPages: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [availableModes, setAvailableModes] = useState<string[]>([]);
  const [trendData, setTrendData] = useState<TrendDataItem[]>([]);
  const [showTrend, setShowTrend] = useState(true);
  const [showImportModal, setShowImportModal] = useState(false);

  // 编辑名称状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // 筛选状态
  const [filter, setFilter] = useState<HistoryFilter>({
    page: 1,
    pageSize: 10
  });

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    const data = await getSessionHistoryAction(filter);
    setHistory(data);
    setIsLoading(false);
  }, [filter]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    getAvailableModesAction().then(setAvailableModes);
    getPracticeTrendAction(14).then(setTrendData);
  }, []);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm('确定要删除这条练习记录吗？此操作不可撤销（掌握度不受影响）。')) {
      return;
    }

    const result = await deleteSessionAction(id);
    if (result.success) {
      toast.success('记录已成功删除');
      loadHistory();
    } else {
      toast.error(result.message || '删除失败');
    }
  };

  // 开始编辑名称
  const handleStartEdit = (e: React.MouseEvent, item: SessionHistoryItem) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(item.id);
    setEditingName(item.sessionName || '');
  };

  // 保存名称
  const handleSaveName = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    const result = await renameSessionAction(id, editingName);
    if (result.success) {
      toast.success('名称已更新');
      setEditingId(null);
      loadHistory();
    } else {
      toast.error(result.message || '更新失败');
    }
  };

  const handlePageChange = (page: number) => {
    setFilter(prev => ({ ...prev, page }));
  };

  const clearFilters = () => {
    setFilter({ page: 1, pageSize: 10 });
  };

  const hasActiveFilters = filter.dateFrom || filter.dateTo || filter.mode ||
    filter.accuracyMin !== undefined || filter.accuracyMax !== undefined;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto pb-20 min-h-[calc(100vh-64px)] bg-background">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <HistoryIcon className="text-blue-600 dark:text-blue-400 h-8 w-8" />
            练习记录
          </h1>
          <p className="text-muted-foreground mt-1">
            共 {history.total} 条记录 {hasActiveFilters && '(已筛选)'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowImportModal(true)}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">导入记录</span>
          </Button>
          <Button
            variant={showFilters ? "secondary" : "outline"}
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2"
          >
            <Filter className="h-4 w-4" />
            <span className="hidden sm:inline">筛选</span>
          </Button>
          <Link href="/practice">
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
              开始新练习
            </Button>
          </Link>
        </div>
      </div>

      {/* 筛选面板 */}
      {showFilters && (
        <div className="bg-card rounded-xl p-4 mb-6 border shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* 日期范围 */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">开始日期</label>
              <Input
                type="date"
                value={filter.dateFrom || ''}
                onChange={(e) => setFilter(prev => ({ ...prev, dateFrom: e.target.value || undefined, page: 1 }))}
                className="h-9"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">结束日期</label>
              <Input
                type="date"
                value={filter.dateTo || ''}
                onChange={(e) => setFilter(prev => ({ ...prev, dateTo: e.target.value || undefined, page: 1 }))}
                className="h-9"
              />
            </div>

            {/* 正确率范围 */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">最低正确率</label>
              <Input
                type="number"
                min={0}
                max={100}
                placeholder="0%"
                value={filter.accuracyMin ?? ''}
                onChange={(e) => setFilter(prev => ({
                  ...prev,
                  accuracyMin: e.target.value ? Number(e.target.value) : undefined,
                  page: 1
                }))}
                className="h-9"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">最高正确率</label>
              <Input
                type="number"
                min={0}
                max={100}
                placeholder="100%"
                value={filter.accuracyMax ?? ''}
                onChange={(e) => setFilter(prev => ({
                  ...prev,
                  accuracyMax: e.target.value ? Number(e.target.value) : undefined,
                  page: 1
                }))}
                className="h-9"
              />
            </div>
          </div>

          {/* 练习模式筛选 */}
          {availableModes.length > 0 && (
            <div className="mt-4">
              <label className="text-xs font-medium text-muted-foreground mb-2 block">练习模式</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setFilter(prev => ({ ...prev, mode: undefined, page: 1 }))}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all ${!filter.mode ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
                    }`}
                >
                  全部
                </button>
                {availableModes.map(mode => (
                  <button
                    key={mode}
                    onClick={() => setFilter(prev => ({ ...prev, mode, page: 1 }))}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-all flex items-center gap-1.5 ${filter.mode === mode
                      ? 'bg-primary text-primary-foreground'
                      : MODE_LABELS[mode]?.color || 'bg-muted'
                      }`}
                  >
                    {MODE_LABELS[mode]?.icon}
                    {MODE_LABELS[mode]?.label || mode}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 清除筛选 */}
          {hasActiveFilters && (
            <div className="mt-4 pt-3 border-t flex justify-end">
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                <X className="h-4 w-4 mr-1" />
                清除筛选
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 加载状态 */}
      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">正在加载练习历史...</div>
      ) : history.items.length === 0 ? (
        <div className="bg-card rounded-2xl p-12 text-center border border-dashed border-border">
          <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
            <HistoryIcon className="text-muted-foreground h-8 w-8" />
          </div>
          <h3 className="text-lg font-medium text-foreground">
            {hasActiveFilters ? '没有符合筛选条件的记录' : '暂无练习记录'}
          </h3>
          <p className="text-muted-foreground mt-2 mb-6">
            {hasActiveFilters ? '尝试调整筛选条件' : '完成你的第一次智能练习，记录将出现在这里。'}
          </p>
          {hasActiveFilters ? (
            <Button variant="outline" onClick={clearFilters}>清除筛选</Button>
          ) : (
            <Link href="/practice">
              <Button variant="outline">立即开启</Button>
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* 记录列表 */}
          <div className="space-y-4">
            {history.items.map((item) => (
              <Link
                key={item.id}
                href={`/history/${item.id}`}
                className="group block bg-card p-6 rounded-2xl shadow-sm border border-border hover:border-blue-500/50 hover:shadow-md transition-all"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      {new Date(item.createdAt).toLocaleString('zh-CN', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                      {/* 练习模式标识 */}
                      {item.practiceMode && MODE_LABELS[item.practiceMode] && (
                        <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${MODE_LABELS[item.practiceMode].color}`}>
                          {MODE_LABELS[item.practiceMode].icon}
                          {MODE_LABELS[item.practiceMode].label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      {editingId === item.id ? (
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          <Input
                            value={editingName}
                            onChange={e => setEditingName(e.target.value)}
                            placeholder="输入练习名称..."
                            className="h-8 w-48 text-sm"
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveName(e as any, item.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                          <button
                            onClick={e => handleSaveName(e, item.id)}
                            className="p-1.5 text-green-600 hover:bg-green-500/10 rounded-lg transition-all"
                            title="保存"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="text-lg font-bold text-foreground">
                            {item.sessionName || `本次练习: ${item.totalQuestions} 题`}
                          </span>
                          <button
                            onClick={e => handleStartEdit(e, item)}
                            className="p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-all opacity-0 group-hover:opacity-100"
                            title="编辑名称"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${item.accuracy >= 80
                        ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                        : item.accuracy >= 60
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : 'bg-red-500/10 text-red-600 dark:text-red-400'
                        }`}>
                        <CheckCircle2 className="h-3 w-3" />
                        正确率 {item.accuracy}%
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right hidden md:block">
                      <div className="text-sm text-muted-foreground flex items-center justify-end gap-1.5">
                        <BrainCircuit className="h-3.5 w-3.5" />
                        触发复盘
                      </div>
                      <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{item.reviewCount} 次</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => handleDelete(e, item.id)}
                        className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                        title="删除记录"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-blue-500 transition-colors" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* 分页 */}
          {history.totalPages > 1 && (
            <div className="mt-8">
              <Pagination
                currentPage={history.page}
                totalPages={history.totalPages}
                onPageChange={handlePageChange}
              />
            </div>
          )}
        </>
      )}

      {/* 粉笔导入对话框 */}
      <ImportFenbiModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={loadHistory}
      />
    </div>
  );
}
