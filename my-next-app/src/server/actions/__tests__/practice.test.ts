import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Hoisted Mocks
const { state, mockDb, mockRequireUser, mockDemoService, mockDrizzleDb, mockDrizzleSchema } = vi.hoisted(() => {
  const state = {
      lastMethod: '',
      selectResults: [] as any[]
  };

  const mockDrizzleDb: any = {
    query: {
      practice_sessions: { findFirst: vi.fn() },
      questions: { findFirst: vi.fn() },
      question_srs: { findFirst: vi.fn(), findMany: vi.fn() }
    },
    select: vi.fn(() => { state.lastMethod = 'select'; return mockDrizzleDb; }),
    from: vi.fn(() => mockDrizzleDb),
    where: vi.fn(() => mockDrizzleDb),
    get: vi.fn(),
    insert: vi.fn(() => { state.lastMethod = 'insert'; return mockDrizzleDb; }),
    update: vi.fn(() => { state.lastMethod = 'update'; return mockDrizzleDb; }),
    set: vi.fn(() => mockDrizzleDb),
    values: vi.fn(() => mockDrizzleDb),
    orderBy: vi.fn(() => mockDrizzleDb),
    limit: vi.fn(() => mockDrizzleDb),
    innerJoin: vi.fn(() => mockDrizzleDb),
    leftJoin: vi.fn(() => mockDrizzleDb),
    then: vi.fn((resolve) => {
        if (state.lastMethod === 'select') {
            return resolve(state.selectResults.shift() || []);
        }
        return resolve({ changes: 1 });
    })
  };

  return {
    state,
    mockDb: {
      prepare: vi.fn(),
      transaction: vi.fn(fn => fn)
    },
    mockRequireUser: vi.fn().mockResolvedValue({ id: 1, username: 'testuser' }),
    mockDemoService: {
      isDemoModeEnabled: vi.fn().mockReturnValue(false),
      getDemoSession: vi.fn()
    },
    mockDrizzleDb,
    mockDrizzleSchema: {
      practice_sessions: { 
          user_id: 'user_id', is_demo: 'is_demo', created_at: 'created_at', id: 'id', 
          total_questions: 'total_questions', correct_count: 'correct_count',
          questions_json: 'questions_json'
      },
      practice_logs: { session_id: 'session_id', id: 'id' },
      questions: { id: 'id', tags: 'tags', dimension: 'dimension' },
      question_srs: { user_id: 'user_id', question_id: 'question_id', due_date: 'due_date' }
    }
  };
});

// 2. Apply Mocks
vi.mock('@/lib/db', () => ({ 
  default: mockDrizzleDb,
  db: mockDb,
  drizzleDb: mockDrizzleDb,
  drizzleSchema: mockDrizzleSchema 
}));
vi.mock('@/lib/auth/auth', () => ({ requireUser: mockRequireUser }));
vi.mock('@/lib/practice/demo', () => ({ DemoService: mockDemoService }));

// Mock dynamic import for mastery
const mockUpdateMastery = vi.fn().mockResolvedValue([]);
vi.mock('@/lib/services/mastery', () => ({
  masteryService: { updateMastery: mockUpdateMastery }
}));

import { getPracticeSessionAction, submitAnswerAction } from '../practice';

describe('Practice Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.selectResults = [];
    state.lastMethod = '';

    mockRequireUser.mockResolvedValue({ id: 1, username: 'testuser' });
    mockDemoService.isDemoModeEnabled.mockReturnValue(false);
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
      state.selectResults = [[mockQuestion]];
      
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
        state.selectResults = [
            [{ // lastSession
                id: 's1', user_id: 1, total_questions: 10, correct_count: 0, review_count: 0, is_demo: 0,
                questions_json: JSON.stringify([mockQuestion]),
                created_at: '2024-01-01'
            }],
            [{ count: 5 }] // logResult
        ];

      const result = await getPracticeSessionAction(false);
      
      expect(result.resumed).toBe(true);
      expect(result.completedCount).toBe(5);
    });
  });

  describe('submitAnswerAction', () => {
    it('应该记录答案并更新掌握度', async () => {
      state.selectResults = [
          [{ // 题目 tags 查询
              tags: JSON.stringify(["Tag1"]), 
              dimension: 'knowledge' 
          }],
          [{ answer: 'A' }] // 答案验证查询
      ];

      const result = await submitAnswerAction(1, 'A', true, 1000, 'sess-1');
      expect(result.success).toBe(true);
      expect(mockUpdateMastery).toHaveBeenCalled();
    });
  });
});
