import React from 'react';
import { BookOpen, Plus, Play, Download, Loader2, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTerminology } from '@/lib/hooks/use-terminology';

interface KnowledgeHeaderProps {
    stats: { total: number };
    categories: string[];
    selectedCategory: string;
    setSelectedCategory: (cat: string) => void;
    filteredCount: number;
    onAdd: () => void;
    onAIGenerate: () => void;
    onStudy: () => void;
    onExport: () => void;
    exporting: boolean;
    searchQuery?: string;
    setSearchQuery?: (query: string) => void;
}

export const KnowledgeHeader: React.FC<KnowledgeHeaderProps> = ({
    stats,
    categories,
    selectedCategory,
    setSelectedCategory,
    filteredCount,
    onAdd,
    onAIGenerate,
    onStudy,
    onExport,
    exporting,
    searchQuery = '',
    setSearchQuery = () => { },
}) => {
    const { t } = useTerminology();

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
                                {t('knowledge.title')}
                            </h1>
                            <p className="text-sm text-muted-foreground">{t('knowledge.total')} <span className="font-bold text-primary">{stats.total}</span> 张卡片</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={onAdd}
                            className="gap-2 rounded-xl"
                        >
                            <Plus className="w-4 h-4" />
                            <span className="hidden sm:inline">{t('knowledge.add')}</span>
                        </Button>
                        <Button
                            variant="outline"
                            onClick={onAIGenerate}
                            className="gap-2 rounded-xl bg-gradient-to-r from-primary/10 to-transparent hover:from-primary/20 border-primary/30"
                        >
                            <Sparkles className="w-4 h-4 text-primary" />
                            <span className="hidden sm:inline">AI 生成</span>
                        </Button>
                        <Button
                            onClick={onStudy}
                            disabled={filteredCount === 0}
                            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md rounded-xl border-none"
                        >
                            <Play className="w-4 h-4" />
                            <span className="hidden sm:inline">{t('knowledge.study')}</span>
                        </Button>
                        <Button
                            onClick={onExport}
                            disabled={exporting || stats.total === 0}
                            variant="outline"
                            className="gap-2 rounded-xl"
                        >
                            {exporting ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : <Download className="w-4 h-4" />}
                            <span className="hidden md:inline">{t('knowledge.export')}</span>
                        </Button>
                    </div>
                </div>

                {/* Toolbar / Actions Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="search"
                            placeholder={t('knowledge.search')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-muted/50 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-background transition-all shadow-inner text-foreground placeholder:text-muted-foreground"
                        />
                    </div>

                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="px-4 py-2.5 bg-muted/50 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-background transition-all sm:min-w-[140px] shadow-sm text-foreground"
                    >
                        <option value="">{t('knowledge.all_cats')}</option>
                        {categories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>
            </div>
        </header>
    );
};
