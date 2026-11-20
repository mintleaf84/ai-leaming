/**
 * 答题草稿与答题卡的唯一推导逻辑。
 *
 * 考试态与练习态的区别就在这：练习一选就判分切题，考试要先把**选择**留住，
 * 交卷时才由服务端统一判分（`checkAnswerCorrectness` 是唯一实现，契约 §4）。
 * 所以这里只处理"草稿 ⇄ 提交串"，不复刻任何判分规则。
 */
import type { ExamQuestion, SubmitAnswerInput } from "./types";

/** 一道题的作答草稿 */
export type ExamDraft =
  | { kind: "choice"; letters: string[] }
  | { kind: "fill"; blanks: string[] };

export type ExamDraftMap = Record<number, ExamDraft | undefined>;

/** 填空占位符：题干里 3 个及以上下划线算一个空 */
const BLANK_PATTERN = /_{3,}/g;

/**
 * 填空题的空数。
 *
 * 不能用 `answer.split("；")` 推：未交卷时服务端按契约把 `answer` 置空防作弊，
 * 题干里的 `_____` 才是唯一可用的信息（与 PracticeCard 的渲染规则一致）。
 */
export function countFillBlanks(content: string): number {
  const matches = content.match(BLANK_PATTERN);
  return Math.max(1, matches?.length ?? 0);
}

/** 客观题才允许进试卷（契约 §3.4） */
export function isGradableType(type: string | null | undefined): boolean {
  return (
    type === "single" ||
    type === "multi" ||
    type === "truefalse" ||
    type === "fill_blank"
  );
}

export function isDraftAnswered(draft: ExamDraft | undefined): boolean {
  if (!draft) return false;
  if (draft.kind === "choice") return draft.letters.length > 0;
  return draft.blanks.some((blank) => blank.trim().length > 0);
}

/** 草稿 → 提交串：单选/判断 `"A"`，多选 `'["A","C"]'`，填空 `"空1；空2"` */
export function draftToUserAnswer(
  draft: ExamDraft | undefined,
  type: string | null | undefined,
): string {
  if (!draft) return "";
  if (draft.kind === "fill") {
    return draft.blanks.map((blank) => blank.trim()).join("；");
  }
  if (type === "multi") {
    return JSON.stringify([...draft.letters].sort());
  }
  return draft.letters[0] ?? "";
}

/** 提交串 → 草稿（刷新后从 sessionStorage 恢复时用） */
export function userAnswerToDraft(
  userAnswer: string,
  type: string | null | undefined,
): ExamDraft | undefined {
  const value = userAnswer ?? "";
  if (!value.trim()) return undefined;
  if (type === "fill_blank") {
    return {
      kind: "fill",
      blanks: value.split("；").map((blank) => blank.trim()),
    };
  }
  if (type === "multi") {
    const letters = value
      .replace(/[[\]"]/g, "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return letters.length > 0 ? { kind: "choice", letters } : undefined;
  }
  return { kind: "choice", letters: [value.trim()] };
}

export type SheetCellStatus = "answered" | "unanswered";

export interface SheetCell {
  /** 从 1 开始，与题号一致 */
  position: number;
  questionId: number;
  status: SheetCellStatus;
  isCurrent: boolean;
}

/** 答题卡：已答 / 未答 / 当前，由草稿派生（不存第二份状态） */
export function buildAnswerSheet(
  questions: ExamQuestion[],
  drafts: ExamDraftMap,
  currentIndex: number,
): SheetCell[] {
  return questions.map((question, index) => ({
    position: index + 1,
    questionId: question.id,
    status: isDraftAnswered(drafts[question.id]) ? "answered" : "unanswered",
    isCurrent: index === currentIndex,
  }));
}

export function countAnswered(
  questions: ExamQuestion[],
  drafts: ExamDraftMap,
): number {
  return questions.filter((question) => isDraftAnswered(drafts[question.id]))
    .length;
}

export function countUnanswered(
  questions: ExamQuestion[],
  drafts: ExamDraftMap,
): number {
  return questions.length - countAnswered(questions, drafts);
}

/**
 * 交卷请求体里的 `answers`。
 *
 * **未作答的题不发送**：契约 §4 规定未提交的题由服务端按 `skipped` 处理，
 * 若发空串会被当成"答错"，污染错题本与掌握度。
 */
export function collectAnswers(
  questions: ExamQuestion[],
  drafts: ExamDraftMap,
  durations: Record<number, number>,
): SubmitAnswerInput[] {
  return questions.reduce<SubmitAnswerInput[]>((acc, question) => {
    const draft = drafts[question.id];
    if (!isDraftAnswered(draft)) return acc;
    acc.push({
      questionId: question.id,
      userAnswer: draftToUserAnswer(draft, question.type),
      durationMs: Math.max(0, Math.round(durations[question.id] ?? 0)),
    });
    return acc;
  }, []);
}
