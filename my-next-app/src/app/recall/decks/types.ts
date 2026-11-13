/** 卡组管理页的视图类型（服务端页面 → 客户端组件；单独成文件避免组件间循环引用） */
export interface RecallDeckCardView {
  cardId: string;
  kind: "list" | "cloze";
  prompt: string;
  items: { text: string; keywords: string[] }[] | null;
  blanks: { answers: string[] }[] | null;
}

export interface RecallDeckView {
  deckKey: string;
  title: string;
  cardCount: number;
  archivedCount: number;
  cards: RecallDeckCardView[];
}
