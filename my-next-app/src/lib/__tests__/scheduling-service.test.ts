
import { schedulingService } from '@/lib/services/scheduling';
import db from '@/lib/db';

// Mock DB
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    prepare: jest.fn(),
  },
}));

describe('schedulingService', () => {
  let mockAll: jest.Mock;
  let mockPrepare: jest.Mock;

  beforeEach(() => {
    mockAll = jest.fn();
    mockPrepare = db.prepare as jest.Mock;
    
    // Default: returns array for .all()
    mockPrepare.mockReturnValue({
      all: mockAll,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateSession', () => {
    it('should request correct distribution of questions (40/40/20)', () => {
      // Mock returns
      mockAll
        .mockReturnValueOnce([{ id: 1 }, { id: 2 }]) // Stubborn (e.g., requested 14, got 2)
        .mockReturnValueOnce([{ id: 3 }, { id: 4 }]) // Blind
        .mockReturnValueOnce([{ id: 5 }]);           // Regular

      const session = schedulingService.generateSession(35);

      // 35 * 0.4 = 14 Stubborn
      // 35 * 0.4 = 14 Blind
      // 35 - 14 - 14 = 7 Regular

      expect(mockPrepare).toHaveBeenCalledTimes(3);
      
      // Verify LIMITs in calls
      expect(mockAll).toHaveBeenNthCalledWith(1, 14);
      expect(mockAll).toHaveBeenNthCalledWith(2, 14);
      expect(mockAll).toHaveBeenNthCalledWith(3, 7);
      
      expect(session).toHaveLength(5); // 2+2+1
    });
  });
});
