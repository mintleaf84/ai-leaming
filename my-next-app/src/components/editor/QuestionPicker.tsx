"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { searchQuestionsAction } from "@/server/actions/question";
import { type QuestionSummary } from "@/lib/services/question";
import { Search, Loader2, BookOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { isImeComposing } from "@/lib/utils/ime";

interface QuestionPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (questionId: number) => void;
}

/**
 * 题目选择器弹窗
 * 用于在笔记中插入题目引用
 *
 * 形态确认：它是**居中模态**（fixed inset-0 flex items-center justify-center +
 * max-w-lg），不是锚在输入框下方的 popover —— 所以套 Dialog 而不是 Popover。
 */
export default function QuestionPicker({
  isOpen,
  onClose,
  onSelect,
}: QuestionPickerProps) {
  const [query, setQuery] = useState("");
  const [questions, setQuestions] = useState<QuestionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Radix 关闭时默认把焦点还给 DialogTrigger；本组件由外部状态驱动、没有
  // Trigger，不兜底焦点会落到 body（读屏回到页首）。
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // 题型中文映射
  const typeLabel: Record<string, string> = {
    single_choice: "单选",
    multiple_choice: "多选",
    true_false: "判断",
  };

  // 搜索题目
  const handleSearch = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    const result = await searchQuestionsAction(query, 15);
    setLoading(false);

    if (result.success && result.questions) {
      setQuestions(result.questions);
    } else {
      setQuestions([]);
    }
  }, [query]);

  // 初次打开时加载最近题目
  useEffect(() => {
    if (isOpen && !searched) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleSearch();
    }
  }, [isOpen, searched, handleSearch]);

  // 关闭时重置状态
  useEffect(() => {
    if (!isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery("");
      setQuestions([]);
      setSearched(false);
    }
  }, [isOpen]);

  // 选择题目
  const handleSelect = (questionId: number) => {
    onSelect(questionId);
    onClose();
  };

  // 键盘事件：Enter 触发搜索（组合态 Enter 是确认候选词，不能当"搜索"）。
  // Esc 交给 Radix 的 DismissableLayer 统一处理，组合态下由 onEscapeKeyDown 拦掉。
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isImeComposing(e)) return;
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        hideClose
        aria-modal="true"
        aria-describedby={undefined}
        // Esc 取消输入法候选词时不能顺手把浮层关掉（Radix 的 Esc 监听不判组合态）
        onEscapeKeyDown={(event) => {
          if (isImeComposing(event)) event.preventDefault();
        }}
        // 原来 Input 上的 autoFocus 明确指向搜索框；Radix 默认聚焦第一个可聚焦
        // 元素（这里是头部关闭按钮），显式接管回原目标
        onOpenAutoFocus={(event) => {
          // 必须在 Radix 移焦点之前记录触发元素（此时 activeElement 还是它）
          restoreFocusRef.current =
            document.activeElement as HTMLElement | null;
          event.preventDefault();
          searchInputRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = restoreFocusRef.current;
          if (target?.isConnected) {
            target.focus();
            return;
          }
          const main = document.querySelector<HTMLElement>("main");
          if (main) {
            main.setAttribute("tabindex", "-1");
            main.focus();
          }
        }}
        className="flex max-h-[70vh] max-w-lg flex-col gap-0 overflow-hidden rounded-xl p-0 data-[state=closed]:animate-none data-[state=open]:animate-none sm:rounded-xl"
        overlayClassName="bg-black/50"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <DialogTitle className="text-lg font-semibold leading-7 tracking-normal flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            引用题目
          </DialogTitle>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* 搜索栏 */}
        <div className="p-4 border-b border-border">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="搜索题目内容或知识点..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-9"
              />
            </div>
            <Button onClick={handleSearch} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "搜索"}
            </Button>
          </div>
        </div>

        {/* 结果列表 */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              搜索中...
            </div>
          ) : questions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <BookOpen className="h-10 w-10 mb-3 opacity-50" />
              <p>{searched ? "未找到匹配的题目" : "输入关键词搜索题目"}</p>
            </div>
          ) : (
            <ul className="space-y-1">
              {questions.map((q) => (
                <li key={q.id}>
                  <button
                    onClick={() => handleSelect(q.id)}
                    className="w-full text-left p-3 rounded-lg hover:bg-accent transition-colors group"
                  >
                    <div className="flex items-start gap-3">
                      <span className="shrink-0 px-2 py-0.5 text-xs font-medium rounded bg-primary/10 text-primary">
                        {typeLabel[q.type] || q.type}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                          {q.content}
                        </p>
                        {q.tags.length > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground truncate">
                            {q.tags.join(" › ")}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        #{q.id}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
