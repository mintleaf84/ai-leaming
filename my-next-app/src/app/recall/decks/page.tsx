import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/auth";
import { exportDeck, listDecks } from "@/lib/services/recall-import";

import { RecallDecks } from "./RecallDecks";
import type { RecallDeckCardView, RecallDeckView } from "./types";

export const metadata: Metadata = {
  title: "回忆卡组",
};

/**
 * 卡组与卡片管理。
 *
 * 卡片内容在服务端读：`listRecallDecksAction` 只回卡组标题与计数，契约里没有
 * 「列出某卡组的卡片」，而编辑/删除都要先看到卡片。这里复用**既有的导出函数**
 * `exportDeck()`（它输出的就是完整卡组定义，且不含任何人的复习进度），
 * 不再另写一条针对 `recall_cards` 的查询。
 *
 * 空卡组（卡片数 0）直接跳过 `exportDeck`：导出会校验「至少 1 张卡」的
 * round-trip，空卡组属于合法的中间状态，不该因此整页报错。
 */
export default async function RecallDecksPage() {
  const user = await requireUser();
  const summaries = await listDecks(user.id);

  const decks: RecallDeckView[] = await Promise.all(
    summaries.map(async (summary) => {
      const cards: RecallDeckCardView[] =
        summary.cardCount === 0
          ? []
          : (await exportDeck(summary.deckKey)).cards.map((card) => {
              if (card.kind === "list") {
                return {
                  cardId: card.cardId,
                  kind: "list" as const,
                  prompt: card.prompt,
                  items: card.items.map((item) => ({
                    text: item.text,
                    keywords: [...item.keywords],
                  })),
                  blanks: null,
                };
              }
              return {
                cardId: card.cardId,
                kind: "cloze" as const,
                prompt: card.prompt,
                items: null,
                blanks: card.blanks.map((blank) => ({
                  answers: [...blank.answers],
                })),
              };
            });

      return {
        deckKey: summary.deckKey,
        title: summary.title,
        cardCount: summary.cardCount,
        archivedCount: summary.archivedCount,
        cards,
      };
    }),
  );

  return <RecallDecks decks={decks} />;
}
