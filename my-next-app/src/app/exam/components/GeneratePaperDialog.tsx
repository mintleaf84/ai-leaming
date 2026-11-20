"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KeypointTree } from "@/components/practice/KeypointTree";
import { DIMENSION_LABELS } from "@/types";
import { ExamRequestError, generatePaper } from "../lib/api";
import type { ExamPaper, GeneratePaperInput } from "../lib/types";

interface GeneratePaperDialogProps {
  onClose: () => void;
  onCreated: (paper: ExamPaper) => void;
}

const COUNT_PRESETS = [10, 20, 40];
const DURATION_PRESETS = [30, 60, 90];
const EXCLUDE_OPTIONS = [
  { value: "0", label: "不排除" },
  { value: "3", label: "最近 3 天" },
  { value: "7", label: "最近 7 天" },
  { value: "14", label: "最近 14 天" },
];
const TYPE_OPTIONS = [
  { value: "single", label: "单项选择" },
  { value: "multi", label: "多项选择" },
  { value: "truefalse", label: "判断" },
  { value: "fill_blank", label: "填空" },
];
const DIMENSION_OPTIONS = ["knowledge", "understanding", "application"];

function defaultTitle(): string {
  const now = new Date();
  return `模考 · ${now.getMonth() + 1} 月 ${now.getDate()} 日`;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label className="text-sm font-semibold text-foreground">{label}</Label>
        {hint && (
          <span className="text-right text-xs text-muted-foreground">
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function ChipButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function CheckRow({
  options,
  selected,
  onToggle,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {options.map((option) => {
        const checked = selected.includes(option.value);
        return (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
          >
            <Checkbox
              checked={checked}
              onCheckedChange={() => onToggle(option.value)}
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

/**
 * 自动组卷对话框（契约 §3）。
 *
 * 只做"收集规则 → POST /papers/generate"；抽题、配额、去重、不足则 400 全在服务端。
 * 题库题量不足时不静默缩水：把服务端回的 `{requested, available, shortfall}` 原样
 * 讲给用户听，并指出可放宽哪几个条件。
 */
export function GeneratePaperDialog({
  onClose,
  onCreated,
}: GeneratePaperDialogProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [count, setCount] = useState(20);
  const [timed, setTimed] = useState(true);
  const [duration, setDuration] = useState(60);
  const [tags, setTags] = useState<string[]>([]);
  const [showTagTree, setShowTagTree] = useState(false);
  const [dimensions, setDimensions] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([
    "single",
    "multi",
    "truefalse",
  ]);
  const [excludeRecent, setExcludeRecent] = useState("0");
  const [weights, setWeights] = useState({ wrong: 0.3, weak: 0.3, fresh: 0.4 });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weightSum = weights.wrong + weights.weak + weights.fresh;

  const toggleInList = (
    list: string[],
    value: string,
    setter: (next: string[]) => void,
  ) => {
    setter(
      list.includes(value)
        ? list.filter((item) => item !== value)
        : [...list, value],
    );
  };

  const submit = async () => {
    setError(null);
    if (!title.trim()) {
      setError("先给这份试卷起个名字。");
      return;
    }
    if (!Number.isFinite(count) || count < 1) {
      setError("题量至少 1 题。");
      return;
    }
    if (
      timed &&
      (!Number.isFinite(duration) || duration < 1 || duration > 300)
    ) {
      setError("限时时长请在 1～300 分钟之间。");
      return;
    }
    if (weightSum <= 0) {
      setError("三项抽题权重都是 0，请至少给一项权重。");
      return;
    }

    const payload: GeneratePaperInput = {
      title: title.trim(),
      kind: timed ? "timed" : "fixed",
      ...(timed ? { durationMinutes: Math.round(duration) } : {}),
      count: Math.round(count),
      ...(tags.length > 0 ? { tags } : {}),
      ...(dimensions.length > 0 ? { dimensions } : {}),
      ...(types.length > 0 ? { types } : {}),
      ...(Number(excludeRecent) > 0
        ? { excludeRecentDays: Number(excludeRecent) }
        : {}),
      weights: {
        wrong: weights.wrong,
        weak: weights.weak,
        fresh: weights.fresh,
      },
    };

    setSubmitting(true);
    try {
      const paper = await generatePaper(payload);
      toast.success(`已生成「${paper.title}」，共 ${paper.totalQuestions} 题`);
      onCreated(paper);
    } catch (caught) {
      // 组卷失败：日志留痕 + 在弹窗里给出可执行的下一步（不静默缩水题量）
      console.error("[exam] 自动组卷失败", { err: caught });
      if (caught instanceof ExamRequestError) {
        const body = caught.body;
        if (
          caught.status === 400 &&
          typeof body === "object" &&
          body !== null &&
          "shortfall" in body
        ) {
          const details = body as {
            requested?: number;
            available?: number;
            shortfall?: number;
          };
          setError(
            `符合条件的题只有 ${details.available ?? 0} 道，还差 ${
              details.shortfall ?? 0
            } 道。可以减少题量，或放宽考点、维度与「排除最近做过的题」。`,
          );
          return;
        }
        setError(caught.message);
        return;
      }
      setError("生成试卷失败，请稍后重试。");
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
      <DialogContent className="flex max-h-[92dvh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <div className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            自动组卷
          </DialogTitle>
          <DialogDescription className="mt-1">
            按做错过的题、薄弱考点和没做过的题抽题，生成一张可以反复作答的试卷。
          </DialogDescription>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <Field label="试卷名称">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={60}
              placeholder="例如：教育心理学 · 第四次模考"
            />
          </Field>

          <Field label="题量" hint={`${count} 题`}>
            <div className="flex flex-wrap items-center gap-2">
              {COUNT_PRESETS.map((preset) => (
                <ChipButton
                  key={preset}
                  active={count === preset}
                  onClick={() => setCount(preset)}
                >
                  {preset} 题
                </ChipButton>
              ))}
              <Input
                type="number"
                min={1}
                max={100}
                value={Number.isFinite(count) ? count : ""}
                onChange={(event) => setCount(Number(event.target.value))}
                aria-label="自定义题量"
                className="h-8 w-24"
              />
            </div>
          </Field>

          <Field label="考试形式">
            <div className="flex flex-wrap items-center gap-2">
              <ChipButton active={!timed} onClick={() => setTimed(false)}>
                不限时
              </ChipButton>
              <ChipButton active={timed} onClick={() => setTimed(true)}>
                限时
              </ChipButton>
              {timed && (
                <div className="flex items-center gap-2">
                  {DURATION_PRESETS.map((preset) => (
                    <ChipButton
                      key={preset}
                      active={duration === preset}
                      onClick={() => setDuration(preset)}
                    >
                      {preset} 分钟
                    </ChipButton>
                  ))}
                  <Input
                    type="number"
                    min={1}
                    max={300}
                    value={Number.isFinite(duration) ? duration : ""}
                    onChange={(event) =>
                      setDuration(Number(event.target.value))
                    }
                    aria-label="自定义限时分钟数"
                    className="h-8 w-20"
                  />
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              限时试卷到点会自动交卷；不限时则可以慢慢做，随时手动交卷。
            </p>
          </Field>

          <Field
            label="考点范围"
            hint={tags.length > 0 ? `已选 ${tags.length} 个` : "默认全部考点"}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowTagTree((prev) => !prev)}
              aria-expanded={showTagTree}
            >
              {showTagTree ? "收起考点" : "按考点筛选"}
            </Button>
            {showTagTree && (
              <KeypointTree
                selectedTags={tags}
                onSelectionChange={setTags}
                maxHeight="220px"
              />
            )}
          </Field>

          <Field label="认知维度" hint="不选 = 不限">
            <CheckRow
              options={DIMENSION_OPTIONS.map((value) => ({
                value,
                label: DIMENSION_LABELS[value] ?? value,
              }))}
              selected={dimensions}
              onToggle={(value) =>
                toggleInList(dimensions, value, setDimensions)
              }
            />
          </Field>

          <Field label="题型" hint="只支持能自动判分的客观题">
            <CheckRow
              options={TYPE_OPTIONS}
              selected={types}
              onToggle={(value) => toggleInList(types, value, setTypes)}
            />
          </Field>

          <Field label="排除最近做过的题">
            <Select value={excludeRecent} onValueChange={setExcludeRecent}>
              <SelectTrigger
                className="h-9 w-full sm:w-48"
                aria-label="排除最近做过的题"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXCLUDE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="抽题权重" hint="按比例分配，不必相加等于 1">
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  { key: "wrong", label: "做错过" },
                  { key: "weak", label: "考点薄弱" },
                  { key: "fresh", label: "没做过" },
                ] as const
              ).map((item) => (
                <div key={item.key} className="space-y-1">
                  <Label
                    htmlFor={`weight-${item.key}`}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    {item.label}
                  </Label>
                  <Input
                    id={`weight-${item.key}`}
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={weights[item.key]}
                    onChange={(event) =>
                      setWeights((prev) => ({
                        ...prev,
                        [item.key]: Math.min(
                          1,
                          Math.max(0, Number(event.target.value) || 0),
                        ),
                      }))
                    }
                    className="h-9"
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              当前比例 做错过 {Math.round(weights.wrong * 100)}% · 薄弱{" "}
              {Math.round(weights.weak * 100)}% · 没做过{" "}
              {Math.round(weights.fresh * 100)}%
            </p>
          </Field>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
          <span className="hidden text-xs text-muted-foreground sm:block">
            生成后仍可预览题目，答案在交卷前不可见。
          </span>
          <div className="flex flex-1 justify-end gap-2 sm:flex-none">
            <Button variant="ghost" onClick={onClose} disabled={submitting}>
              取消
            </Button>
            <Button onClick={() => void submit()} disabled={submitting}>
              {submitting && (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
              )}
              生成试卷
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
