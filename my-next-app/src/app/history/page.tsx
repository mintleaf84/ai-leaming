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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { toast } from 'sonner';
import { ImportFenbiModal } from '@/components/import/ImportFenbiModal';
import { cn } from '@/lib/utils';
import {
  History as HistoryIcon,
  ChevronRight,
  Calendar,
  CheckCircle2,
  Trash2,
  Filter,
  Brain,
  RotateCcw,
  Target,
  FileCheck,
  Shuffle,
  Upload,
  Pencil,
  Check,
  Search,
  BookOpen
} from 'lucide-react';

// 练习模式配置 (Neo-Chinese Palette)
const MODE_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  smart: {
    label: '智能刷题',
    icon: <Brain className="w-3.5 h-3.5" />,
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  },
  review: {
    label: '错题回顾',
    icon: <RotateCcw className="w-3.5 h-3.5" />,
    className: 'bg-amber-50 text-amber-700 border-amber-200'
  },
  focus: {
    label: '专项突破',
    icon: <Target className="w-3.5 h-3.5" />,
    className: 'bg-teal-50 text-teal-700 border-teal-200'
  },
  exam: {
    label: '模拟考试',
    icon: <FileCheck className="w-3.5 h-3.5" />,
    className: 'bg-indigo-50 text-indigo-700 border-indigo-200'
  },
  random: {
    label: '随机挑战',
    icon: <Shuffle className="w-3.5 h-3.5" />,
    className: 'bg-muted text-muted-foreground border-border'
  },
  import: {
    label: '外部导入',
    icon: <Upload className="w-3.5 h-3.5" />,
    className: 'bg-sky-50 text-sky-700 border-sky-200'
  },
};

export default function HistoryPage() {
  // State
  const [history, setHistory] = useState<PaginatedHistory>({
    items: [], total: 0, page: 1, pageSize: 10, totalPages: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [availableModes, setAvailableModes] = useState<string[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Filter State
  const [filter, setFilter] = useState<HistoryFilter>({
    page: 1,
    pageSize: 10
  });

  // Load Data
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
  }, []);

  // Actions
  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('确定要删除这条练习记录吗？此操作不可撤销（掌握度不受影响）。')) return;

    const result = await deleteSessionAction(id);
    if (result.success) {
      toast.success('记录已成功删除');
      loadHistory();
    } else {
      toast.error(result.message || '删除失败');
    }
  };

  const handleStartEdit = (e: React.MouseEvent, item: SessionHistoryItem) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(item.id);
    setEditingName(item.sessionName || '');
  };

  const handleSaveName = async (e: React.SyntheticEvent, id: string) => {
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearFilters = () => {
    setFilter({ page: 1, pageSize: 10 });
    setIsFilterOpen(false);
  };

  const hasActiveFilters = filter.dateFrom || filter.dateTo || filter.mode ||
    filter.accuracyMin !== undefined || filter.accuracyMax !== undefined;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-12 md:py-20 max-w-5xl">

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-700">
                <HistoryIcon className="w-5 h-5" />
              </div>
              <h1 className="text-3xl font-serif font-bold text-foreground">修习日志</h1>
            </div>
            <p className="text-muted-foreground ml-1">
              记录每一次思考的痕迹，共 {history.total} 次练习
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setShowImportModal(true)}
              className="bg-card border-border text-muted-foreground hover:bg-accent"
            >
              <Upload className="w-4 h-4 mr-2" />
              导入
            </Button>

            <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className={cn("bg-card border-border text-muted-foreground hover:bg-accent", hasActiveFilters && "text-primary border-primary/30 bg-primary/10")}>
                  <Filter className="w-4 h-4 mr-2" />
                  筛选
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>筛选练习记录</SheetTitle>
                  <SheetDescription>
                    设定条件查找特定的练习历史。
                  </SheetDescription>
                </SheetHeader>
                <div className="grid gap-6 py-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">日期范围</label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="date"
                        value={filter.dateFrom || ''}
                        onChange={(e) => setFilter(prev => ({ ...prev, dateFrom: e.target.value || undefined }))}
                      />
                      <Input
                        type="date"
                        value={filter.dateTo || ''}
                        onChange={(e) => setFilter(prev => ({ ...prev, dateTo: e.target.value || undefined }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">正确率 (%)</label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number" placeholder="Min" min={0} max={100}
                        value={filter.accuracyMin ?? ''}
                        onChange={(e) => setFilter(prev => ({ ...prev, accuracyMin: e.target.value ? Number(e.target.value) : undefined }))}
                      />
                      <span className="text-neutral-400">-</span>
                      <Input
                        type="number" placeholder="Max" min={0} max={100}
                        value={filter.accuracyMax ?? ''}
                        onChange={(e) => setFilter(prev => ({ ...prev, accuracyMax: e.target.value ? Number(e.target.value) : undefined }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">练习模式</label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setFilter(prev => ({ ...prev, mode: undefined }))}
                        className={cn("px-3 py-1.5 text-xs rounded-full border transition-all", !filter.mode ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50")}
                      >
                        全部
                      </button>
                      {availableModes.map(mode => (
                        <button
                          key={mode}
                          onClick={() => setFilter(prev => ({ ...prev, mode }))}
                          className={cn("px-3 py-1.5 text-xs rounded-full border transition-all", filter.mode === mode ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50")}
                        >
                          {MODE_CONFIG[mode]?.label || mode}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <SheetFooter>
                  <Button variant="outline" onClick={clearFilters}>重置</Button>
                  <Button onClick={() => { loadHistory(); setIsFilterOpen(false); }} className="bg-emerald-600 hover:bg-emerald-700">应用筛选</Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>

            <Link href="/practice">
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 rounded-full px-6">
                <Pencil className="w-4 h-4 mr-2" />
                新练习
              </Button>
            </Link>
          </div>
        </header>

        {/* List Content */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-card rounded-2xl animate-pulse border border-border" />
            ))}
          </div>
        ) : history.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-card rounded-3xl border border-dashed border-border">
            <div className="w-20 h-20 bg-neutral-50 rounded-full flex items-center justify-center mb-6">
              <BookOpen className="w-8 h-8 text-neutral-300" />
            </div>
            <h3 className="text-lg font-medium text-neutral-900 mb-2">暂无练习记录</h3>
            <p className="text-neutral-500 mb-6">千里之行，始于足下。</p>
            <Link href="/practice">
              <Button variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50">开始第一次练习</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {history.items.map((item) => (
              <Link
                key={item.id}
                href={`/history/${item.id}`}
                className="group block bg-card hover:bg-primary/5 rounded-2xl p-6 border border-border hover:border-primary/30 hover:shadow-md transition-all duration-300"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      {/* Mode Tag */}
                      {item.practiceMode && MODE_CONFIG[item.practiceMode] && (
                        <span className={cn("px-2.5 py-0.5 rounded-md text-xs font-medium border flex items-center gap-1.5", MODE_CONFIG[item.practiceMode].className)}>
                          {MODE_CONFIG[item.practiceMode].icon}
                          {MODE_CONFIG[item.practiceMode].label}
                        </span>
                      )}
                      {/* Date */}
                      <span className="text-sm text-neutral-400 font-medium">
                        {new Date(item.createdAt).toLocaleString('zh-CN', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      {editingId === item.id ? (
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          <Input
                            value={editingName}
                            onChange={e => setEditingName(e.target.value)}
                            className="h-8 text-lg font-bold w-64 border-emerald-200 focus-visible:ring-emerald-200"
                            autoFocus
                            onClick={e => e.stopPropagation()}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveName(e, item.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                          <Button size="sm" onClick={e => handleSaveName(e, item.id)} className="h-8 w-8 p-0 bg-emerald-600 hover:bg-emerald-700">
                            <Check className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 group/title">
                          <h3 className="text-lg font-bold text-foreground font-serif">
                            {item.sessionName || "未命名练习"}
                          </h3>
                          <button
                            onClick={e => handleStartEdit(e, item)}
                            className="opacity-0 group-hover/title:opacity-100 text-muted-foreground hover:text-primary transition-opacity p-1"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className={cn("w-4 h-4", item.accuracy >= 60 ? "text-emerald-500" : "text-rose-500")} />
                        正确率 <span className={cn("font-bold", item.accuracy >= 60 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>{item.accuracy}%</span>
                      </span>
                      <span className="w-1 h-1 bg-muted-foreground/50 rounded-full" />
                      <span>共 {item.totalQuestions} 题</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-end md:self-center">
                    <div className="text-right hidden md:block">
                      <div className="text-xs text-neutral-400 uppercase tracking-wider mb-1">Reviews</div>
                      <div className="text-xl font-bold text-amber-500 font-serif">{item.reviewCount}</div>
                    </div>

                    <div className="h-10 w-[1px] bg-neutral-100 hidden md:block" />

                    <button
                      onClick={(e) => handleDelete(e, item.id)}
                      className="p-2 text-neutral-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    <div className="w-10 h-10 rounded-full bg-neutral-50 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-all text-neutral-400">
                      <ChevronRight className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Pagination */}
        {history.totalPages > 1 && (
          <div className="mt-12 flex justify-center">
            <Pagination
              currentPage={history.page}
              totalPages={history.totalPages}
              onPageChange={handlePageChange}
            />
          </div>
        )}

      </div>

      <ImportFenbiModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={loadHistory}
      />
    </div>
  );
}
