"use client";

import Link from "next/link";
import { ArrowRight, CheckCheck, Sparkles, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  formatSetDate,
  formatSetSource,
  formatSetScore,
  splitTags,
} from "../lib/display";
import { progressPercent } from "../lib/stats";
import type { AgentSetSummary } from "../lib/types";

/**
 * 题集列表卡片。
 *
 * 视觉语言沿用试卷卡片（整卡可点、hover 描边），差别在信息密度：题集是「谁推的、
 * 针对什么、还剩多少」，所以来源与考点放在标题正下方，进度用一条细线表示，
 * 蓝紫色只留给「新批次」角标与进度条，避免每张卡都在喊。
 */
export function AgentSetCard({ set }: { set: AgentSetSummary }) {
  const { shown, rest } = splitTags(set.targetTags);
  const score = formatSetScore(set.lastScore);
  const created = formatSetDate(set.createdAt);
  const percent = progressPercent(set.doneCount, set.totalQuestions);
  const empty = set.pendingCount === 0;

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card transition-colors",
        set.unread
          ? "border-primary/30 ring-1 ring-primary/10"
          : "border-border",
        "hover:border-primary/40 hover:shadow-sm",
      )}
    >
      {set.unread && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1 bg-primary/70"
        />
      )}

      <Link
        href={`/agent-sets/${set.id}`}
        className="block rounded-xl p-4 pl-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:p-5 md:pl-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold leading-snug text-foreground md:text-lg">
                {set.title}
              </h3>
              {set.unread && (
                <Badge className="border-transparent bg-primary px-2 py-0 text-[10px] font-bold tracking-wide">
                  新
                </Badge>
              )}
              {set.status === "promoted" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-success-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">
                  <CheckCheck className="h-3 w-3" aria-hidden />
                  已转正
                </span>
              )}
            </div>

            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wand2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                来自 {formatSetSource(set.agent, set.model)}
              </span>
              {created && (
                <span className="shrink-0 text-muted-foreground/60">
                  · {created}
                </span>
              )}
            </p>
          </div>

          <span className="hidden shrink-0 items-center gap-1 pt-1 text-sm font-semibold text-primary sm:inline-flex">
            查看
            <ArrowRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </span>
        </div>

        {shown.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Sparkles
              className="h-3 w-3 text-muted-foreground/70"
              aria-hidden
            />
            {shown.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
            {rest > 0 && (
              <span className="text-[11px] text-muted-foreground/70">
                +{rest}
              </span>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>共 {set.totalQuestions} 题</span>
          <span className={cn(empty ? "" : "font-medium text-foreground")}>
            {empty ? "都做完了" : `未做 ${set.pendingCount} 题`}
          </span>
          {set.flaggedCount > 0 && <span>已反馈 {set.flaggedCount} 题</span>}
          {score ? (
            <span className="inline-flex items-center gap-1">
              <span className="text-muted-foreground/60">最近成绩</span>
              <span className="font-semibold text-foreground">{score}</span>
            </span>
          ) : (
            <span className="text-muted-foreground/70">还没做过</span>
          )}
        </div>

        <div
          className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="本批完成进度"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span
            className="block h-full rounded-full bg-primary/70 transition-[width] duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </Link>
    </article>
  );
}
