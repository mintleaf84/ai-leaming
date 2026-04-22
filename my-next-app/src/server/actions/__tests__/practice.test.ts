import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Hoisted Mocks
const { mockDb, mockRequireUser, mockDemoService, mockUpdateMastery, mockDrizzleDb, mockDrizzleSchema } = vi.hoisted(() => ({
  mockDb: {
    prepare: vi.fn(),
    transaction: vi.fn(fn => fn)
  },
  mockRequireUser: vi.fn().mockResolvedValue({ id: 1, username: 'testuser' }),
  mockDemoService: {
    isDemoModeEnabled: vi.fn().mockReturnValue(false),
    getDemoSession: vi.fn()
  },
  mockUpdateMastery: vi.fn(),
  mockDrizzleDb: {
    query: {
      practice_sessions: {
        findFirst: vi.fn()
      },
      questions: {
        findFirst: vi.fn()
      }
    },
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    get: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  },
  mockDrizzleSchema: {
    practice_sessions: { user_id: 'user_id', is_demo: 'is_demo', created_at: 'created_at' },
    practice_logs: { session_id: 'session_id' },
    questions: { id: 'id' }
  }
}));

// 2. Apply Mocks
vi.mock('@/lib/db', () => ({ 
  default: mockDrizzleDb,
  db: mockDb,
  drizzleDb: mockDrizzleDb,
  drizzleSchema: mockDrizzleSchema 
}));
vi.mock('@/lib/auth/auth', () => ({ requireUser: mockRequireUser }));
vi.mock('@/lib/practice/demo', () => ({ DemoService: mockDemoService }));
vi.mock('@/lib/services/mastery', () => ({
  masteryService: { updateMastery: (...args: any[]) => mockUpdateMastery(...args) }
}));

// Mock safe-query (仅注册模块，具体实现在 beforeEach 中设置)
vi.mock('@/lib/db/safe-query', () => ({
  safeGet: vi.fn(),
  safeAll: vi.fn()
}));

import { getPracticeSessionAction, submitAnswerAction } from '../practice';

import * as safeQueryModule from '@/lib/db/safe-query';

describe('Practice Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // 恢复被 clearAllMocks 清除的 mock 实现
    mockRequireUser.mockResolvedValue({ id: 1, username: 'testuser' });
    mockDemoService.isDemoModeEnabled.mockReturnValue(false);

    // 每次 clearAllMocks 后重新注册 safeGet / safeAll 的实现
    // 原因：vi.clearAllMocks() 会清除所有 mock 函数的 mockImplementation
    // 但 vi.mock() 的模块替换本身不受影响，只是函数实现被重置为空
    vi.mocked(safeQueryModule.safeGet).mockImplementation((stmt: any, params: any[], _schema: any) => {
      const res = stmt.get(...params);
      return res ?? null;
    });
    vi.mocked(safeQueryModule.safeAll).mockImplementation((stmt: any, params: any[], schema: any) => {
      const res = stmt.all(...params);
      return res.map((r: any) => schema.parse(r));
    });
    
    // Default DB behavior
    mockDb.prepare.mockImplementation((_sql: string) => ({
      get: vi.fn().mockReturnValue(undefined),
      all: vi.fn().mockReturnValue([]),
      run: vi.fn().mockReturnValue({ changes: 1 })
    }));

    // Drizzle default behavior
    mockDrizzleDb.query.practice_sessions.findFirst.mockResolvedValue(null);
    mockDrizzleDb.get.mockResolvedValue(null);
    mockDrizzleDb.select.mockReturnThis();
    mockDrizzleDb.from.mockReturnThis();
    mockDrizzleDb.where.mockReturnThis();
    mockDrizzleDb.insert.mockReturnThis();
    mockDrizzleDb.update.mockReturnThis();
    mockDrizzleDb.set.mockReturnThis();
    mockDrizzleDb.values.mockResolvedValue({ changes: 1 });
    mockDrizzleDb.orderBy.mockReturnThis();
    mockDrizzleDb.limit.mockReturnThis();
  });

  describe('getPracticeSessionAction', () => {
    const mockQuestion = { 
      id: 1, 
      content: '这是一道测试题目内容，长度足够', 
      options: ["A", "B"], 
      answer: 'A',
      explanation: '解析内容必须足够长，现在超过五个字符了',
      dimension: 'knowledge',
      tags: ["Tag1"]
    };

    it('正常模式下应该创建新会话 (当无可用旧会话时)', async () => {
      mockDrizzleDb.select.mockReturnThis();
      mockDrizzleDb.from.mockReturnThis();
      mockDrizzleDb.orderBy.mockReturnThis();
      mockDrizzleDb.limit.mockResolvedValue([mockQuestion]);
      
      mockDrizzleDb.insert.mockReturnThis();
      mockDrizzleDb.values.mockResolvedValue({ changes: 1 });

      const result = await getPracticeSessionAction(true);
      
      expect(result.sessionId).toBeDefined();
      expect(result.questions).toHaveLength(1);
    });

    it('当演示模式开启时，应该返回演示会话', async () => {
      mockDemoService.isDemoModeEnabled.mockReturnValue(true);
      mockDemoService.getDemoSession.mockResolvedValue({
        sessionId: 'demo-123',
        questions: [mockQuestion]
      });

      const result = await getPracticeSessionAction();
      
      expect(result.sessionId).toBe('demo-123');
      expect(result.questions[0].id).toBe(1);
    });

    it('应该能正确恢复未完成的会话', async () => {
      mockDrizzleDb.query.practice_sessions.findFirst.mockResolvedValue({ 
        id: 's1', user_id: 1, total_questions: 10, correct_count: 0, review_count: 0, is_demo: 0,
        questions_json: JSON.stringify([mockQuestion]) 
      });
      mockDrizzleDb.get.mockResolvedValue({ count: 5 });

      const result = await getPracticeSessionAction(false);
      
      expect(result.resumed).toBe(true);
      expect(result.completedCount).toBe(5);
    });
  });

  describe('submitAnswerAction', () => {
    it('应该记录答案并更新掌握度', async () => {
      mockDrizzleDb.query.questions.findFirst.mockResolvedValue({ 
        tags: '["Tag1"]', 
        dimension: 'knowledge' 
      });

      const result = await submitAnswerAction(1, 'A', true, 1000, 'sess-1');
      expect(result.success).toBe(true);
      expect(mockUpdateMastery).toHaveBeenCalled();
    });
  });
});
