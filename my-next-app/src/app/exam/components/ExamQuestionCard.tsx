"use client";

import React, { useState } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/utils/security";
import { DIMENSION_LABELS } from "@/types";
import { countFillBlanks, type ExamDraft } from "../lib/answer-sheet";
import { questionTypeLabel } from "../lib/format";
import type { ExamQuestion } from "../lib/types";

interface ExamQuestionCardProps {
  question: ExamQuestion;
  /** 从 1 开始 */
  position: number;
  draft: ExamDraft | undefined;
  /** 单选 / 判断：替换当前选择 */
  onSelectOption: (letter: string) => void;
  /** 多选：切换某一项 */
  onToggleOption: (letter: string) => void;
  /** 填空：更新各空的值 */
  onFillChange: (blanks: string[]) => void;
  stemRef?: React.RefObject<HTMLHeadingElement | null>;
}

const TYPE_TAG_STYLES: Record<string, string> = {
  single: "bg-info-muted text-info",
  multi: "bg-primary/10 text-primary",
  truefalse: "bg-warning-muted text-warning",
  fill_blank: "bg-success-muted text-success",
};

/**
 * 考试态的题面组件。
 *
 * 为什么不直接复用 `components/practice/PracticeCard.tsx`：
 * 练习卡是"答完立刻判分并切题"的形态——单选没有选中态、多选必须点一次
 * "确认提交"、卡内还挂着 SRS 数值与反馈入口；而考试要求"选择先留住、可以
 * 来回跳、交卷才判分"。行为相反，硬套会让两边都长歪。这里沿用同一套视觉
 * 语言（题型标签、选项圈号、判断题大按钮、填空题空位）与同样的输入习惯
 * （右键/眼睛排除选项、中文分号分空），判分仍只发生在服务端。
 */
export function ExamQuestionCard({
  question,
  position,
  draft,
  onSelectOption,
  onToggleOption,
  onFillChange,
  stemRef,
}: ExamQuestionCardProps) {
  // 排除法只是作答辅助，不需要进草稿；父组件用 key={question.id} 锚定，
  // 切题即重置，因此不需要 effect 同步。
  const [excluded, setExcluded] = useState<string[]>([]);

  const options = Array.isArray(question.options) ? question.options : [];
  const type = question.type ?? "single";
  const isMulti = type === "multi";
  const isTrueFalse = type === "truefalse";
  const isFillBlank = type === "fill_blank";
  const selectedLetters = draft?.kind === "choice" ? draft.letters : [];
  const fillBlanks =
    draft?.kind === "fill"
      ? draft.blanks
      : Array<string>(countFillBlanks(question.content)).fill("");
  const blankCount = countFillBlanks(question.content);

  const materialHtml = question.material_html ?? null;
  const materialText = question.material ?? null;
  const hasMaterial = Boolean(materialHtml || materialText);

  const toggleExcluded = (event: React.MouseEvent, option: string) => {
    event.preventDefault();
    event.stopPropagation();
    setExcluded((prev) =>
      prev.includes(option)
        ? prev.filter((item) => item !== option)
        : [...prev, option],
    );
  };

  const renderFillBlankContent = (content: string) => {
    const parts = content.split(/(_{3,})/g);
    let blankIndex = 0;
    return parts.map((part, index) => {
      if (/^_{3,}$/.test(part)) {
        blankIndex += 1;
        return (
          <span
            key={index}
            className="mx-0.5 inline-block min-w-16 border-b-2 border-primary/50 px-1 text-center align-baseline text-sm text-muted-foreground"
          >
            空{blankIndex}
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  const updateBlank = (blankIndex: number, value: string) => {
    const next = Array.from({ length: blankCount }, (_, index) =>
      index === blankIndex ? value : (fillBlanks[index] ?? ""),
    );
    onFillChange(next);
  };

  return (
    <article className="rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border/70 px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-foreground px-2 font-mono text-xs font-bold tabular-nums text-background">
            {position}
          </span>
          <span
            className={cn(
              "rounded px-2 py-0.5 text-xs font-bold",
              TYPE_TAG_STYLES[type] ?? "bg-muted text-muted-foreground",
            )}
          >
            {questionTypeLabel(type)}
          </span>
          {question.dimension && (
            <span className="text-xs text-muted-foreground">
              {DIMENSION_LABELS[question.dimension] ?? question.dimension}
            </span>
          )}
          {hasMaterial && (
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
              含材料
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-4 md:px-6 md:py-5">
        {hasMaterial && (
          <div className="mb-4 rounded-lg border border-border/70 bg-muted/20 p-3 md:max-h-64 md:overflow-y-auto">
            {materialHtml ? (
              <div
                className="prose prose-sm max-w-none text-foreground dark:prose-invert"
                // 材料来自题库 HTML，入库时已清洗；这里再走一次 sanitizeHtml 兜底
                dangerouslySetInnerHTML={{
                  __html: sanitizeHtml(materialHtml),
                }}
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {materialText}
              </p>
            )}
          </div>
        )}

        <h2
          ref={stemRef}
          tabIndex={-1}
          className="mb-5 text-lg font-bold leading-relaxed text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:text-xl"
        >
          {isFillBlank
            ? renderFillBlankContent(question.content)
            : question.content}
        </h2>

        {isTrueFalse ? (
          <div className="grid grid-cols-2 gap-3">
            {[
              { letter: "A", label: "正确" },
              { letter: "B", label: "错误" },
            ].map(({ letter, label }) => {
              const selected = selectedLetters.includes(letter);
              return (
                <button
                  key={letter}
                  type="button"
                  onClick={() => onSelectOption(letter)}
                  aria-pressed={selected}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-xl border-2 py-5 text-base font-bold transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    selected
                      ? letter === "A"
                        ? "border-success bg-success-muted text-success"
                        : "border-destructive bg-destructive/10 text-destructive"
                      : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : isFillBlank ? (
          <div className="space-y-3">
            {Array.from({ length: blankCount }, (_, index) => (
              <div key={index} className="flex items-center gap-3">
                <span className="shrink-0 rounded bg-success-muted px-2 py-1 text-xs font-bold text-success">
                  空 {index + 1}
                </span>
                <input
                  type="text"
                  value={fillBlanks[index] ?? ""}
                  onChange={(event) => updateBlank(index, event.target.value)}
                  aria-label={`第 ${index + 1} 个空的答案`}
                  placeholder="填写答案"
                  className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {options.map((option, index) => {
              const letter = String.fromCharCode(65 + index);
              const selected = selectedLetters.includes(letter);
              const isExcluded = excluded.includes(option);
              return (
                <div
                  key={index}
                  className={cn(
                    "flex items-stretch rounded-lg border transition-colors",
                    isExcluded
                      ? "border-border bg-muted/40 opacity-60"
                      : selected
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-primary/40 hover:bg-accent",
                  )}
                >
                  <button
                    type="button"
                    onClick={() =>
                      isExcluded
                        ? undefined
                        : isMulti
                          ? onToggleOption(letter)
                          : onSelectOption(letter)
                    }
                    onContextMenu={(event) => toggleExcluded(event, option)}
                    aria-pressed={selected}
                    aria-disabled={isExcluded || undefined}
                    data-testid="exam-option"
                    className={cn(
                      "flex flex-1 items-center gap-3 p-3 text-left",
                      isExcluded ? "cursor-not-allowed" : "cursor-pointer",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                        selected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {letter}
                    </span>
                    <span
                      className={cn(
                        "flex-1 text-sm text-foreground",
                        isExcluded && "line-through",
                      )}
                    >
                      {option}
                    </span>
                    {isMulti && selected && (
                      <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => toggleExcluded(event, option)}
                    title={isExcluded ? "恢复选项" : "排除此项"}
                    aria-label={`${isExcluded ? "恢复" : "排除"}选项 ${letter}`}
                    className={cn(
                      "my-2 mr-2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                      isExcluded && "text-primary",
                    )}
                  >
                    {isExcluded ? (
                      <Eye className="h-4 w-4" aria-hidden />
                    ) : (
                      <EyeOff className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {isMulti && (
          <p className="mt-3 text-xs text-muted-foreground">
            多选题：可以选多项，选完继续下一题即可，交卷时统一判分。
          </p>
        )}
      </div>
    </article>
  );
}
