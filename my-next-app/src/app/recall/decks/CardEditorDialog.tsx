"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { actionErrorMessage, saveRecallCard } from "../lib/actions";
import type { RecallDeckCardView } from "./types";

const MAX_ITEMS = 6;
const MAX_BLANK_ANSWERS = 3;
const MAX_KEYWORDS = 20;

interface ItemDraft {
  text: string;
  keywords: string;
  /** 打开编辑器时的原始关键词：round-trip 守卫的对照值（新增条目为空数组） */
  originalKeywords: string[];
}

interface BlankDraft {
  answers: string;
  /** 打开编辑器时的原始答案（同上） */
  originalAnswers: string[];
}

/** 关键词输入框的展示分隔符（必须与 `setItems` 的 join 一致，否则守卫永远比不中） */
const KEYWORD_SEPARATOR = "，";
/** 填空答案输入框的展示分隔符（同上） */
const BLANK_SEPARATOR = " | ";

/** `|`、中英文逗号、分号都当分隔符；**不用顿号**——答案本身可能带顿号（危及人身安全、健康） */
function splitValues(raw: string): string[] {
  return raw
    .split(/[|,，;；]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * 值输入的 **round-trip 守卫**。
 *
 * 把数组摊成一段文本再读回来是有损的：`["1,000"]` 展示成 `1,000`，按逗号切回去
 * 就变成 `["1","000"]` —— 用户只是打开又保存了一次，值却被拆坏了。
 * 所以先比「文本是否还是原样的 join 结果」：相等就原样返回原数组，只有用户真的
 * 改过这段文本时才按分隔符切分。
 */
function resolveValues(
  raw: string,
  original: string[],
  separator: string,
): string[] {
  if (original.length > 0 && raw.trim() === original.join(separator)) {
    return original
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }
  return splitValues(raw);
}

/**
 * 关键词留空时按标点机械切分（规格 §1.2：`keywords` 可由条目文本机械切分生成）。
 * 切不出两段以上就退回整条文本：入库校验要求 ≥1 个关键词，宁可判分偏严也不能存空。
 */
function deriveKeywords(text: string): string[] {
  const chunks = splitValues(
    text.replace(/[、。：:！？!?（）()《》「」\s]+/g, "|"),
  );
  const keywords = chunks.slice(0, MAX_KEYWORDS);
  return keywords.length > 0 ? keywords : [text];
}

function newCardId(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** 题干里的空位个数（`【　】` 形式） */
function countBlanks(prompt: string): number {
  return (prompt.match(/【[^】]*】/g) ?? []).length;
}

export function CardEditorDialog({
  open,
  onOpenChange,
  deckKey,
  deckTitle,
  card,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckKey: string;
  deckTitle: string;
  card: RecallDeckCardView | null;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<"list" | "cloze">("list");
  const [prompt, setPrompt] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([
    { text: "", keywords: "", originalKeywords: [] },
  ]);
  const [blanks, setBlanks] = useState<BlankDraft[]>([
    { answers: "", originalAnswers: [] },
  ]);
  const [busy, setBusy] = useState(false);
  // 新建卡片的编号：**打开对话框时生成一次**。每次保存都重新生成的话，
  // "第一次其实成功了、只是响应丢了"的重试会再建一张重复的卡。
  const draftCardIdRef = useRef("");

  const resolveCardId = () => {
    if (card) return card.cardId;
    if (!draftCardIdRef.current) draftCardIdRef.current = newCardId();
    return draftCardIdRef.current;
  };

  // 每次打开都按当前卡片重置：编辑不同卡片时不能残留上一张的草稿
  useEffect(() => {
    if (!open) return;
    draftCardIdRef.current = card?.cardId ?? newCardId();
    setKind(card?.kind ?? "list");
    setPrompt(card?.prompt ?? "");
    setItems(
      card?.items && card.items.length > 0
        ? card.items.map((item) => ({
            text: item.text,
            keywords: item.keywords.join(KEYWORD_SEPARATOR),
            originalKeywords: [...item.keywords],
          }))
        : [{ text: "", keywords: "", originalKeywords: [] }],
    );
    setBlanks(
      card?.blanks && card.blanks.length > 0
        ? card.blanks.map((blank) => ({
            answers: blank.answers.join(BLANK_SEPARATOR),
            originalAnswers: [...blank.answers],
          }))
        : [{ answers: "", originalAnswers: [] }],
    );
  }, [open, card]);

  const updateItem = (index: number, patch: Partial<ItemDraft>) => {
    setItems((previous) =>
      previous.map((item, at) => (at === index ? { ...item, ...patch } : item)),
    );
  };

  const handleSave = async () => {
    const question = prompt.trim();
    if (!question) {
      toast.error("题目不能为空");
      return;
    }

    if (kind === "list") {
      const drafts = items
        .map((item) => ({
          text: item.text.trim(),
          keywords: resolveValues(
            item.keywords,
            item.originalKeywords,
            KEYWORD_SEPARATOR,
          ),
        }))
        .filter((item) => item.text.length > 0);

      if (drafts.length === 0) {
        toast.error("至少写一条要点");
        return;
      }
      if (drafts.length > MAX_ITEMS) {
        toast.error(`列举卡最多 ${MAX_ITEMS} 条，超出请拆成两张卡`);
        return;
      }

      const payload = drafts.map((item) => ({
        text: item.text,
        keywords:
          item.keywords.length > 0
            ? item.keywords.slice(0, MAX_KEYWORDS)
            : deriveKeywords(item.text),
      }));

      setBusy(true);
      try {
        await saveRecallCard({
          deckKey,
          cardId: resolveCardId(),
          prompt: question,
          kind: "list",
          items: payload,
        });
        toast.success(card ? "已保存" : "已添加");
        onSaved();
        onOpenChange(false);
      } catch (error) {
        // 保存失败：对话框与草稿都留着，用户可以直接再按一次
        console.error("[recall] 保存列举卡失败", error);
        toast.error(`没有保存成功：${actionErrorMessage(error)}`);
        return;
      } finally {
        setBusy(false);
      }
      return;
    }

    const answerDrafts = blanks
      .map((blank) => ({
        answers: resolveValues(
          blank.answers,
          blank.originalAnswers,
          BLANK_SEPARATOR,
        ),
      }))
      .filter((blank) => blank.answers.length > 0);

    if (answerDrafts.length === 0) {
      toast.error("至少写一个空的可接受答案");
      return;
    }
    if (
      answerDrafts.some((blank) => blank.answers.length > MAX_BLANK_ANSWERS)
    ) {
      toast.error(`每个空最多 ${MAX_BLANK_ANSWERS} 个可接受答案`);
      return;
    }
    const blanksInPrompt = countBlanks(question);
    if (blanksInPrompt > 0 && blanksInPrompt !== answerDrafts.length) {
      toast.error(
        `题干里有 ${blanksInPrompt} 个【　】空位，但这里写了 ${answerDrafts.length} 个空`,
      );
      return;
    }

    setBusy(true);
    try {
      await saveRecallCard({
        deckKey,
        cardId: resolveCardId(),
        prompt: question,
        kind: "cloze",
        blanks: answerDrafts,
      });
      toast.success(card ? "已保存" : "已添加");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error("[recall] 保存填空卡失败", error);
      toast.error(`没有保存成功：${actionErrorMessage(error)}`);
      return;
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{card ? "编辑卡片" : "新建卡片"}</DialogTitle>
          <DialogDescription>{deckTitle}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>类型</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(
                [
                  { value: "list", label: "列举", hint: "写出若干条要点" },
                  { value: "cloze", label: "填空", hint: "题干里留【　】" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setKind(option.value)}
                  aria-pressed={kind === option.value}
                  className={cn(
                    "min-h-11 rounded-lg border px-3 py-2 text-left transition-colors",
                    kind === option.value
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-card hover:bg-accent/40",
                  )}
                >
                  <span className="block text-sm font-medium text-foreground">
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {option.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="recall-card-prompt">题目</Label>
            <Textarea
              id="recall-card-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={3}
              placeholder={
                kind === "list"
                  ? "例：写出《教育法》中学校对学生负安全责任的主要情形"
                  : "例：学校不得使未成年学生在【　】的校舍和其他教育教学设施中活动。"
              }
              className="mt-2 text-base leading-relaxed md:text-base"
            />
          </div>

          {kind === "list" ? (
            <div>
              <div className="flex items-center justify-between gap-2">
                <Label>要点</Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {items.length} / {MAX_ITEMS}
                </span>
              </div>
              <div className="mt-2 space-y-2">
                {items.map((item, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 space-y-2">
                      <Input
                        value={item.text}
                        onChange={(event) =>
                          updateItem(index, { text: event.target.value })
                        }
                        placeholder={`第 ${index + 1} 条要点`}
                        className="h-11"
                      />
                      <Input
                        value={item.keywords}
                        onChange={(event) =>
                          updateItem(index, { keywords: event.target.value })
                        }
                        placeholder="关键词，逗号分隔（留空自动从要点里切）"
                        className="h-11"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 shrink-0 text-muted-foreground"
                      onClick={() =>
                        setItems((previous) =>
                          previous.length > 1
                            ? previous.filter((_, at) => at !== index)
                            : previous,
                        )
                      }
                      aria-label={`删除第 ${index + 1} 条要点`}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                className="mt-2 h-11 px-3"
                disabled={items.length >= MAX_ITEMS}
                onClick={() =>
                  setItems((previous) => [
                    ...previous,
                    { text: "", keywords: "", originalKeywords: [] },
                  ])
                }
              >
                <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                再加一条
              </Button>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between gap-2">
                <Label>空位答案</Label>
                <span className="text-xs text-muted-foreground">
                  题干里有 {countBlanks(prompt)} 个【　】
                </span>
              </div>
              <div className="mt-2 space-y-2">
                {blanks.map((blank, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <Input
                      value={blank.answers}
                      onChange={(event) =>
                        setBlanks((previous) =>
                          previous.map((draft, at) =>
                            at === index
                              ? { ...draft, answers: event.target.value }
                              : draft,
                          ),
                        )
                      }
                      placeholder={`第 ${index + 1} 空，多个答案用 | 分隔（最多 ${MAX_BLANK_ANSWERS} 个）`}
                      className="h-11"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 shrink-0 text-muted-foreground"
                      onClick={() =>
                        setBlanks((previous) =>
                          previous.length > 1
                            ? previous.filter((_, at) => at !== index)
                            : previous,
                        )
                      }
                      aria-label={`删除第 ${index + 1} 空`}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                className="mt-2 h-11 px-3"
                onClick={() =>
                  setBlanks((previous) => [
                    ...previous,
                    { answers: "", originalAnswers: [] },
                  ])
                }
              >
                <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                再加一个空
              </Button>
              {countBlanks(prompt) === 0 && (
                <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <AlertCircle
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
                    aria-hidden
                  />
                  题干里还没有【　】空位。填空卡要把空位写进题干，作答时才知道填哪里。
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            className="h-11"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            取消
          </Button>
          <Button
            type="button"
            className="h-11"
            onClick={handleSave}
            disabled={busy}
          >
            {busy ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
