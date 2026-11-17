import React from "react";
import {
  BookOpen,
  Plus,
  Play,
  Download,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTerminology } from "@/lib/hooks/use-terminology";

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
  searchQuery = "",
  setSearchQuery = () => {},
}) => {
  const { t } = useTerminology();

  // 计数播报（docs/ux-a11y-audit.md §3.7）：卡片总数、分类切换、增删卡片都只是
  // 视觉上的数字/列表变化。这里用一条 role="status" 播报整句。
  // 搜索中**不**播报命中数：搜索框是逐字输入的，每敲一个字母都播一次"共 3 张"
  // 就是刷屏；此时播报只保留总数与分类，避免打断用户打字。
  const categoryLabel = selectedCategory || t("knowledge.all_cats");
  const countAnnouncement = searchQuery
    ? `知识卡片共 ${stats.total} 张。当前分类：${categoryLabel}。`
    : `知识卡片共 ${stats.total} 张。当前分类：${categoryLabel}，共 ${filteredCount} 张。`;

  return (
    <header className="bg-background/80 backdrop-blur-md border-b border-border sticky top-0 z-30 shadow-sm">
      <p role="status" aria-atomic="true" className="sr-only">
        {countAnnouncement}
      </p>
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
                {t("knowledge.title")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t("knowledge.total")}{" "}
                <span className="font-bold text-primary">{stats.total}</span>{" "}
                张卡片
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={onAdd}
              className="gap-2 rounded-xl"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">{t("knowledge.add")}</span>
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
              <span className="hidden sm:inline">{t("knowledge.study")}</span>
            </Button>
            <Button
              onClick={onExport}
              disabled={exporting || stats.total === 0}
              variant="outline"
              className="gap-2 rounded-xl"
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span className="hidden md:inline">{t("knowledge.export")}</span>
            </Button>
          </div>
        </div>

        {/* Toolbar / Actions Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="search"
              placeholder={t("knowledge.search")}
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
            <option value="">{t("knowledge.all_cats")}</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
};
