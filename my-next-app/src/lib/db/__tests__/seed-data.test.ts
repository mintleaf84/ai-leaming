import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use hoisted mocks
const { mockRun, mockAll, mockGetSetting } = vi.hoisted(() => {
  const mockRunFn = vi.fn().mockResolvedValue({});
  const mockAllFn = vi.fn().mockResolvedValue([]);
  const mockGetSettingFn = vi.fn().mockResolvedValue(null);
  return { mockRun: mockRunFn, mockAll: mockAllFn, mockGetSetting: mockGetSettingFn };
});

vi.mock('../index', () => ({
  drizzleDb: {
    run: mockRun,
    all: mockAll
  }
}));

vi.mock('../utils-drizzle', () => ({
  getSetting: mockGetSetting
}));

import { seedData } from '../seed-data';

describe('seed-data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('seedData', () => {
    it('should be a function', () => {
      expect(seedData).toBeDefined();
      expect(typeof seedData).toBe('function');
    });

    it('should execute seed functions without error', async () => {
      mockAll
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }]);

      await expect(seedData()).resolves.not.toThrow();
    });

    it('should handle missing ai configs gracefully', async () => {
      mockAll
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }]);

      await expect(seedData()).resolves.not.toThrow();
    });

    it('should handle existing data gracefully', async () => {
      mockAll
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([{ count: 1 }]);

      await expect(seedData()).resolves.not.toThrow();
    });
  });
});