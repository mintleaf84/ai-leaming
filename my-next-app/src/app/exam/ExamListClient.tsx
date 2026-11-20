"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PenLine, ScrollText, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAppQuery } from "@/hooks/useAppQuery";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { deletePaper, fetchPaperList } from "./lib/api";
import type { ExamPaper } from "./lib/types";
import { PaperCard } from "./components/PaperCard";
import { GeneratePaperDialog } from "./components/GeneratePaperDialog";
import { ManualPaperDialog } from "./components/ManualPaperDialog";
import { ExamConfirmDialog } from "./components/ExamConfirmDialog";

const PAGE_SIZE = 12;

/**
 * 试卷列表。
 *
 * 数据只来自 `GET /api/exam/papers`（cookie 认证）。取数据走全站统一的
 * `useAppQuery`（四态语义写死在 hook 注释里），不在页面里自己写 loading 状态机：
 * 那样最容易把"接口失败"渲染成"暂无试卷"。
 */
export default function ExamListClient() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ExamPaper | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, isLoading, isError, error, retry, refetch } = useAppQuery({
    queryKey: ["exam-papers", page],
    queryFn: () =>
      fetchPaperList({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
  });

  const papers = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleCreated = (paper: ExamPaper) => {
    setGenerateOpen(false);
    setManualOpen(false);
    router.push(`/exam/${paper.id}`);
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deletePaper(pendingDelete.id);
      toast.success("试卷已删除");
      setPendingDelete(null);
      // 删掉当页最后一条时回退一页（换页会换 queryKey 自动重取）
      if (papers.length === 1 && page > 1) setPage(page - 1);
      else void refetch();
    } catch (caught) {
      // 删除失败要可见：日志留痕 + 明确提示 + 关掉确认框（不让用户卡在浮层里）
      console.error("[exam] 删除试卷失败", {
        paperId: pendingDelete.id,
        err: caught,
      });
      toast.error(
        caught instanceof Error ? caught.message : "删除失败，请稍后重试",
      );
      setPendingDelete(null);
      return;
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            模考
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            试卷
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            按弱项自动组卷，或从题库手工挑题。交卷后自动判分，
            答错的题会直接进错题本。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setGenerateOpen(true)} className="gap-2">
            <Sparkles className="h-4 w-4" aria-hidden />
            自动组卷
          </Button>
          <Button
            variant="outline"
            onClick={() => setManualOpen(true)}
            className="gap-2"
          >
            <PenLine className="h-4 w-4" aria-hidden />
            手工组卷
          </Button>
        </div>
      </header>

      <section
        aria-label="我的试卷"
        className="mt-6 md:mt-8"
        aria-busy={isLoading}
      >
        {isLoading && (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-40 w-full rounded-xl" />
            ))}
          </div>
        )}

        {isError && (
          <ErrorState
            title="试卷列表没加载出来"
            description={error?.message}
            onRetry={retry}
          />
        )}

        {!isLoading && !isError && papers.length === 0 && (
          <EmptyState
            icon={<ScrollText className="h-10 w-10" aria-hidden />}
            title="还没有试卷"
            description="让系统按弱项自动组一套，或者从题库里挑题手工组卷。"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setGenerateOpen(true)} className="gap-2">
                  <Sparkles className="h-4 w-4" aria-hidden />
                  自动组卷
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setManualOpen(true)}
                  className="gap-2"
                >
                  <PenLine className="h-4 w-4" aria-hidden />
                  手工组卷
                </Button>
              </div>
            }
            className="rounded-xl border border-dashed border-border bg-card/40"
          />
        )}

        {!isLoading && !isError && papers.length > 0 && (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              {papers.map((paper) => (
                <PaperCard
                  key={paper.id}
                  paper={paper}
                  onDelete={setPendingDelete}
                />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="mt-6 flex justify-center">
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </section>

      {generateOpen && (
        <GeneratePaperDialog
          onClose={() => setGenerateOpen(false)}
          onCreated={handleCreated}
        />
      )}
      {manualOpen && (
        <ManualPaperDialog
          onClose={() => setManualOpen(false)}
          onCreated={handleCreated}
        />
      )}
      <ExamConfirmDialog
        open={pendingDelete !== null}
        title="删除这份试卷？"
        description={
          pendingDelete
            ? `「${pendingDelete.title}」会被删除，试卷里的题目不会受影响。已经作答过的试卷无法删除。`
            : ""
        }
        confirmLabel={deleting ? "删除中…" : "删除"}
        destructive
        onConfirm={() => void handleDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
