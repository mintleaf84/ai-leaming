import { describe, it, expect, beforeEach, vi } from 'vitest';

// 使用 vi.hoisted 确保 mock 变量在 vi.mock 之前可用
const { mockPrepare, mockAll } = vi.hoisted(() => {
  const mockAll = vi.fn();
  const mockPrepare = vi.fn(() => ({
    all: mockAll,
  }));
  return { mockPrepare, mockAll };
});

// Mock db 模块
vi.mock('@/lib/db', () => ({
  default: {
    prepare: mockPrepare,
  },
}));

// 导入被测试的模块
import { schedulingService } from '@/lib/services/scheduling';

describe('schedulingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateSession', () => {
    it('应该按 40/40/20 规则分配题目数量', () => {
      // 准备 - 模拟三类题目的返回（模拟各返回 14 道）
      const stubborn14 = Array.from({ length: 14 }, (_, i) => ({ id: i + 1 }));
      const blind14 = Array.from({ length: 14 }, (_, i) => ({ id: i + 100 }));
      mockAll
        .mockReturnValueOnce(stubborn14)   // 顽固题 14 道
        .mockReturnValueOnce(blind14)      // 盲区题 14 道
        .mockReturnValueOnce([{ id: 201 }]); // 常规题 1 道

      // 执行
      const session = schedulingService.generateSession(1, 35);

      // 验证 - 各类题目请求数量及 SQL 逻辑
      // 35 * 0.4 = 14 顽固题 (JOIN observation_zone)
      expect(mockPrepare).toHaveBeenNthCalledWith(1, expect.stringContaining('observation_zone'));
      expect(mockAll).toHaveBeenNthCalledWith(1, 1, 14);

      // 35 * 0.4 = 14 盲区题 (NOT EXISTS practice_logs)
      expect(mockPrepare).toHaveBeenNthCalledWith(2, expect.stringContaining('NOT EXISTS'));
      expect(mockPrepare).toHaveBeenNthCalledWith(2, expect.stringContaining('practice_logs'));
      expect(mockAll).toHaveBeenNthCalledWith(2, 1, 14);

      // 35 - 14 - 14 = 7 常规题 (NOT IN ...)
      expect(mockPrepare).toHaveBeenNthCalledWith(3, expect.stringContaining('NOT IN'));
      expect(mockAll).toHaveBeenNthCalledWith(3, 7);

      // 验证 - 返回结果数量（14+14+1）
      expect(session).toHaveLength(29);
    });

    it('默认应该生成 35 道题', () => {
      // 模拟各返回 14 道，以确保 remainingCount 计算为 35-28=7
      const stubborn14 = Array.from({ length: 14 }, (_, i) => ({ id: i + 1 }));
      const blind14 = Array.from({ length: 14 }, (_, i) => ({ id: i + 100 }));
      mockAll
        .mockReturnValueOnce(stubborn14)
        .mockReturnValueOnce(blind14)
        .mockReturnValue([]);

      schedulingService.generateSession(1);

      // 默认 limit = 35: stubbornTarget=14, blindTarget=14, remaining=7
      expect(mockAll).toHaveBeenNthCalledWith(1, 1, 14);
      expect(mockAll).toHaveBeenNthCalledWith(2, 1, 14);
      expect(mockAll).toHaveBeenNthCalledWith(3, 7);
    });

    it('应该支持自定义题目数量', () => {
      // 模拟各返回 4 道，以确保 remainingCount 计算为 10-8=2
      const stubborn4 = Array.from({ length: 4 }, (_, i) => ({ id: i + 1 }));
      const blind4 = Array.from({ length: 4 }, (_, i) => ({ id: i + 100 }));
      mockAll
        .mockReturnValueOnce(stubborn4)
        .mockReturnValueOnce(blind4)
        .mockReturnValue([]);

      schedulingService.generateSession(1, 10);

      // 10 * 0.4 = 4 顽固题
      // 10 * 0.4 = 4 盲区题
      // 10 - 4 - 4 = 2 常规题
      expect(mockAll).toHaveBeenNthCalledWith(1, 1, 4);
      expect(mockAll).toHaveBeenNthCalledWith(2, 1, 4);
      expect(mockAll).toHaveBeenNthCalledWith(3, 2);
    });

    it('结果应该包含所有类型的题目', () => {
      const stubbornQ = [{ id: 1, content: '顽固题' }];
      const blindQ = [{ id: 2, content: '盲区题' }];
      const regularQ = [{ id: 3, content: '常规题' }];

      mockAll
        .mockReturnValueOnce(stubbornQ)
        .mockReturnValueOnce(blindQ)
        .mockReturnValueOnce(regularQ);

      const session = schedulingService.generateSession(1, 10);

      // 应该包含所有题目
      expect(session).toHaveLength(3);
      expect(session.map(q => q.id)).toEqual(expect.arrayContaining([1, 2, 3]));
    });
  });
});

// ==================== calculateSessionRatios 单独测试 ====================
import { calculateSessionRatios } from '@/lib/services/scheduling';

describe('calculateSessionRatios（40/40/20 比例分配）', () => {
  it('标准 35 题的分配', () => {
    const ratios = calculateSessionRatios(35);
    // 35 * 0.4 = 14 → stubborn=14, blind=14, regular=35-28=7
    expect(ratios.stubborn).toBe(14);
    expect(ratios.blind).toBe(14);
    expect(ratios.regular).toBe(7);
    expect(ratios.stubborn + ratios.blind + ratios.regular).toBe(35);
  });

  it('10 题的分配', () => {
    const ratios = calculateSessionRatios(10);
    expect(ratios.stubborn).toBe(4);
    expect(ratios.blind).toBe(4);
    expect(ratios.regular).toBe(2);
    expect(ratios.stubborn + ratios.blind + ratios.regular).toBe(10);
  });

  it('5 题的分配（边界值）', () => {
    const ratios = calculateSessionRatios(5);
    // 5 * 0.4 = 2 → stubborn=2, blind=2, regular=5-4=1
    expect(ratios.stubborn).toBe(2);
    expect(ratios.blind).toBe(2);
    expect(ratios.regular).toBe(1);
  });

  it('3 题的分配（奇数边界）', () => {
    const ratios = calculateSessionRatios(3);
    // 3 * 0.4 = 1.2 → floor=1; stubborn=1, blind=1, regular=3-2=1
    expect(ratios.stubborn).toBe(1);
    expect(ratios.blind).toBe(1);
    expect(ratios.regular).toBe(1);
  });

  it('1 题的分配（最小值）', () => {
    const ratios = calculateSessionRatios(1);
    // 1 * 0.4 = 0.4 → floor=0; stubborn=0, blind=0, regular=1-0=1
    expect(ratios.stubborn).toBe(0);
    expect(ratios.blind).toBe(0);
    expect(ratios.regular).toBe(1);
  });

  it('分配总数应始终等于 limit', () => {
    for (const limit of [1, 5, 10, 20, 35, 100]) {
      const { stubborn, blind, regular } = calculateSessionRatios(limit);
      expect(stubborn + blind + regular).toBe(limit);
    }
  });
});
