import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { mapFenbiExercise, parseFenbiExercise } from "../mapper";
import type { FenbiExerciseDetail, FenbiQuestionsPayload } from "../client";

/**
 * 真实抓包样本（2026-11-21，测试账号）：
 * - history：4 条记录（全部 sheet.type=3）
 * - exercise：2173997585，3 题 3 作答（作答 key 是题序 "0"/"1"/"2"）
 * - questions：三题的单选题干 + correctAnswer
 *
 * 断言口径全部来自设计文档 §2.4 / §2.5，不依赖导入器内部实现细节。
 */
const FIXTURE_PATH = "/tmp/fenbi-fixtures/sample.json";

interface Sample {
  history: { cursor: number; datas: Array<Record<string, unknown>> };
  exercise: Record<string, unknown>;
  questions: {
    materials: unknown[];
    questions: Array<Record<string, unknown>>;
  };
}

function loadSample(): Sample {
  const raw = fs.readFileSync(FIXTURE_PATH, "utf8");
  return JSON.parse(raw) as Sample;
}

/** 抓包样本里的 history 项 → client 归一化后的 summary（只保留 mapper 用到的） */
function toDetail(raw: Sample): FenbiExerciseDetail {
  const exercise = raw.exercise as {
    id: number;
    key: string;
    status: number;
    createdTime: number;
    elapsedTime: number;
    userAnswers: Record<string, unknown>;
    sheet: {
      type: number;
      name: string;
      keypointId: number;
      questionIds: number[];
      questionCount: number;
    };
  };

  return {
    id: String(exercise.id),
    key: exercise.key,
    status: exercise.status,
    createdTime: exercise.createdTime,
    elapsedTime: exercise.elapsedTime,
    userAnswers: exercise.userAnswers as FenbiExerciseDetail["userAnswers"],
    sheet: {
      type: exercise.sheet.type,
      name: exercise.sheet.name,
      questionIds: exercise.sheet.questionIds.map((id) => String(id)),
      questionCount: exercise.sheet.questionCount,
      keypointId: exercise.sheet.keypointId,
    },
  };
}

const detail = toDetail(loadSample());
const payload = loadSample().questions as unknown as FenbiQuestionsPayload;

describe("mapFenbiExercise", () => {
  it("把「题序 key」的 userAnswers 重建成「题目 globalId key」并补上 status", () => {
    const mapped = mapFenbiExercise(detail, payload);
    const answers = mapped.exerciseJson.userAnswers as Record<
      string,
      { answer: { choice: string }; status: number; time: number }
    >;

    // 抓包样本的 userAnswers key 是 "0"/"1"/"2"，必须换成 questionId
    expect(Object.keys(answers).sort()).toEqual(
      ["16015073", "16015110", "16015182"].sort(),
    );
    expect(answers).not.toHaveProperty("0");

    // q16015073：correct "1"，用户 "1" → 对
    expect(answers["16015073"].answer.choice).toBe("1");
    expect(answers["16015073"].status).toBe(1);
    expect(answers["16015073"].time).toBe(9);

    // q16015182：correct "2"，用户 "3" → 错
    expect(answers["16015182"].answer.choice).toBe("3");
    expect(answers["16015182"].status).toBe(0);

    // q16015110：correct "2"，用户 "2" → 对
    expect(answers["16015110"].status).toBe(1);
  });

  it("会话幂等键与既引导入链同口径：fenbi:{key}", () => {
    const mapped = mapFenbiExercise(detail, payload);
    expect(mapped.sourceKey).toBe("fenbi:1_32_20p94gh");
    expect(mapped.sessionName).toBe("快速智能练习");
  });

  it("solutions 每题带 globalId/id/type/content/accessories/correctAnswer/solution", () => {
    const mapped = mapFenbiExercise(detail, payload);
    const solutions = mapped.solutionsJson.solutions as Array<{
      globalId: string;
      id: number;
      type: number;
      content: string;
      accessories: Array<{ type: number; options: string[] }>;
      correctAnswer: { choice: string; type: number };
      solution: string;
    }>;

    expect(solutions).toHaveLength(3);

    const first = solutions[0];
    expect(first.globalId).toBe("16015073");
    expect(first.id).toBe(16015073);
    expect(first.type).toBe(1);
    expect(first.content).toContain("聚会结束后");
    expect(first.accessories[0].options).toEqual([
      "语义记忆",
      "情景记忆",
      "延时记忆",
      "感觉记忆",
    ]);
    expect(first.correctAnswer.choice).toBe("1");
    // 接口没给解析：给空串，不是 undefined（parser 会对 undefined 调 stripHtml）
    expect(first.solution).toBe("");
  });
});

describe("parseFenbiExercise（映射 → parser → 导入器形状）", () => {
  it("records 的 externalId / userAnswer / isCorrect / durationMs 正确", () => {
    const parsed = parseFenbiExercise(detail, payload);

    expect(parsed.sourceKey).toBe("fenbi:1_32_20p94gh");
    expect(parsed.sessionName).toBe("快速智能练习");
    expect(parsed.questions).toHaveLength(3);
    expect(parsed.records).toHaveLength(3);
    expect(parsed.totalCount).toBe(3);
    expect(parsed.correctCount).toBe(2);
    expect(parsed.errorCount).toBe(1);

    const byId = new Map(parsed.records.map((r) => [r.externalId, r]));
    expect(byId.get("16015073")).toMatchObject({
      userAnswer: "B", // choice "1" → B
      isCorrect: true,
      durationMs: 9_000, // 9 秒
    });
    expect(byId.get("16015182")).toMatchObject({
      userAnswer: "D", // choice "3" → D（正确答案 C，判错）
      isCorrect: false,
    });
    expect(byId.get("16015110")).toMatchObject({
      userAnswer: "C", // choice "2" → C
      isCorrect: true,
    });
  });

  it("题目答案按 0 基索引转成字母（答案是 A 时不出现空串）", () => {
    const parsed = parseFenbiExercise(detail, payload);
    const answers = parsed.questions.map((q) => q.answer).sort();
    expect(answers).toEqual(["B", "C", "C"]);
  });

  it("同一份输入解析两次结果一致（纯函数）", () => {
    const a = parseFenbiExercise(detail, payload);
    const b = parseFenbiExercise(detail, payload);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("判分边界", () => {
  it("多选题索引顺序不同但集合相同 → 判对", () => {
    const multiDetail: FenbiExerciseDetail = {
      ...detail,
      id: "1",
      sheet: { ...detail.sheet, questionIds: ["q1"], questionCount: 1 },
      userAnswers: {
        "0": {
          questionId: "q1",
          questionIndex: 0,
          answer: { choice: "2,0", type: 201 },
          time: 12,
        },
      },
    };
    const multiPayload: FenbiQuestionsPayload = {
      questions: [
        {
          id: "q1",
          type: 2, // 多选
          content: "<p>多选</p>",
          accessories: [{ type: 101, options: ["A", "B", "C"] }],
          correctAnswer: { choice: "0,2", type: 201 },
        },
      ],
    };

    const parsed = parseFenbiExercise(multiDetail, multiPayload);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0].isCorrect).toBe(true);
    // 判对用的是集合比较；记录里的字母顺序保持用户原始顺序（parser 既有行为）
    expect(parsed.records[0].userAnswer).toBe("C,A");
  });

  it("未作答（空 choice）不写作答记录，不算错题", () => {
    const skippedDetail: FenbiExerciseDetail = {
      ...detail,
      sheet: { ...detail.sheet, questionIds: ["q1"], questionCount: 1 },
      userAnswers: {
        "0": { questionId: "q1", answer: { choice: "", type: 201 }, time: 0 },
      },
    };
    const singlePayload: FenbiQuestionsPayload = {
      questions: [
        {
          id: "q1",
          type: 1,
          content: "<p>题</p>",
          accessories: [{ type: 101, options: ["A", "B"] }],
          correctAnswer: { choice: "0", type: 201 },
        },
      ],
    };

    const parsed = parseFenbiExercise(skippedDetail, singlePayload);
    expect(parsed.records).toHaveLength(0);
    expect(parsed.questions).toHaveLength(1);
  });

  it("题目缺少 correctAnswer 时退回上游 status（不把记录整条丢掉）", () => {
    const orphanDetail: FenbiExerciseDetail = {
      ...detail,
      sheet: { ...detail.sheet, questionIds: ["16015073"], questionCount: 1 },
      userAnswers: {
        "0": {
          questionId: "16015073",
          answer: { choice: "1", type: 201 },
          time: 5,
          status: 1,
        },
      },
    };
    const noAnswerPayload: FenbiQuestionsPayload = {
      questions: [
        {
          id: "16015073",
          type: 1,
          content: "<p>题</p>",
          accessories: [{ type: 101, options: ["A", "B"] }],
          // 缺 correctAnswer
        },
      ],
    };

    const parsed = parseFenbiExercise(orphanDetail, noAnswerPayload);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0].isCorrect).toBe(true);
  });
});

describe("材料挂载", () => {
  it("题干内联 material 时通过 card/materials 传回 parser", () => {
    const withMaterial: FenbiQuestionsPayload = {
      questions: [
        {
          id: "q1",
          type: 1,
          content: "<p>题</p>",
          material: "<p>这是一段材料</p>",
          accessories: [{ type: 101, options: ["A", "B"] }],
          correctAnswer: { choice: "0", type: 201 },
        },
      ],
    };
    const mapped = mapFenbiExercise(detail, withMaterial);
    expect(mapped.solutionsJson.materials).toEqual([
      {
        id: 0,
        globalId: "mat_q1",
        content: "<p>这是一段材料</p>",
        accessories: [],
      },
    ]);
    expect(mapped.solutionsJson.card).toEqual({
      nodeType: 0,
      children: [{ key: "q1", materialKeys: ["mat_q1"], nodeType: 0 }],
    });
  });
});

describe("fixture 前置条件（防止样本被替换后断言失真）", () => {
  it("样本就是文档里的 exerciseId 2173997585 / 3 题 3 作答", () => {
    const sample = loadSample();
    expect(sample.exercise.id).toBe(2173997585);
    expect(Object.keys(sample.exercise.userAnswers as object)).toHaveLength(3);
    expect((sample.questions.questions as unknown[]).length).toBe(3);
    // 路径只用于报错信息可读性
    expect(path.basename(FIXTURE_PATH)).toBe("sample.json");
  });
});
