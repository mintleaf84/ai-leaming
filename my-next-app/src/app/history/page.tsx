/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import React, { useEffect, useState, useCallback } from 'react';
import {
  getSessionHistoryAction,
  getAvailableModesAction,
  deleteSessionAction,
  renameSessionAction
} from '@/server/actions/history';
import { 
  type SessionHistoryItem, 
  type HistoryFilter, 
  type PaginatedHistory 
} from '@/lib/services/history';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription, SheetFooter } from '@/components/ui/sheet';

import Link from 'next/link';
import { toast } from 'sonner';
import { ImportFenbiModal } from '@/components/import/ImportFenbiModal';
import { cn } from '@/lib/utils';
import {
  History as HistoryIcon,
  Filter,
  Upload,
  Pencil,
  BookOpen
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { HistoryCardItem, MODE_CONFIG } from './components/HistoryCardItem';
import { HistoryCardExpanded } from './components/HistoryCardExpanded';

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

  // 用于取消过时的请求
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Load Data
  const loadHistory = useCallback(async () => {
    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    try {
      const res = await getSessionHistoryAction(filter);
      // 检查是否已被取消
      if (abortControllerRef.current?.signal.aborted) return;
      setHistory(res?.data || { items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') {
        console.error('Failed to load history:', e);
      }
    } finally {
      if (!abortControllerRef.current?.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [filter]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    getAvailableModesAction().then(res => setAvailableModes(res?.data || []));
  }, []);

  // Actions
  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('确定要删除这条练习记录吗？此操作不可撤销（掌握度不受影响）。')) return;

    const result = await deleteSessionAction(id);
    if (result.data?.success) {
      toast.success('记录已成功删除');
      loadHistory();
    } else {
      toast.error(result.data?.message || '删除失败');
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
    const result = await renameSessionAction({ sessionId: id, newName: editingName });
    if (result.data?.success) {
      toast.success('名称已更新');
      setEditingId(null);
      loadHistory();
    } else {
      toast.error(result.data?.message || '更新失败');
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

  // Selected History for expansion
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="container mx-auto px-6 py-12 md:py-20 max-w-5xl">

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-16">
          <div className="animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-700 shadow-sm">
                <HistoryIcon className="w-6 h-6" />
              </div>
              <h1 className="text-3xl md:text-4xl font-serif font-black text-foreground tracking-tight">练习记录</h1>
            </div>
            <p className="text-muted-foreground ml-1 font-medium opacity-80">
              记录每一次思考的痕迹，共 {history.total} 次练习
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 md:gap-4">
            <Button
              variant="outline"
              onClick={() => setShowImportModal(true)}
              className="bg-card border-border hover:border-primary/50 text-muted-foreground hover:text-primary rounded-2xl h-12 px-6 transition-all"
            >
              <Upload className="w-4 h-4 mr-2" />
              导入
            </Button>

            <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className={cn("bg-card border-border hover:border-primary/50 text-muted-foreground hover:text-primary rounded-2xl h-12 px-6 transition-all", hasActiveFilters && "text-primary border-primary/30 bg-primary/10")}>
                  <Filter className="w-4 h-4 mr-2" />
                  筛选
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>筛选练习记录</SheetTitle>
                  <SheetDescription>设定条件查找特定的练习历史。</SheetDescription>
                </SheetHeader>
                <div className="grid gap-6 py-8">
                  <div className="space-y-3">
                    <label className="text-sm font-black uppercase tracking-widest opacity-60">日期范围</label>
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        type="date"
                        value={filter.dateFrom || ''}
                        className="rounded-xl border-border focus:border-primary"
                        onChange={(e) => setFilter(prev => ({ ...prev, dateFrom: e.target.value || undefined }))}
                      />
                      <Input
                        type="date"
                        value={filter.dateTo || ''}
                        className="rounded-xl border-border focus:border-primary"
                        onChange={(e) => setFilter(prev => ({ ...prev, dateTo: e.target.value || undefined }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-sm font-black uppercase tracking-widest opacity-60">正确率范围 (%)</label>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number" placeholder="Min" min={0} max={100}
                        value={filter.accuracyMin ?? ''}
                        className="rounded-xl border-border focus:border-primary"
                        onChange={(e) => setFilter(prev => ({ ...prev, accuracyMin: e.target.value ? Number(e.target.value) : undefined }))}
                      />
                      <span className="text-border">-</span>
                      <Input
                        type="number" placeholder="Max" min={0} max={100}
                        value={filter.accuracyMax ?? ''}
                        className="rounded-xl border-border focus:border-primary"
                        onChange={(e) => setFilter(prev => ({ ...prev, accuracyMax: e.target.value ? Number(e.target.value) : undefined }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-sm font-black uppercase tracking-widest opacity-60">练习模式</label>
                    <div className="flex flex-wrap gap-2">
                       {['全部', ...availableModes].map(mode => (
                        <button
                          key={mode}
                          onClick={() => setFilter(prev => ({ ...prev, mode: mode === '全部' ? undefined : mode }))}
                          className={cn(
                            "px-4 py-2 text-xs font-bold rounded-full border transition-all",
                            (mode === '全部' ? !filter.mode : filter.mode === mode)
                              ? "bg-primary text-primary-foreground border-primary shadow-md"
                              : "bg-muted/50 border-border text-muted-foreground hover:border-primary/50"
                          )}
                        >
                          {mode === '全部' ? '全部模式' : (MODE_CONFIG[mode]?.label || mode)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <SheetFooter className="gap-2 sm:gap-0">
                  <Button variant="ghost" onClick={clearFilters} className="rounded-xl">清除重置</Button>
                  <Button onClick={() => { loadHistory(); setIsFilterOpen(false); }} className="bg-primary hover:bg-primary/90 rounded-xl px-8">执行筛选</Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>

            <Link href="/practice">
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground h-12 shadow-xl shadow-primary/20 rounded-2xl px-8 font-black">
                <Pencil className="w-4 h-4 mr-2" />
                新练习
              </Button>
            </Link>
          </div>
        </header>

        {/* List Content */}
        {isLoading ? (
          <div className="space-y-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-card rounded-3xl animate-pulse border border-border/50" />
            ))}
          </div>
        ) : history.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 bg-card rounded-[2.5rem] border border-dashed border-border/60">
            <div className="w-24 h-24 bg-muted/50 rounded-full flex items-center justify-center mb-8">
              <BookOpen className="w-10 h-10 text-muted-foreground opacity-30" />
            </div>
            <h3 className="text-xl font-black text-foreground mb-3 tracking-tight">暂无练习记录</h3>
            <p className="text-muted-foreground mb-8 font-medium">千里之行，始于足下。</p>
            <Link href="/practice">
              <Button variant="outline" className="h-12 border-primary/20 text-primary hover:bg-primary/5 rounded-2xl px-8 font-black">
                开始第一次练习
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-6">
            {history.items.map((item, index: number) => (
              <div
                key={item.id}
                className="animate-fade-in"
                style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'backwards' }}
              >
                <HistoryCardItem
                    item={item}
                    onExpand={(item) => setSelectedHistoryId(item.id)}
                    onDelete={handleDelete}
                    onStartEdit={handleStartEdit}
                    isEditing={editingId === item.id}
                    editingName={editingName}
                    setEditingName={setEditingName}
                    onSaveName={handleSaveName}
                />
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {history.totalPages > 1 && (
          <div className="mt-16 flex justify-center">
            <Pagination
              currentPage={history.page}
              totalPages={history.totalPages}
              onPageChange={handlePageChange}
            />
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedHistoryId && (
            <HistoryCardExpanded
                sessionId={selectedHistoryId}
                initialData={history.items.find((h: SessionHistoryItem) => h.id === selectedHistoryId) || {}}
                onClose={() => setSelectedHistoryId(null)}
            />
        )}
      </AnimatePresence>

      <ImportFenbiModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={loadHistory}
      />
    </div>
  );
}
