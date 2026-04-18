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

  describe('updateMastery（准确率算法）', () => {
    it('首次答对时分数应为 100（1/1 × 100）', () => {
      // 准备：无现有记录
      mockGet.mockReturnValue(undefined);
      mockRun.mockReturnValue({ changes: 1 });

      // 执行
      const result = masteryService.updateMastery(TEST_USER_ID, 'test-tag', 'knowledge', true);

      // 验证：1/1 = 100%
      expect(result[0].newScore).toBe(100);
      expect(result[0].change).toBe(100);
      expect(result[0].previousScore).toBe(0);
    });

    it('答对后答错，分数应为 50（1/2 × 100）', () => {
      // 准备：已有 1 correct / 1 total
      mockGet.mockReturnValue({ score: 100, correct_count: 1, total_count: 1 });
      mockRun.mockReturnValue({ changes: 1 });

      // 执行：答错
      const result = masteryService.updateMastery(TEST_USER_ID, 'test-tag', 'knowledge', false);

      // 验证：1/2 = 50%
      expect(result[0].newScore).toBe(50);
      expect(result[0].change).toBe(-50);
      expect(result[0].previousScore).toBe(100);
    });

    it('可疑答对（监控正确）时正确数不增加，总数增加', () => {
      // 准备：已有 1 correct / 1 total
      mockGet.mockReturnValue({ score: 100, correct_count: 1, total_count: 1 });
      mockRun.mockReturnValue({ changes: 1 });

      // 执行：可疑答对（isMonitoredCorrect=true）
      const result = masteryService.updateMastery(TEST_USER_ID, 'test-tag', 'knowledge', true, true);

      // 验证：1/2 = 50%（正确数不变，总数+1）
      expect(result[0].newScore).toBe(50);
      expect(result[0].change).toBe(-50);
    });

    it('连续答错时分数递减', () => {
      // 准备：已有 2 correct / 4 total（50%）
      mockGet.mockReturnValue({ score: 50, correct_count: 2, total_count: 4 });
      mockRun.mockReturnValue({ changes: 1 });

      // 执行：答错
      const result = masteryService.updateMastery(TEST_USER_ID, 'test-tag', 'knowledge', false);

      // 验证：2/5 = 40%
      expect(result[0].newScore).toBe(40);
      expect(result[0].change).toBe(-10);
    });

    it('连续答对时分数递增', () => {
      // 准备：已有 3 correct / 6 total（50%）
      mockGet.mockReturnValue({ score: 50, correct_count: 3, total_count: 6 });
      mockRun.mockReturnValue({ changes: 1 });

      // 执行：答对
      const result = masteryService.updateMastery(TEST_USER_ID, 'test-tag', 'knowledge', true);

      // 验证：4/7 ≈ 57.14%
      expect(result[0].newScore).toBeCloseTo(57.14, 1);
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
