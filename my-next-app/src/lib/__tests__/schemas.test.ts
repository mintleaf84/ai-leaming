import { describe, it, expect } from 'vitest';
import { QuestionSchema } from '../schemas';

describe('QuestionSchema Answer Validation', () => {
  const baseQuestion = {
    content: '这是一个测试题干内容，长度超过五个字符',
    options: ['选项 A 内容', '选项 B 内容', '选项 C 内容'],
    explanation: '这是一个测试解析内容，长度超过五个字符',
    tags: ['测试标签'],
    dimension: 'knowledge',
    type: 'single'
  };

  it('应该支持匹配选项内容的单选题答案', () => {
    const data = { ...baseQuestion, answer: '选项 A 内容' };
    expect(QuestionSchema.safeParse(data).success).toBe(true);
  });

  it('应该支持匹配选项标号(A/B/C)的单选题答案', () => {
    const data = { ...baseQuestion, answer: 'A' };
    expect(QuestionSchema.safeParse(data).success).toBe(true);
  });

  it('不应该通过既不匹配内容也不匹配标号的答案', () => {
    const data = { ...baseQuestion, answer: 'D' }; // 只有三个选项(A/B/C)
    expect(QuestionSchema.safeParse(data).success).toBe(false);
    
    const data2 = { ...baseQuestion, answer: '不存在的内容' };
    expect(QuestionSchema.safeParse(data2).success).toBe(false);
  });

  it('应该支持多选题的 JSON 标号数组答案', () => {
    const data = { 
      ...baseQuestion, 
      type: 'multi', 
      answer: JSON.stringify(['A', 'B']) 
    };
    expect(QuestionSchema.safeParse(data).success).toBe(true);
  });

  it('应该支持多选题的 JSON 内容数组答案', () => {
    const data = { 
      ...baseQuestion, 
      type: 'multi', 
      answer: JSON.stringify(['选项 A 内容', '选项 C 内容']) 
    };
    expect(QuestionSchema.safeParse(data).success).toBe(true);
  });

  it('混杂标号与内容的数组也应该通过 (鲁棒性)', () => {
    const data = { 
      ...baseQuestion, 
      type: 'multi', 
      answer: JSON.stringify(['A', '选项 C 内容']) 
    };
    expect(QuestionSchema.safeParse(data).success).toBe(true);
  });
});
