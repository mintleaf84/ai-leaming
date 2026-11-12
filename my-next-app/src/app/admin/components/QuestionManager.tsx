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
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EditQuestionDialog } from "./EditQuestionDialog";

export function QuestionManager() {
  // 状态管理
  const [questions, setQuestions] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  // 加载失败要显式呈现，否则空表格会被误读成"没有符合条件的题目"
  const [loadError, setLoadError] = useState<string | null>(null);

  // 分页与筛选
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<QuestionFilters>({});

  // 批量操作
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // 请求序号：较早发出的请求晚返回/晚失败时，不能覆盖较新请求的结果
  const reqIdRef = useRef(0);

  // 加载数据
  const loadQuestions = useCallback(
    async (currentFilters = filters) => {
      const reqId = ++reqIdRef.current;
      setLoading(true);
      try {
        const offset = (page - 1) * pageSize;
        const result = await getQuestionsAction({
          limit: pageSize,
          offset,
          filters: currentFilters,
        });

        // 已有更新的请求在飞，本次结果（含错误）一律丢弃
        if (reqId !== reqIdRef.current) return;

        // safe-action 的失败不抛异常：serverError / success === false 都算加载失败
        if (result?.serverError) {
          console.error("加载题目列表失败", result.serverError);
          setLoadError(result.serverError);
          return;
        }

        if (!result?.data || result.data.success === false) {
          console.error("加载题目列表失败：未返回有效数据", result?.data);
          setLoadError("服务器未返回有效数据");
          return;
        }

        setQuestions(result.data.questions);
        setTotal(result.data.total);
        setLoadError(null);
        // 清空选中状态
        setSelectedIds([]);
      } catch (e) {
        if (reqId !== reqIdRef.current) return;
        console.error("加载题目列表失败", e);
        setLoadError(e instanceof Error ? e.message : "请求失败");
        return;
      } finally {
        // 只有仍是最新请求时才收掉 loading，避免旧请求提前关闭
        if (reqId === reqIdRef.current) setLoading(false);
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
      // 解析失败与导入失败是两种原因，不能都报成"文件格式错误"
      let payload: unknown;
      try {
        payload = JSON.parse(event.target?.result as string);
      } catch (e) {
        console.warn("题目导入失败：文件不是合法 JSON", e);
        toast.error("文件不是合法 JSON");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      try {
        toast.info("正在导入...", { duration: 1000 });
        const result = await importQuestionsAction(
          payload as Parameters<typeof importQuestionsAction>[0],
        );
        // 表单校验不过时 safe-action 返回 validationErrors，不会抛异常
        if (result?.serverError) {
          toast.error("导入失败：" + result.serverError);
          return;
        }
        if (!result?.data) {
          toast.error("导入失败：文件内容不是合法的题目数据");
          return;
        }
        toast.success(`成功导入 ${result.data.count} 道题目`);
        loadQuestions();
      } catch (e) {
        console.error("题目导入失败", e);
        toast.error(
          "导入失败：" + (e instanceof Error ? e.message : "请求异常"),
        );
        return;
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
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

  // 当前页是否全选：表格表头与卡片顶部「全选当前页」共用同一判据
  const allSelected =
    questions.length > 0 && selectedIds.length === questions.length;

  // 维度中文名：表格与卡片共用（避免两套投影口径漂移）
  const getDimensionLabel = (dimension?: string) =>
    dimension === "knowledge"
      ? "识记"
      : dimension === "application"
        ? "应用"
        : "理解";

  // 标签组：表格与卡片共用同一份渲染（最多 2 个 + 余量）
  const renderTags = (q: Question) => (
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
  );

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
            <SelectTrigger className="h-11 w-[120px] sm:h-9">
              <SelectValue placeholder="维度" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有维度</SelectItem>
              <SelectItem value="knowledge">识记</SelectItem>
              <SelectItem value="understanding">理解</SelectItem>
              <SelectItem value="application">应用</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="secondary"
            className="h-11 sm:h-9"
            onClick={handleSearch}
          >
            筛选
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {selectedIds.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              className="h-11 sm:h-9"
              onClick={handleBatchDelete}
            >
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
              className="h-11 sm:h-9"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-2" />
              导入
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-11 sm:h-9"
            onClick={handleExportCsv}
            title="根据当前筛选条件导出全量数据"
          >
            <Download className="w-4 h-4 mr-2" />
            导出 CSV
          </Button>
        </div>
      </div>

      {/* 题目列表：lg 起表格 / < lg 卡片（ui-system.md §4 双投影） */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        {loading ? (
          <div className="p-4">
            {/* 表格骨架：lg 起 */}
            <div className="hidden space-y-2 lg:block">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton
                  key={`table-skeleton-${i}`}
                  className="h-12 w-full rounded-lg"
                />
              ))}
            </div>
            {/* 列表骨架：< lg */}
            <div className="space-y-2 lg:hidden">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton
                  key={`card-skeleton-${i}`}
                  className="h-20 w-full rounded-lg"
                />
              ))}
            </div>
          </div>
        ) : loadError ? (
          <ErrorState
            title="题目列表加载失败"
            description={loadError}
            onRetry={() => void loadQuestions()}
          />
        ) : questions.length === 0 ? (
          <EmptyState
            title="没有找到符合条件的题目"
            description="换个筛选条件，或先导入题库数据"
          />
        ) : (
          <>
            {/*
              桌面（lg 起）：6 列宽表格在 768 档放不下（admin 侧边栏占 16rem），
              所以与 /admin/users 一致，把表格下限收紧到 lg，md 档走卡片。
            */}
            <div
              className="hidden lg:block"
              data-testid="admin-questions-table"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        aria-label="全选当前页题目"
                        checked={allSelected}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-16">ID</TableHead>
                    <TableHead>题干内容</TableHead>
                    <TableHead className="w-32">标签</TableHead>
                    <TableHead className="w-24">维度</TableHead>
                    <TableHead className="w-24 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {questions.map((q) => (
                    <TableRow key={q.id} className="group">
                      <TableCell>
                        <Checkbox
                          aria-label={`选择题目 #${q.id}`}
                          checked={selectedIds.includes(q.id)}
                          onCheckedChange={() => toggleSelect(q.id)}
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        #{q.id}
                      </TableCell>
                      <TableCell
                        className="max-w-lg truncate font-medium text-foreground cursor-pointer hover:text-primary"
                        title="点击编辑"
                        onClick={() => setEditingQuestion(q)}
                      >
                        <div className="line-clamp-2">{q.content}</div>
                      </TableCell>
                      <TableCell>{renderTags(q)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {getDimensionLabel(q.dimension)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingQuestion(q)}
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            title="编辑"
                            aria-label={`编辑题目 #${q.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(q.id)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            title="删除"
                            aria-label={`删除题目 #${q.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* 移动/平板（< lg）：卡片投影，字段 = 题干 2 行 + 标签/维度 + 操作。
                表头的全选框在窄屏被隐藏，这里补一行「全选当前页」，
                勾选态与表格表头共用 allSelected 同一判据。 */}
            <div className="p-4 lg:hidden">
              <label className="mb-2 flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  aria-label="全选当前页题目"
                  checked={allSelected}
                  onCheckedChange={toggleSelectAll}
                />
                全选当前页
              </label>
              <ul className="space-y-2" data-testid="admin-questions-cards">
                {questions.map((q) => (
                  <li key={q.id} className="rounded-lg border bg-card p-4">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        aria-label={`选择题目 #${q.id}`}
                        className="mt-1"
                        checked={selectedIds.includes(q.id)}
                        onCheckedChange={() => toggleSelect(q.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            #{q.id}
                          </span>
                          <Badge variant="secondary">
                            {getDimensionLabel(q.dimension)}
                          </Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm leading-6">
                          {q.content}
                        </p>
                        <div className="mt-2">{renderTags(q)}</div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-11 flex-1"
                        onClick={() => setEditingQuestion(q)}
                      >
                        <Edit className="mr-1 h-4 w-4" />
                        编辑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-11 w-11 shrink-0 text-destructive hover:bg-destructive/10"
                        aria-label={`删除题目 #${q.id}`}
                        onClick={() => handleDelete(q.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        <div className="p-4 border-t border-border flex flex-col sm:flex-row justify-between items-center gap-4 bg-muted/20">
          <div className="text-sm text-muted-foreground">
            共 {total} 条记录，当前第 {page}/{totalPages || 1} 页
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 sm:h-8 sm:w-8"
              disabled={page === 1}
              aria-label="第一页"
              onClick={() => setPage(1)}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 sm:h-8 sm:w-8"
              disabled={page === 1}
              aria-label="上一页"
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
              className="h-11 w-11 sm:h-8 sm:w-8"
              disabled={page >= totalPages}
              aria-label="下一页"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 sm:h-8 sm:w-8"
              disabled={page >= totalPages}
              aria-label="最后一页"
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
              <SelectTrigger
                className="h-11 w-[70px] sm:h-8"
                aria-label="每页条数"
              >
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
