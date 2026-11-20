"use client";

import { Inbox, Layers, Info } from "lucide-react";
import { useAppQuery } from "@/hooks/useAppQuery";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { AgentSetCard } from "./components/AgentSetCard";
import { fetchAgentSetList } from "./lib/api";
import { sortAgentSets } from "./lib/stats";

/**
 * AI 题集列表。
 *
 * 数据只来自 `GET /api/agent-sets`（cookie 认证）。取数据走全站统一的
 * `useAppQuery`：接口 500 必须渲染成错误态，而不是"还没有题集"——后者会让用户
 * 以为 Agent 推的题丢了。
 *
 * 这一页没有"新建"：题集是外部 Agent 推来的，用户能做的只有查看、练、反馈。
 */
export default function AgentSetsListClient() {
  const { data, isLoading, isError, error, retry } = useAppQuery({
    queryKey: ["agent-sets"],
    queryFn: fetchAgentSetList,
  });

  const sets = sortAgentSets(data?.items ?? []);
  const hasUnread = sets.some((set) => set.unread);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-10">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          专属推送
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          AI 题集
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          来自外部 Agent 的针对性练习批次，按你的错题与弱项挑的题。
          {hasUnread && (
            <span className="ml-1 font-medium text-primary">
              有新的批次还没看。
            </span>
          )}
        </p>
      </header>

      <p className="mt-4 flex items-start gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          这些题不进题库，也不会改变你的掌握度统计；做过之后会照常记进练习记录与
          错题本。觉得哪道题有问题，可以在题集里直接反馈给 Agent。
        </span>
      </p>

      <section aria-label="我的题集" className="mt-5 md:mt-6" aria-busy={isLoading}>
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-36 w-full rounded-xl" />
            ))}
          </div>
        )}

        {isError && (
          <ErrorState
            title="题集没加载出来"
            description={error?.message}
            onRetry={retry}
          />
        )}

        {!isLoading && !isError && sets.length === 0 && (
          <EmptyState
            icon={<Inbox className="h-10 w-10" aria-hidden />}
            title="还没有收到题集"
            description="外部 Agent 推来的题目会出现在这里。收到后可以直接逐题练，也能一键做成试卷。"
            className="rounded-xl border border-dashed border-border bg-card/40"
          />
        )}

        {!isLoading && !isError && sets.length > 0 && (
          <ul className="space-y-3">
            {sets.map((set) => (
              <li key={set.id}>
                <AgentSetCard set={set} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 flex items-center gap-1.5 text-xs text-muted-foreground/70">
        <Layers className="h-3.5 w-3.5" aria-hidden />
        批次推来后不会变；想换个难度，让 Agent 再推一批就行。
      </p>
    </div>
  );
}
