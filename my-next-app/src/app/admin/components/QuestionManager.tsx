"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  getQuestionsAction,
  importQuestionsAction,
  deleteQuestionAction,
  batchDeleteQuestionsAction,
} from "@/server/actions/admin";
import { type QuestionFilters } from "@/lib/services/admin-service";
import { Question, Dimension } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Trash2,
  Upload,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Edit,
} from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { EditQuestionDialog } from "./EditQuestionDialog";

export function QuestionManager() {
  // 状态管理
  const [questions, setQuestions] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

  // 分页与筛选
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<QuestionFilters>({});

  // 批量操作
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载数据
  const loadQuestions = useCallback(
    async (currentFilters = filters) => {
      setLoading(true);
      try {
        const offset = (page - 1) * pageSize;
        const result = await getQuestionsAction({
          limit: pageSize,
          offset,
          filters: currentFilters,
        });

        if (result.serverError) {
          toast.error(result.serverError || "题目列表加载失败");
          setLoading(false);
          return;
        }

        if (!result.data?.success) {
          toast.error("题目列表加载失败");
          setLoading(false);
          return;
        }

        if (result.data) {
          setQuestions(result.data.questions);
          setTotal(result.data.total);
        }
        // 清空选中状态
        setSelectedIds([]);
      } catch (_e) {
        toast.error("题目列表加载过程发生错误");
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, filters],
  );

  useEffect(() => {
    loadQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]); // 筛选变化由 handleSearch 手动触发

  // 搜索处理
  const handleSearch = () => {
    setPage(1); // 重置到第一页
    loadQuestions(filters);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  // 删除单条
  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除这道题目吗？此操作不可恢复。")) return;
    const result = await deleteQuestionAction(id);
    if (result.serverError) {
      toast.error(result.serverError || "删除失败");
    } else if (result.data?.success) {
      toast.success("题目已删除");
      loadQuestions();
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    if (
      !confirm(
        `确定要删除选中的 ${selectedIds.length} 道题目吗？此操作不可恢复。`,
      )
    )
      return;

    const result = await batchDeleteQuestionsAction(selectedIds);
    if (result.serverError) {
      toast.error(result.serverError || "批量删除失败");
    } else if (result.data) {
      toast.success(`成功删除 ${result.data.deletedCount} 道题目`);
      loadQuestions();
    }
  };

  // 全选/反选
  const toggleSelectAll = () => {
    if (selectedIds.length === questions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(questions.map((q) => q.id));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev: number[]) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  // 文件导入
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        toast.info("正在导入...", { duration: 1000 });
        const result = await importQuestionsAction(json);
        if (result.serverError) {
          toast.error(result.serverError || "导入失败");
        } else if (result.data) {
          toast.success(`成功导入 ${result.data.count} 道题目`);
          loadQuestions();
        }
      } catch (_e) {
        toast.error("无效的 JSON 文件格式");
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  // 导出 CSV
  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (filters.search) params.append("search", filters.search);
    if (filters.dimension) params.append("dimension", filters.dimension);
    if (filters.tag) params.append("tag", filters.tag);

    window.location.href = `/api/admin/export/questions?${params.toString()}`;
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      {/* 顶部工具栏 */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-card p-4 rounded-xl border border-border">
        <div className="flex flex-wrap gap-2 w-full md:w-auto items-center">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索题干内容..."
              className="pl-9"
              value={filters.search || ""}
              onChange={(e) =>
                setFilters((prev: QuestionFilters) => ({
                  ...prev,
                  search: e.target.value,
                }))
              }
              onKeyDown={handleKeyDown}
            />
          </div>

          <Select
            value={filters.dimension || "all"}
            onValueChange={(val) =>
              setFilters((prev: QuestionFilters) => ({
                ...prev,
                dimension: val === "all" ? undefined : (val as Dimension),
              }))
            }
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="维度" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有维度</SelectItem>
              <SelectItem value="knowledge">识记</SelectItem>
              <SelectItem value="understanding">理解</SelectItem>
              <SelectItem value="application">应用</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="secondary" onClick={handleSearch}>
            筛选
          </Button>
        </div>

        <div className="flex gap-2 w-full md:w-auto">
          {selectedIds.length > 0 && (
            <Button variant="destructive" size="sm" onClick={handleBatchDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              删除 ({selectedIds.length})
            </Button>
          )}

          <div className="relative">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".json"
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-2" />
              导入
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            title="根据当前筛选条件导出全量数据"
          >
            <Download className="w-4 h-4 mr-2" />
            导出 CSV
          </Button>
        </div>
      </div>

      {/* 题目列表表格 */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground uppercase font-medium border-b border-border">
              <tr>
                <th className="p-4 w-12">
                  <Checkbox
                    checked={
                      questions.length > 0 &&
                      selectedIds.length === questions.length
                    }
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
                <th className="p-4 w-16">ID</th>
                <th className="p-4">题干内容</th>
                <th className="p-4 w-32">标签</th>
                <th className="p-4 w-24">维度</th>
                <th className="p-4 w-24 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={6} className="h-32 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : questions.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="p-8 text-center text-muted-foreground"
                  >
                    没有找到符合条件的题目。
                  </td>
                </tr>
              ) : (
                questions.map((q) => (
                  <tr
                    key={q.id}
                    className="hover:bg-muted/50 transition-colors group"
                  >
                    <td className="p-4">
                      <Checkbox
                        checked={selectedIds.includes(q.id)}
                        onCheckedChange={() => toggleSelect(q.id)}
                      />
                    </td>
                    <td className="p-4 text-muted-foreground">#{q.id}</td>
                    <td
                      className="p-4 font-medium text-foreground max-w-lg truncate cursor-pointer hover:text-blue-600"
                      title="点击编辑"
                      onClick={() => setEditingQuestion(q)}
                    >
                      <div className="line-clamp-2">{q.content}</div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {q.tags?.slice(0, 2).map((t: string) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs rounded-full whitespace-nowrap"
                          >
                            {t.split("/").pop()}
                          </span>
                        ))}
                        {q.tags?.length > 2 && (
                          <span className="text-xs text-muted-foreground px-1">
                            +{q.tags.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-muted-foreground text-xs">
                      {q.dimension === "knowledge"
                        ? "识记"
                        : q.dimension === "application"
                          ? "应用"
                          : "理解"}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingQuestion(q)}
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          title="编辑"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(q.id)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-border flex flex-col sm:flex-row justify-between items-center gap-4 bg-muted/20">
          <div className="text-sm text-muted-foreground">
            共 {total} 条记录，当前第 {page}/{totalPages || 1} 页
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page === 1}
              onClick={() => setPage(1)}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="mx-2 text-sm font-medium w-8 text-center">
              {page}
            </div>

            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => setPage(totalPages)}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>

            <div className="w-[1px] h-4 bg-border mx-2" />

            <Select
              value={String(pageSize)}
              onValueChange={(val) => {
                setPageSize(Number(val));
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <EditQuestionDialog
        open={!!editingQuestion}
        onOpenChange={(open) => !open && setEditingQuestion(null)}
        question={editingQuestion}
        onSuccess={() => loadQuestions()}
      />
    </div>
  );
}
