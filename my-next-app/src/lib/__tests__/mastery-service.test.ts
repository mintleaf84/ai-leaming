
import { masteryService } from '@/lib/services/mastery';
import db from '@/lib/db';

// Mock the db module
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    prepare: jest.fn(),
  },
}));

describe('masteryService', () => {
  let mockPrepare: jest.Mock;
  let mockGet: jest.Mock;
  let mockRun: jest.Mock;

  beforeEach(() => {
    mockRun = jest.fn();
    mockGet = jest.fn();
    mockPrepare = db.prepare as jest.Mock;

    // Default implementation for prepare returns an object with run and get
    mockPrepare.mockReturnValue({
      run: mockRun,
      get: mockGet,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('updateMastery', () => {
    it('should increase score by 10 for a correct answer', () => {
      mockGet.mockReturnValue({ score: 0 }); // Current score 0

      const result = masteryService.updateMastery('test-tag', 'knowledge', true);

      expect(mockRun).toHaveBeenCalledWith('test-tag', 10);
      expect(result[0].newScore).toBe(10);
      expect(result[0].change).toBe(10);
    });

    it('should NOT increase score for a monitored correct answer', () => {
      mockGet.mockReturnValue({ score: 20 });

      const result = masteryService.updateMastery('test-tag', 'knowledge', true, true); // isMonitoredCorrect = true

      expect(mockRun).toHaveBeenCalledWith('test-tag', 20); // Score remains 20
      expect(result[0].newScore).toBe(20);
      expect(result[0].change).toBe(0);
    });

    it('should decrease score by 30 (k=3) for an incorrect answer (Standard)', () => {
      mockGet.mockReturnValue({ score: 50 });

      const result = masteryService.updateMastery('test-tag', 'knowledge', false);

      // 50 - 30 = 20
      expect(mockRun).toHaveBeenCalledWith('test-tag', 20);
      expect(result[0].newScore).toBe(20);
      expect(result[0].change).toBe(-30);
    });

    it('should only decrease score by 10 (k=1) if current score is >= 100 (High Mastery Protection)', () => {
      mockGet.mockReturnValue({ score: 100 });

      const result = masteryService.updateMastery('test-tag', 'knowledge', false);

      // 100 - 10 = 90
      expect(mockRun).toHaveBeenCalledWith('test-tag', 90);
      expect(result[0].newScore).toBe(90);
      expect(result[0].change).toBe(-10);
    });

    it('should apply Downward Penalty for incorrect Application questions', () => {
      // PRD: "错“应用”维度题，同步扣除 30% “理解”维度分值" (Here interpreted as 30% of current tag score as simplified in service)
      mockGet.mockReturnValue({ score: 80 });

      // 1. Base Penalty: 80 - 30 = 50
      // 2. Downward Penalty: 30% of 80 = 24.
      // 3. Final: 50 - 24 = 26.
      
      const result = masteryService.updateMastery('test-tag', 'application', false);

      // The service calls DB update twice in this logic path.
      // First update: 50
      // Second update: 26
      expect(mockRun).toHaveBeenNthCalledWith(1, 'test-tag', 50);
      expect(mockRun).toHaveBeenNthCalledWith(2, 26, 'test-tag'); // Second update call signature

      expect(result[0].newScore).toBe(26);
      expect(result[0].change).toBe(-30 + -24); // -54
    });

    it('should not go below 0', () => {
      mockGet.mockReturnValue({ score: 10 });

      const result = masteryService.updateMastery('test-tag', 'knowledge', false);

      // 10 - 30 = -20 -> 0
      expect(mockRun).toHaveBeenCalledWith('test-tag', 0);
      expect(result[0].newScore).toBe(0);
    });
  });
});
