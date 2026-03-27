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
      // 准备 - 模拟三类题目的返回
      mockAll
        .mockReturnValueOnce([{ id: 1 }, { id: 2 }])   // 顽固题 2 道
        .mockReturnValueOnce([{ id: 3 }, { id: 4 }])   // 盲区题 2 道
        .mockReturnValueOnce([{ id: 5 }]);             // 常规题 1 道

      // 执行
      const session = schedulingService.generateSession(1, 35);

      // 验证 - 各类题目请求数量及 SQL 逻辑
      // 35 * 0.4 = 14 顽固题 (JOIN observation_zone)
      expect(mockPrepare).toHaveBeenNthCalledWith(1, expect.stringContaining('observation_zone'));
      expect(mockAll).toHaveBeenNthCalledWith(1, 14);

      // 35 * 0.4 = 14 盲区题 (NOT EXISTS practice_logs)
      expect(mockPrepare).toHaveBeenNthCalledWith(2, expect.stringContaining('NOT EXISTS'));
      expect(mockPrepare).toHaveBeenNthCalledWith(2, expect.stringContaining('practice_logs'));
      expect(mockAll).toHaveBeenNthCalledWith(2, 14);

      // 35 - 14 - 14 = 7 常规题 (NOT IN ...)
      expect(mockPrepare).toHaveBeenNthCalledWith(3, expect.stringContaining('NOT IN'));
      expect(mockAll).toHaveBeenNthCalledWith(3, 7);

      // 验证 - 返回结果数量
      expect(session).toHaveLength(5); // 2+2+1
    });

    it('默认应该生成 35 道题', () => {
      mockAll.mockReturnValue([]);

      schedulingService.generateSession(1);

      // 默认 limit = 35
      // 应该请求 14 + 14 + 7 = 35
      expect(mockAll).toHaveBeenNthCalledWith(1, 14);
      expect(mockAll).toHaveBeenNthCalledWith(2, 14);
      expect(mockAll).toHaveBeenNthCalledWith(3, 7);
    });

    it('应该支持自定义题目数量', () => {
      mockAll.mockReturnValue([]);

      schedulingService.generateSession(1, 10);

      // 10 * 0.4 = 4 顽固题
      // 10 * 0.4 = 4 盲区题
      // 10 - 4 - 4 = 2 常规题
      expect(mockAll).toHaveBeenNthCalledWith(1, 4);
      expect(mockAll).toHaveBeenNthCalledWith(2, 4);
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
