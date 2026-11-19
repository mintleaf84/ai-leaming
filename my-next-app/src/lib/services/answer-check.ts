/**
 * 答案比对的唯一实现（服务端）。
 *
 * 抽取原因：练习提交（`practice.ts`）与改题回刷（`question-regrade.ts`）必须用
 * **同一套**判分逻辑——否则管理员改完答案后回刷出的 `is_correct` 与用户当时
 * 提交时用的规则不一致，历史数据会再次污染统计与 FSRS。
 *
 * 前端 `use-practice-controller.tsx` 保留了同一逻辑的客户端副本（离线作答需要），
 * 修改规则时两处必须同步；多选分支以这里的等长集合比较为准。
 *
 * 2026-11-19：补齐多选分支。此前 REST 路径（`submitAnswerWithValidation`）用的
 * 是本函数旧版，没有多选逻辑——移动端提交多选时只能靠字符串完全相等命中，
 * 选项顺序不同即误判（网页端走客户端判分所以未暴露）。
 */
import { safeParseJson } from "@/lib/utils/json";

/** 单值与正确答案的单值比对（标号↔文本双向） */
function matchesSingle(
  userAnswer: string,
  correctAnswer: string,
  options: string[],
): boolean {
  // 1. 精确匹配
  if (userAnswer === correctAnswer) return true;

  // 2. 用户提交标号(A/B/C...) → 对比选项文本
  if (userAnswer.length === 1 && userAnswer >= "A" && userAnswer <= "Z") {
    const idx = userAnswer.charCodeAt(0) - 65;
    if (options[idx] === correctAnswer) return true;
  }

  // 3. 正确答案标号 → 对比用户提交文本
  if (
    correctAnswer.length === 1 &&
    correctAnswer >= "A" &&
    correctAnswer <= "Z"
  ) {
    const idx = correctAnswer.charCodeAt(0) - 65;
    if (options[idx] === userAnswer) return true;
  }

  // 4. 判断题特殊处理：A=正确, B=错误
  if (options.length === 2) {
    if (
      (userAnswer === "A" && correctAnswer === "正确") ||
      (userAnswer === "B" && correctAnswer === "错误") ||
      (userAnswer === "正确" && correctAnswer === "A") ||
      (userAnswer === "错误" && correctAnswer === "B")
    ) {
      return true;
    }
  }

  return false;
}

/**
 * 增强型答案比对函数，支持标号(A/B/C)与文本的双向匹配、多选集合比较、填空逐空匹配。
 * 与前端 use-practice-controller.tsx 保持逻辑一致。
 */
export function checkAnswerCorrectness(
  userAnswer: string,
  correctAnswer: string,
  options: string[],
  questionType?: string,
): boolean {
  // 填空题：按中文分号分割，逐空匹配（支持单空多答案用 | 分隔）
  if (questionType === "fill_blank") {
    const userBlanks = userAnswer.split("；").map((s) => s.trim());
    const correctBlanks = correctAnswer.split("；").map((s) => s.trim());
    if (userBlanks.length !== correctBlanks.length) return false;
    return userBlanks.every((ub, i) => {
      if (!ub) return false; // 拒绝空白用户输入
      const acceptedAnswers = correctBlanks[i]
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
      return acceptedAnswers.some((ans) => ans === ub);
    });
  }

  // 多选：先解析成数组（兼容 JSON 数组与逗号分隔串），
  // 再把两侧元素统一成「选项字母身份」后做等长集合比较。
  // 不能先按原文排序再逐项 matchesSingle：`["丁","甲"]` 与 `["A","D"]` 是同一集合，
  // 但原文排序后首项是「丁」vs「A」，会被误判为错（CodeRabbit major）。
  if (questionType === "multi") {
    const parse = (val: string): string[] => {
      const parsed = safeParseJson<unknown>(val, null);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v).trim()).filter(Boolean);
      }
      const trimmed = val.trim();
      if (!trimmed) return [];
      // 历史数据可能是 "A,B" / "AB" 两种形态
      if (trimmed.includes(",")) {
        return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
      }
      return /^[A-Z]+$/.test(trimmed) ? trimmed.split("") : [trimmed];
    };
    const toOptionKey = (value: string): string => {
      const v = value.trim();
      // 只有落在选项范围内的单字母才是「标号」；否则可能是选项文本本身
      // （如 options=["X","Y","Z","W"] 时的 "X"），必须继续按文本查找
      if (/^[A-Za-z]$/.test(v)) {
        const idx = v.toUpperCase().charCodeAt(0) - 65;
        if (options.length === 0 || idx < options.length) {
          return v.toUpperCase();
        }
      }
      const idx = options.findIndex((option) => option.trim() === v);
      return idx >= 0 ? String.fromCharCode(65 + idx) : v;
    };
    const correctArr = parse(correctAnswer).map(toOptionKey).sort();
    const answerArr = parse(userAnswer).map(toOptionKey).sort();
    if (correctArr.length !== answerArr.length) return false;
    return answerArr.every((v, i) => v === correctArr[i]);
  }

  return matchesSingle(userAnswer, correctAnswer, options);
}
