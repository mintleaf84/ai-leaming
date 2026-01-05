import { describe, it, expect, beforeEach, vi } from 'vitest';

// 使用 vi.hoisted 确保 mock 变量在 vi.mock 之前可用
const { mockPrepare, mockRun, mockGet, mockAll } = vi.hoisted(() => {
  const mockRun = vi.fn();
  const mockGet = vi.fn();
  const mockAll = vi.fn();
  const mockPrepare = vi.fn(() => ({
    run: mockRun,
    get: mockGet,
    all: mockAll,
  }));
  return { mockPrepare, mockRun, mockGet, mockAll };
});

// Mock db 模块
vi.mock('@/lib/db', () => ({
  default: {
    prepare: mockPrepare,
  },
}));

// 导入被测试的模块
import { masteryService } from '@/lib/services/mastery';

describe('masteryService', () => {
  const TEST_USER_ID = 1;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('updateMastery', () => {
    it('答对时应该增加 10 分', () => {
      // 准备
      mockGet.mockReturnValue({ score: 0 });
      mockRun.mockReturnValue({ changes: 1 });

      // 执行
      const result = masteryService.updateMastery(TEST_USER_ID, 'test-tag', 'knowledge', true);

      // 验证
      expect(result[0].newScore).toBe(10);
      expect(result[0].change).toBe(10);
    });

    it('可疑答对（监控正确）时不应增加分数', () => {
      mockGet.mockReturnValue({ score: 20 });
      mockRun.mockReturnValue({ changes: 1 });

      const result = masteryService.updateMastery(TEST_USER_ID, 'test-tag', 'knowledge', true, true);

      expect(result[0].newScore).toBe(20);
      expect(result[0].change).toBe(0);
    });

    it('答错时应该扣除 30 分（标准惩罚）', () => {
      mockGet.mockReturnValue({ score: 50 });
      mockRun.mockReturnValue({ changes: 1 });

      const result = masteryService.updateMastery(TEST_USER_ID, 'test-tag', 'knowledge', false);

      // 50 - 30 = 20
      expect(result[0].newScore).toBe(20);
      expect(result[0].change).toBe(-30);
    });

    it('高掌握度（≥100）答错时只扣 10 分（保护机制）', () => {
      mockGet.mockReturnValue({ score: 100 });
      mockRun.mockReturnValue({ changes: 1 });

      const result = masteryService.updateMastery(TEST_USER_ID, 'test-tag', 'knowledge', false);

      // 100 - 10 = 90
      expect(result[0].newScore).toBe(90);
      expect(result[0].change).toBe(-10);
    });

    it('应用题答错时应该额外扣除 30% 分数（向下惩罚）', () => {
      mockGet.mockReturnValue({ score: 80 });
      mockRun.mockReturnValue({ changes: 1 });

      const result = masteryService.updateMastery(TEST_USER_ID, 'test-tag', 'application', false);

      // 基础惩罚: 80 - 30 = 50
      // 向下惩罚: 30% of 80 = 24
      // 最终: 50 - 24 = 26
      expect(result[0].newScore).toBe(26);
      expect(result[0].change).toBe(-54); // -30 + -24
    });

    it('分数不应低于 0', () => {
      mockGet.mockReturnValue({ score: 10 });
      mockRun.mockReturnValue({ changes: 1 });

      const result = masteryService.updateMastery(TEST_USER_ID, 'test-tag', 'knowledge', false);

      // 10 - 30 = -20 -> 0
      expect(result[0].newScore).toBe(0);
    });
  });

  describe('getMastery', () => {
    it('应该返回指定标签的掌握度分数', () => {
      mockGet.mockReturnValue({ score: 75 });

      const score = masteryService.getMastery(TEST_USER_ID, 'test-tag');

      expect(score).toBe(75);
    });

    it('标签不存在时应该返回 0', () => {
      mockGet.mockReturnValue(undefined);

      const score = masteryService.getMastery(TEST_USER_ID, 'unknown-tag');

      expect(score).toBe(0);
    });
  });

  describe('getHierarchyMastery', () => {
    it('应该返回层级的平均掌握度', () => {
      mockGet.mockReturnValue({ avgScore: 60, count: 5 });

      const result = masteryService.getHierarchyMastery(TEST_USER_ID, '教育学');

      expect(result.avgScore).toBe(60);
      expect(result.count).toBe(5);
    });
  });

  describe('getMasteryTree', () => {
    it('应该返回树形结构的掌握度数据', () => {
      mockAll.mockReturnValue([
        { tag_name: '教育学', score: 80 },
        { tag_name: '教育学/教育原理', score: 70 },
        { tag_name: '心理学', score: 60 },
      ]);

      const tree = masteryService.getMasteryTree(TEST_USER_ID);

      expect(tree).toHaveLength(2); // 两个根节点
      expect(tree[0].name).toBe('教育学');
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].name).toBe('教育原理');
    });
  });
});
