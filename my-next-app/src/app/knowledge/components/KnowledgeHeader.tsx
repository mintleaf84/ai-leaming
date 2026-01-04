'use client';

import React from 'react';
import { Search, Download, BookOpen, Plus, Play, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface KnowledgeHeaderProps {
    stats: { total: number };
    categories: string[];
    selectedCategory: string;
    setSelectedCategory: (cat: string) => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    onAdd: () => void;
    onStudy: () => void;
    onExport: () => void;
    exporting: boolean;
    filteredCount: number;
}

export const KnowledgeHeader: React.FC<KnowledgeHeaderProps> = ({
    stats,
    categories,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    onAdd,
    onStudy,
    onExport,
    exporting,
    filteredCount
}) => {
    return (
        <header className="bg-background/80 backdrop-blur-md border-b border-border sticky top-0 z-30 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center shadow-md">
                                <BookOpen className="w-6 h-6 text-primary-foreground" />
                            </div>
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-foreground">
                                知识卡片库
                            </h1>
                            <p className="text-sm text-muted-foreground">共收录 <span className="font-semibold text-blue-600 dark:text-blue-400">{stats.total}</span> 张卡片</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={onAdd}
                            className="gap-2 rounded-xl"
                        >
                            <Plus className="w-4 h-4" />
                            <span className="hidden sm:inline">手动添加</span>
                        </Button>
                        <Button
                            onClick={onStudy}
                            disabled={filteredCount === 0}
                            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md rounded-xl border-none"
                        >
                            <Play className="w-4 h-4" />
                            <span className="hidden sm:inline">复习模式</span>
                        </Button>
                        <Button
                            onClick={onExport}
                            disabled={exporting || stats.total === 0}
                            variant="outline"
                            className="gap-2 rounded-xl"
                        >
                            {exporting ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : <Download className="w-4 h-4" />}
                            <span className="hidden md:inline">导出为 Anki</span>
                        </Button>
                    </div>
                </div>

                {/* Toolbar / Actions Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="search"
                            placeholder="搜索卡片..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-muted/50 border border-border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-background transition-all shadow-inner text-foreground placeholder:text-muted-foreground"
                        />
                    </div>

                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="px-4 py-2.5 bg-muted/50 border border-border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:bg-background transition-all sm:min-w-[140px] shadow-sm text-foreground"
                    >
                        <option value="">全部分类</option>
                        {categories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>
            </div>
        </header>
    );
};
