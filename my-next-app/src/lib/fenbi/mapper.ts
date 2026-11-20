/**
 * 粉笔「练习详情 + 题目」→ 现有导入器吃的数据形状（docs/fenbi-sync-design.md §4）。
 *
 * ## 为什么要有这一层
 *
 * `import/fenbi-parser.ts` 是给**油猴脚本导出的文件**写的，它认的形状是：
 *
 * ```ts
 * exerciseJson.userAnswers[questionGlobalId] = {
 *   answer: { choice: "1" },    // 0 基索引字符串，多选 "0,2"
 *   status: 0 | 1,              // 对/错
 *   time: 9,                    // 秒
 * };
 * solutionsJson.solutions[] = {
 *   globalId, id, type, content, accessories,
 *   correctAnswer: { choice }, solution, source, keypoints,
 * };
 * ```
 *
 * 而粉笔的**接口**返回的是另一套（§2.4 / §2.5）：
 * - `userAnswers` 的 key 是题序 `"0"/"1"`，题目 id 在 value 里（`questionId`）；
 * - 没有 `isCorrect`，对错要拿 `correctAnswer.choice` 与用户 `choice` 比出来；
 * - 题干在另一个接口里，且 `solution`（解析）字段经常缺失。
 *
 * 这个文件只做"改形 + 判对错"，不碰数据库、不发请求，**纯函数**：同一份输入
 * 永远得到同一份输出，单测直接拿真实抓包样本跑。
 *
 * ## 不改既有行为
 *
 * 判分只用来填 `status`（导入器只读它）；题目去重、会话幂等全交给
 * `importService.importFenbiData`。这里不从 `fenbi-parser` 里复制任何解析逻辑。
 */

import {
  parseFenbiData,
  type FenbiImportResult,
} from "@/lib/import/fenbi-parser";
import type {
  FenbiExerciseDetail,
  FenbiQuestionRaw,
  FenbiQuestionsPayload,
  FenbiUserAnswerRaw,
} from "./client";

/** 题干接口没给解析时，导入器拿到的就是空解析（不是 undefined） */
const EMPTY_EXPLANATION = "";

/** 填空/多选判分的归一化：去空白、按数值排序，避免 "0,2" 与 "2,0" 被判成不同 */
function normalizeChoice(choice: string | undefined | null): string[] {
  if (!choice) return [];
  return choice
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a.localeCompare(b);
    });
}

function normalizeBlanks(blanks: string[] | undefined | null): string[] {
  if (!Array.isArray(blanks)) return [];
  return blanks.map((blank) => (blank ?? "").trim());
}

/** 粉笔的「填空」题型编码（见 fenbi-parser 的 inferQuestionType） */
function isFillBlank(type: number | undefined): boolean {
  return type === 61;
}

function isAnswered(entry: FenbiUserAnswerRaw): boolean {
  const choice = entry.answer?.choice;
  const blanks = entry.answer?.blanks;
  if (typeof choice === "string" && choice.trim().length > 0) return true;
  return Array.isArray(blanks) && blanks.some((b) => (b ?? "").trim() !== "");
}

/**
 * 判对错（粉笔没有 isCorrect 字段，§2.4）。
 *
 * - 拿到题目与 `correctAnswer` 时**一律自己判**；
 * - 拿不到（题目接口漏题）才退回上游 `status`，避免整条记录丢失；
 * - 填空题按空位逐个比；选择题按索引集合比（顺序无关）。
 */
function computeStatus(
  entry: FenbiUserAnswerRaw,
  question: FenbiQuestionRaw | undefined,
): 0 | 1 {
  const correct = question?.correctAnswer;
  if (!question || !correct) {
    return entry.status === 1 ? 1 : 0;
  }

  if (isFillBlank(question.type)) {
    const userBlanks = normalizeBlanks(entry.answer?.blanks);
    const correctBlanks = normalizeBlanks(correct.blanks);
    if (userBlanks.length > 0 || correctBlanks.length > 0) {
      if (userBlanks.length !== correctBlanks.length) return 0;
      return userBlanks.every((blank, i) => blank === correctBlanks[i]) ? 1 : 0;
    }
    // 填空题没有 blanks 时退化成 choice 比较（部分老数据这么存）
  }

  const userChoice = normalizeChoice(entry.answer?.choice);
  const correctChoice = normalizeChoice(correct.choice);
  if (correctChoice.length === 0) {
    // 正确答案缺失：只能信上游
    return entry.status === 1 ? 1 : 0;
  }
  if (userChoice.length !== correctChoice.length) return 0;
  return userChoice.every((value, i) => value === correctChoice[i]) ? 1 : 0;
}

/**
 * 解析一条作答归属到哪道题。
 *
 * 三种来源，按可靠性排序：
 * 1. `entry.questionId`（实测数据）；
 * 2. key 本身就是题目 globalId（老版油猴导出）；
 * 3. key 是题序 / `entry.questionIndex`（退回 `sheet.questionIds` 的位次）。
 */
function resolveQuestionId(
  key: string,
  entry: FenbiUserAnswerRaw,
  exercise: FenbiExerciseDetail,
): string | null {
  if (entry.questionId !== undefined && entry.questionId !== null) {
    const id = String(entry.questionId);
    if (id.length > 0) return id;
  }

  // 老数据：key 即 globalId（此时 sheet.questionIds 里通常也有它）
  if (exercise.sheet.questionIds.includes(key)) return key;

  const index =
    typeof entry.questionIndex === "number" ? entry.questionIndex : Number(key);
  if (Number.isInteger(index) && index >= 0) {
    return exercise.sheet.questionIds[index] ?? null;
  }
  return null;
}

export interface MappedFenbiImport {
  /** 给 `parseFenbiData` 的第一参 */
  exerciseJson: Record<string, unknown>;
  /** 给 `parseFenbiData` 的第二参 */
  solutionsJson: Record<string, unknown>;
  sessionName: string;
  /**
   * 会话级幂等键（设计文档 §4.1 冻结口径）。
   *
   * 口径必须与既有导入链完全一致：`fenbi-parser` 推的是 `fenbi:{key|id}`，
   * 而油猴脚本历史推送用的也是这套键。这里沿用 `fenbi:{exercise.key}`，
   * 才能让"之前手工推过的同一套练习"被判成同一条会话，而不是再导一遍。
   */
  sourceKey: string;
}

function buildSessionName(exercise: FenbiExerciseDetail): string {
  const sheetName = exercise.sheet.name?.trim();
  if (sheetName) return sheetName;
  return `粉笔练习 ${exercise.id}`;
}

/**
 * 纯函数：粉笔接口形状 → 导入器形状。
 *
 * 不抛业务错误；缺字段一律给安全默认值（导入器对空值本身有兜底）。
 */
export function mapFenbiExercise(
  exercise: FenbiExerciseDetail,
  payload: FenbiQuestionsPayload,
): MappedFenbiImport {
  const sessionName = buildSessionName(exercise);
  const sourceKey = `fenbi:${exercise.key ?? exercise.id}`;

  const questions = Array.isArray(payload.questions) ? payload.questions : [];
  const questionsById = new Map<string, FenbiQuestionRaw>();
  for (const question of questions) {
    if (question.id === undefined || question.id === null) continue;
    questionsById.set(String(question.id), question);
  }

  // --- 1. userAnswers：从"题序 key"重建成"题目 globalId key"，并补 status ---
  const userAnswers: Record<
    string,
    {
      questionId: string;
      questionIndex: number;
      answer: { choice: string; blanks?: string[]; type: number };
      time: number;
      status: 0 | 1;
    }
  > = {};

  for (const [key, entry] of Object.entries(exercise.userAnswers ?? {})) {
    if (!entry || typeof entry !== "object") continue;
    // 未作答（跳过的题）不算错题：不写作答记录
    if (!isAnswered(entry)) continue;

    const questionId = resolveQuestionId(key, entry, exercise);
    if (!questionId) continue;

    const question = questionsById.get(questionId);
    userAnswers[questionId] = {
      questionId,
      questionIndex:
        typeof entry.questionIndex === "number"
          ? entry.questionIndex
          : exercise.sheet.questionIds.indexOf(questionId),
      answer: {
        // 原样保留 0 基索引字符串（"0,2"），转换字母是 parser 的职责
        choice: entry.answer?.choice ?? "",
        ...(entry.answer?.blanks ? { blanks: entry.answer.blanks } : {}),
        type: entry.answer?.type ?? 201,
      },
      // 秒；parser 自己 ×1000
      time: typeof entry.time === "number" ? entry.time : 0,
      status: computeStatus(entry, question),
    };
  }

  // --- 2. solutions：题目接口 → 导入器的 solutions[] ---
  const solutions = questions.map((question) => {
    const globalId = String(question.id);
    const numericId = Number(question.id);
    return {
      globalId,
      // parser 只用它取统计数据的 key，非数字 id 给 0 不会污染题库
      id: Number.isFinite(numericId) ? numericId : 0,
      content: question.content ?? "",
      type: question.type ?? 1,
      accessories: (question.accessories ?? []).map((accessory) => ({
        type: accessory.type ?? 101,
        options: accessory.options ?? [],
      })),
      correctAnswer: {
        choice: question.correctAnswer?.choice ?? "",
        ...(question.correctAnswer?.blanks
          ? { blanks: question.correctAnswer.blanks }
          : {}),
        type: question.correctAnswer?.type ?? 201,
      },
      // 接口里既有 solution 也有 analysis（不同接口族），都收
      solution: question.solution ?? question.analysis ?? EMPTY_EXPLANATION,
      source: question.source ?? question.shortSource ?? "",
      ...(question.keypoints ? { keypoints: question.keypoints } : {}),
    };
  });

  // --- 3. 材料：parser 靠 solutionsJson.card 把材料挂回题目 ---
  const materials: Array<{
    id: number | string;
    globalId: string;
    content: string;
    accessories: unknown[];
  }> = [];

  for (const material of payload.materials ?? []) {
    const globalId = String(material.globalId ?? material.id ?? "");
    if (!globalId) continue;
    materials.push({
      id: material.id ?? 0,
      globalId,
      content: material.content ?? "",
      accessories: material.accessories ?? [],
    });
  }

  const cardChildren: Array<{
    key: string;
    materialKeys: string[];
    nodeType: number;
  }> = [];

  for (const question of questions) {
    // 题干接口可能内联 material（HTML 字符串）：合成一个材料并挂回本题
    if (typeof question.material === "string" && question.material.trim()) {
      const globalId = `mat_${question.id}`;
      materials.push({
        id: 0,
        globalId,
        content: question.material,
        accessories: [],
      });
      cardChildren.push({
        key: String(question.id),
        materialKeys: [globalId],
        nodeType: 0,
      });
    }
  }

  const exerciseJson: Record<string, unknown> = {
    // id 同时写在 id/exerciseId：parser 的 deriveSourceKey 会用到（随后被覆盖）
    id: exercise.id,
    exerciseId: exercise.id,
    name: sessionName,
    userAnswers,
  };

  const solutionsJson: Record<string, unknown> = {
    name: sessionName,
    solutions,
    ...(materials.length > 0 ? { materials } : {}),
    ...(cardChildren.length > 0
      ? { card: { nodeType: 0, children: cardChildren } }
      : {}),
  };

  return { exerciseJson, solutionsJson, sessionName, sourceKey };
}

/**
 * 映射 + 解析 = 一行调用即可交给 `importService.importFenbiData`。
 *
 * `sourceKey` 与 `sessionName` 在这里覆盖：键口径与 `fenbi-parser` 保持一致
 * （`fenbi:{key|id}`），这样能和油猴脚本推过的历史会话对上。
 */
export function parseFenbiExercise(
  exercise: FenbiExerciseDetail,
  payload: FenbiQuestionsPayload,
): FenbiImportResult {
  const mapped = mapFenbiExercise(exercise, payload);
  const parsed = parseFenbiData(mapped.exerciseJson, mapped.solutionsJson);
  return {
    ...parsed,
    sessionName: mapped.sessionName,
    sourceKey: mapped.sourceKey,
  };
}

/** 仅供测试：暴露判分/归一化，便于对边界单独断言 */
export const __test__ = { computeStatus, normalizeChoice, resolveQuestionId };
