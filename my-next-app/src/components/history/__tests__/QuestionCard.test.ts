import { describe, it, expect } from "vitest";
import { parseAnswer } from "../QuestionCard";

/**
 * parseAnswer 函数单元测试
 * 验证多选答案解析正确性
 */
describe("parseAnswer", () => {
  describe("单选答案", () => {
    it("应该正确解析单个字母答案", () => {
      expect(parseAnswer("A")).toEqual(["A"]);
      expect(parseAnswer("B")).toEqual(["B"]);
      expect(parseAnswer("D")).toEqual(["D"]);
    });

    it("应该保留原始答案格式", () => {
      // 单选答案保持原样，不做 trim
      expect(parseAnswer("  A  ")).toEqual(["  A  "]);
      expect(parseAnswer(" B")).toEqual([" B"]);
    });
  });

  describe("多选答案 (JSON格式)", () => {
    it("应该正确解析 JSON 数组格式", () => {
      expect(parseAnswer('["A","B"]')).toEqual(["A", "B"]);
      expect(parseAnswer('["A","C","D"]')).toEqual(["A", "C", "D"]);
    });

    it("应该处理带空格的 JSON", () => {
      expect(parseAnswer('  ["A","B"]  ')).toEqual(["A", "B"]);
    });

    it("应该处理单元素 JSON 数组", () => {
      expect(parseAnswer('["A"]')).toEqual(["A"]);
    });
  });

  describe("边界情况", () => {
    it("空字符串应返回空数组", () => {
      expect(parseAnswer("")).toEqual([]);
    });

    it("无效 JSON 应返回原字符串数组", () => {
      expect(parseAnswer("[invalid")).toEqual(["[invalid"]);
      expect(parseAnswer('["A",]')).toEqual(['["A",]']);
    });

    it("非数组 JSON 应返回原字符串", () => {
      // JSON.parse 成功但不是数组
      expect(parseAnswer('{"a":"b"}')).toEqual(['{"a":"b"}']);
    });

    it("应正确处理中文选项", () => {
      expect(parseAnswer('["选项A","选项B"]')).toEqual(["选项A", "选项B"]);
    });
  });
});
