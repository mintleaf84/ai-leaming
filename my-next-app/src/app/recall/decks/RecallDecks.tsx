"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Layers, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

import { actionErrorMessage, deleteRecallCard } from "../lib/actions";
import { CardEditorDialog } from "./CardEditorDialog";
import { ImportDeckDialog } from "./ImportDeckDialog";
import type { RecallDeckCardView, RecallDeckView } from "./types";

/**
 * 卡组与卡片管理（规格 §4.4：建卡/改卡 ≤3 步，不强制填任何可选字段）。
 *
 * 数据来自服务端页面（卡片内容由 `exportDeck` 读），改完之后 `router.refresh()`
 * 让服务端重新算一遍，避免客户端自己维护一份卡片列表再和库里的真相漂移。
 */
export function RecallDecks({ decks }: { decks: RecallDeckView[] }) {
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState(decks[0]?.deckKey ?? "");
  const [importOpen, setImportOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<RecallDeckCardView | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const selected =
    decks.find((deck) => deck.deckKey === selectedKey) ?? decks[0];

  // 「导入卡组」是从 /recall 的空状态跳过来的，带 #import 就先把对话框打开
  useEffect(() => {
    if (window.location.hash === "#import") setImportOpen(true);
  }, []);

  const openEditor = (card: RecallDeckCardView | null) => {
    setEditingCard(card);
    setEditorOpen(true);
  };

  const handleDelete = async (
    deck: RecallDeckView,
    card: RecallDeckCardView,
  ) => {
    const preview =
      card.prompt.length > 18 ? `${card.prompt.slice(0, 18)}…` : card.prompt;
    if (!window.confirm(`删除「${preview}」？这张卡会从所有队列里消失。`)) {
      return;
    }

    setDeletingId(card.cardId);
    try {
      await deleteRecallCard(deck.deckKey, card.cardId);
      toast.success("已删除");
      router.refresh();
    } catch (error) {
      // 写操作失败：列表保持原样，用户可以直接再试
      console.error("[recall] 删除卡片失败", error);
      toast.error(`删除失败：${actionErrorMessage(error)}`);
      return;
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto min-h-full w-full max-w-6xl px-4 py-6 md:px-6 lg:py-10">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            回忆卡组
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            卡片内容来自你自己的卡组文件。改内容不会动任何人的复习进度。
          </p>
        </div>
        <Button
          size="lg"
          className="w-full sm:w-auto"
          onClick={() => setImportOpen(true)}
        >
          <FileUp className="mr-2 h-4 w-4" aria-hidden />
          导入卡组
        </Button>
      </header>

      {decks.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-10 w-10" aria-hidden />}
          title="还没有卡组"
          description="导入一个卡组文件，卡片就会出现在这里和「回忆」页。"
          action={
            <Button size="lg" onClick={() => setImportOpen(true)}>
              <FileUp className="mr-2 h-4 w-4" aria-hidden />
              导入卡组
            </Button>
          }
        />
      ) : (
        <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-6">
          <nav aria-label="卡组" className="flex flex-col gap-2">
            {decks.map((deck) => {
              const active = deck.deckKey === selected?.deckKey;
              return (
                <button
                  key={deck.deckKey}
                  type="button"
                  onClick={() => setSelectedKey(deck.deckKey)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "min-h-11 w-full rounded-lg border px-4 py-3 text-left transition-colors",
                    active
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-card hover:bg-accent/40",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium text-foreground">
                      {deck.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {deck.cardCount} 张
                    </span>
                  </span>
                  {deck.archivedCount > 0 && (
                    <span className="mt-1 block text-xs text-muted-foreground tabular-nums">
                      已归档 {deck.archivedCount} 张
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {selected && (
            <section className="mt-6 lg:mt-0">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-medium text-foreground">
                    {selected.title}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {selected.cardCount} 张卡
                    {selected.archivedCount > 0
                      ? ` · 已归档 ${selected.archivedCount} 张`
                      : ""}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="h-11 shrink-0"
                  onClick={() => openEditor(null)}
                >
                  <Plus className="mr-2 h-4 w-4" aria-hidden />
                  新建卡片
                </Button>
              </div>

              {selected.cards.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
                  这个卡组还没有卡片
                </div>
              ) : (
                <ul className="space-y-2">
                  {selected.cards.map((card) => (
                    <li
                      key={card.cardId}
                      className="rounded-lg border border-border bg-card p-4"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          {card.kind === "list" ? "列举" : "填空"}
                        </Badge>
                        <span className="min-w-0 truncate text-xs text-muted-foreground">
                          {card.cardId}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-foreground">
                        {card.prompt}
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          variant="outline"
                          className="h-11 px-4"
                          onClick={() => openEditor(card)}
                        >
                          编辑
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-11 px-4 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(selected, card)}
                          disabled={deletingId === card.cardId}
                        >
                          {deletingId === card.cardId ? "删除中…" : "删除"}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}

      <ImportDeckDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(deckKey) => {
          // 刚导入的卡组直接选中，省掉"再找一遍"这一步
          if (deckKey) setSelectedKey(deckKey);
          router.refresh();
        }}
      />

      {selected && (
        <CardEditorDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          deckKey={selected.deckKey}
          deckTitle={selected.title}
          card={editingCard}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}
