import { describe, it, expect } from "vitest";
import { parseFenbiData, validateFenbiJson } from "../fenbi-parser";

describe("fenbi-parser", () => {
  describe("validateFenbiJson", () => {
    it("应该识别有效的粉笔 JSON", () => {
      const exerciseJson = JSON.stringify({
        userAnswers: {
          q1: { id: 1, status: 1, time: 10, answer: { choice: "0", type: 1 } },
        },
      });
      const solutionsJson = JSON.stringify({
        solutions: [
          {
            id: 1,
            globalId: "q1",
            content: "问题",
            type: 1,
            correctAnswer: { choice: "0", type: 1 },
            accessories: [],
          },
        ],
      });

      const result = validateFenbiJson(exerciseJson, solutionsJson);
      expect(result.valid).toBe(true);
    });

    it("应该识别无效的 JSON 格式", () => {
      const result = validateFenbiJson("invalid", "{}");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("JSON 解析失败");
    });

    it("应该检查缺失的 userAnswers 字段", () => {
      const result = validateFenbiJson("{}", "{}");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("答题数据缺少 userAnswers 字段");
    });
  });

  describe("parseFenbiData", () => {
    const mockSolutions = {
      name: "测试练习",
      solutions: [
        {
          id: 101,
          globalId: "guid_101",
          content: "<p>这是一道单选题</p>",
          type: 1,
          solution: "解析内容",
          accessories: [
            { options: ["选项A", "选项B", "选项C", "选项D"], type: 1 },
          ],
          correctAnswer: { choice: "0", type: 1 },
          keypoints: [{ id: 1, name: "知识点1" }],
        },
        {
          id: 102,
          globalId: "guid_102",
          content: "这是一道判断题",
          type: 5,
          solution: "判断解析",
          accessories: [],
          correctAnswer: { choice: "1", type: 5 },
        },
        {
          id: 103,
          globalId: "guid_103",
          content: "这是一道多选题",
          type: 2,
          solution: "多选解析",
          accessories: [{ options: ["A", "B", "C", "D"], type: 2 }],
          correctAnswer: { choice: "0,2", type: 2 },
        },
      ],
    };

    const mockExercise = {
      userAnswers: {
        guid_101: {
          id: 101,
          status: 1,
          time: 15,
          answer: { choice: "0", type: 1 },
        },
        guid_102: {
          id: 102,
          status: -1,
          time: 5,
          answer: { choice: "0", type: 5 },
        },
      },
    };

    it("应该正确解析题目基本信息", () => {
      const result = parseFenbiData(
        JSON.stringify(mockExercise),
        JSON.stringify(mockSolutions),
      );

      expect(result.sessionName).toBe("测试练习");
      expect(result.questions).toHaveLength(3);

      // 验证单选题 (q101)
      const q1 = result.questions[0];
      expect(q1.externalId).toBe("guid_101");
      expect(q1.content).toBe("这是一道单选题"); // HTML 应该被 strip
      expect(q1.type).toBe("single");
      expect(q1.answer).toBe("A");
      expect(q1.options).toEqual(["选项A", "选项B", "选项C", "选项D"]);

      // 验证判断题 (q102)
      const q2 = result.questions[1];
      expect(q2.type).toBe("truefalse");
      expect(q2.answer).toBe("错误"); // choice "1" -> 错误

      // 验证多选题 (q103)
      const q3 = result.questions[2];
      expect(q3.type).toBe("multi");
      expect(q3.answer).toBe("A,C"); // choice "0,2" -> A,C
    });

    it("应该正确解析用户作答记录", () => {
      const result = parseFenbiData(
        JSON.stringify(mockExercise),
        JSON.stringify(mockSolutions),
      );

      expect(result.records).toHaveLength(2);
      expect(result.correctCount).toBe(1);
      expect(result.errorCount).toBe(1);

      const r1 = result.records[0];
      expect(r1.externalId).toBe("guid_101");
      expect(r1.isCorrect).toBe(true);
      expect(r1.userAnswer).toBe("A");
      expect(r1.durationMs).toBe(15000); // 15s -> 15000ms
    });

    it("应该能够处理统计数据", () => {
      const mockStats = {
        guid_101: {
          id: 101,
          totalCount: 1000,
          correctRatio: 65.5,
          mostWrongAnswer: { choice: "2", type: 1 },
        },
      };

      const result = parseFenbiData(
        JSON.stringify(mockExercise),
        JSON.stringify(mockSolutions),
        JSON.stringify(mockStats),
      );

      const q1 = result.questions[0];
      expect(q1.stats).toBeDefined();
      expect(q1.stats?.totalAnswers).toBe(1000);
      expect(q1.stats?.correctRatio).toBe(65.5);
      expect(q1.stats?.mostWrongAnswer).toBe("C"); // choice "2" -> C
    });

    it("应该正确关联材料内容", () => {
      const solutionsWithMaterial = {
        ...mockSolutions,
        materials: [{ globalId: "mat_1", content: "<p>材料内容</p>" }],
        card: {
          children: [{ key: "guid_101", materialKeys: ["mat_1"], nodeType: 1 }],
        },
      };

      const result = parseFenbiData(
        JSON.stringify(mockExercise),
        JSON.stringify(solutionsWithMaterial),
      );

      const q1 = result.questions[0];
      expect(q1.material).toBe("材料内容");
      expect(q1.materialHtml).toBe("<p>材料内容</p>");
    });

    it("应该正确解析填空题（保留占位符）", () => {
      const solutionsWithFillBlank = {
        name: "填空题测试",
        solutions: [
          {
            id: 201,
            globalId: "guid_201",
            content:
              '<p>教育目的是衡量教育实施效果的根本依据和标准，这体现了教育目的的<input type="text" size="4" placeholder="" readonly />功能。</p>',
            type: 61,
            solution: "本题考查教育目的的功能...",
            accessories: [],
            correctAnswer: {
              blanks: ["评价"],
              type: 202,
            },
            keypoints: [{ id: 1, name: "教育目的概述" }],
          },
        ],
      };

      const exerciseWithFillBlank = {
        userAnswers: {
          guid_201: {
            id: 201,
            status: 1,
            time: 20,
            answer: { blanks: ["评价"], type: 202 },
          },
        },
      };

      const result = parseFenbiData(
        JSON.stringify(exerciseWithFillBlank),
        JSON.stringify(solutionsWithFillBlank),
      );

      expect(result.questions).toHaveLength(1);
      const q = result.questions[0];
      expect(q.type).toBe("fill_blank");
      expect(q.answer).toBe("评价");
      // 验证填空题内容保留了下划线占位符
      expect(q.content).toContain("_____");
      expect(q.content).not.toContain("<input");
    });
  });
});
