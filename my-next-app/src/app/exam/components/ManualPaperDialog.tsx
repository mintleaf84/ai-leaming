"use client";

import { useState } from "react";
import { BookOpen, Loader2, PenLine, Search, X } from "lucide-react";
import { keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fetchJson } from "@/lib/utils/api-client";
import { isImeComposing } from "@/lib/utils/ime";
import { useAppQuery } from "@/hooks/useAppQuery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExamRequestError, createPaper } from "../lib/api";
import { questionTypeLabel, truncateContent } from "../lib/format";
import type { ExamPaper } from "../lib/types";

interface ManualPaperDialogProps {
  onClose: () => void;
  onCreated: (paper: ExamPaper) => void;
}

/** `/api/questions` 列表项（只取选题目需要的字段，列表接口不返回答案） */
interface QuestionListItem {
  id: number;
  content: string;
  type?: string | null;
  tags: string[];
}

const PAGE_SIZE = 10;

const TYPE_FILTERS = [
  { value: "all", label: "全部题型" },
  { value: "single", label: "单项选择" },
  { value: "multi", label: "多项选择" },
  { value: "truefalse", label: "判断" },
  { value: "fill_blank", label: "填空" },
];

function defaultTitle(): string {
  const now = new Date();
  return `手工试卷 · ${now.getMonth() + 1} 月 ${now.getDate()} 日`;
}

/**
 * 手工组卷：搜索题库 → 勾选 → 建卷。
 *
 * 题库列表用的就是既有的分页接口 `GET /api/questions?page&limit&search&type`
 * （`questionService.list` 的 REST 出口），没有另建一套检索；请求走
 * `fetchJson`（带 5xx 重试），与笔记里的题目选择器同一条数据通道。
 */
export function ManualPaperDialog({
  onClose,
  onCreated,
}: ManualPaperDialogProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [timed, setTimed] = useState(false);
  const [duration, setDuration] = useState(60);

  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Map<number, QuestionListItem>>(
    () => new Map(),
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    data,
    isLoading,
    isError,
    error: loadError,
    retry,
  } = useAppQuery({
    queryKey: ["exam-question-picker", page, query, typeFilter],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (query.trim()) params.set("search", query.trim());
      if (typeFilter !== "all") params.set("type", typeFilter);
      return fetchJson<{ items: QuestionListItem[]; total: number }>(
        `/api/questions?${params.toString()}`,
      );
    },
    // 翻页/换筛选时保留上一页结果，避免每翻一页都闪一次骨架屏
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggleSelected = (question: QuestionListItem) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(question.id)) next.delete(question.id);
      else next.set(question.id, question);
      return next;
    });
  };

  const runSearch = () => {
    setPage(1);
    setQuery(searchInput);
  };

  const submit = async () => {
    setError(null);
    if (!title.trim()) {
      setError("先给这份试卷起个名字。");
      return;
    }
    if (selected.size === 0) {
      setError("至少选 1 道题。");
      return;
    }
    if (timed && (!Number.isFinite(duration) || duration < 1 || duration > 300)) {
      setError("限时时长请在 1～300 分钟之间。");
      return;
    }

    setSubmitting(true);
    try {
      const paper = await createPaper({
        title: title.trim(),
        kind: timed ? "timed" : "fixed",
        ...(timed ? { durationMinutes: Math.round(duration) } : {}),
        questionIds: [...selected.keys()],
      });
      toast.success(`已创建「${paper.title}」，共 ${paper.totalQuestions} 题`);
      onCreated(paper);
    } catch (caught) {
      // 建卷失败：日志留痕 + 弹窗内报错（400 的缺失题目由服务端文案说明）
      console.error("[exam] 手工建卷失败", { err: caught });
      if (caught instanceof ExamRequestError) {
        setError(caught.message);
        return;
      }
      setError("创建试卷失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex h-[92dvh] w-full max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <div className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <PenLine className="h-4 w-4 text-primary" aria-hidden />
            手工组卷
          </DialogTitle>
          <DialogDescription className="mt-1">
            从题库里挑选题目组成一份试卷。预览与作答都不显示答案，交卷后统一判分。
          </DialogDescription>
        </div>

        <div className="border-b border-border px-5 py-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="manual-title" className="text-xs text-muted-foreground">
                试卷名称
              </Label>
              <Input
                id="manual-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={60}
              />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={timed ? "outline" : "default"}
                  onClick={() => setTimed(false)}
                  aria-pressed={!timed}
                >
                  不限时
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={timed ? "default" : "outline"}
                  onClick={() => setTimed(true)}
                  aria-pressed={timed}
                >
                  限时
                </Button>
              </div>
              {timed && (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={1}
                    max={300}
                    value={Number.isFinite(duration) ? duration : ""}
                    onChange={(event) => setDuration(Number(event.target.value))}
                    aria-label="限时分钟数"
                    className="h-9 w-20"
                  />
                  <span className="text-xs text-muted-foreground">分钟</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2 border-b border-border px-5 py-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (isImeComposing(event)) return;
                  if (event.key === "Enter") {
                    event.preventDefault();
                    runSearch();
                  }
                }}
                placeholder="搜索题干或知识点"
                aria-label="搜索题目"
                className="pl-9"
              />
            </div>
            <Button variant="secondary" onClick={runSearch}>
              搜索
            </Button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Select
              value={typeFilter}
              onValueChange={(value) => {
                setTypeFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-32 text-xs" aria-label="按题型筛选">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_FILTERS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              已选 <strong className="text-foreground">{selected.size}</strong> 题
            </span>
          </div>

          {selected.size > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {[...selected.values()].map((question) => (
                <Badge
                  key={question.id}
                  variant="secondary"
                  className="max-w-full gap-1 pr-1 text-xs font-normal"
                >
                  <span className="truncate">
                    {truncateContent(question.content, 18)}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleSelected(question)}
                    aria-label={`取消选择：${truncateContent(question.content, 18)}`}
                    className="rounded-full p-0.5 hover:bg-background/60"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </Badge>
              ))}
              <button
                type="button"
                onClick={() => setSelected(new Map())}
                className="rounded-full px-2 py-0.5 text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
              >
                清空
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : isError ? (
            <ErrorState
              title="题库加载失败"
              description={loadError?.message}
              onRetry={retry}
            />
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center text-sm text-muted-foreground">
              <BookOpen className="mb-3 h-8 w-8 opacity-40" aria-hidden />
              {query.trim() ? "没有匹配的题目，换个关键词试试。" : "题库里还没有题目。"}
            </div>
          ) : (
            <ul className="space-y-1">
              {items.map((question) => {
                const checked = selected.has(question.id);
                return (
                  <li key={question.id}>
                    <div
                      role="checkbox"
                      aria-checked={checked}
                      tabIndex={0}
                      onClick={() => toggleSelected(question)}
                      onKeyDown={(event) => {
                        if (event.key === " " || event.key === "Enter") {
                          event.preventDefault();
                          toggleSelected(question);
                        }
                      }}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                        checked
                          ? "border-primary/30 bg-primary/5"
                          : "hover:bg-accent",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        tabIndex={-1}
                        aria-hidden
                        className="pointer-events-none mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="rounded bg-muted px-1.5 py-0.5 font-medium">
                            {questionTypeLabel(question.type)}
                          </span>
                          <span>#{question.id}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-foreground">
                          {question.content}
                        </p>
                        {question.tags.length > 0 && (
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {question.tags.join(" · ")}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-2 border-t border-border px-5 py-3">
          {totalPages > 1 && (
            <div className="flex justify-center">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              共 {total} 道题可挑
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose} disabled={submitting}>
                取消
              </Button>
              <Button
                onClick={() => void submit()}
                disabled={submitting || selected.size === 0}
              >
                {submitting && (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
                )}
                建卷（{selected.size} 题）
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
