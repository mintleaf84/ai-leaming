import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupVectorExtension } from '../vector-setup';

vi.mock('../index', () => ({
  drizzleDb: {
    run: vi.fn().mockResolvedValue({}),
    all: vi.fn()
  }
}));

import { drizzleDb } from '../index';

describe('vector-setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('setupVectorExtension', () => {
    it('should return false when vec_version fails', async () => {
      const mockRun = drizzleDb.run as ReturnType<typeof vi.fn>;
      mockRun.mockRejectedValueOnce(new Error('vec extension not available'));

      const result = await setupVectorExtension();

      expect(result).toBe(false);
    });

    it('should return true when vector extension is available and tables created', async () => {
      const mockRun = drizzleDb.run as ReturnType<typeof vi.fn>;
      const mockAll = drizzleDb.all as ReturnType<typeof vi.fn>;

      // First call: vec_version() succeeds
      mockRun.mockResolvedValueOnce({});
      // Second call: check questions_vec
      mockAll.mockResolvedValueOnce([{ count: 0 }]);
      // Third call: create questions_vec
      mockRun.mockResolvedValueOnce({});
      // Fourth call: check rag_chunks_vec
      mockAll.mockResolvedValueOnce([{ count: 0 }]);
      // Fifth call: create rag_chunks_vec
      mockRun.mockResolvedValueOnce({});

      const result = await setupVectorExtension();

      expect(result).toBe(true);
    });

    it('should not create tables if they already exist', async () => {
      const mockRun = drizzleDb.run as ReturnType<typeof vi.fn>;
      const mockAll = drizzleDb.all as ReturnType<typeof vi.fn>;

      // vec_version() succeeds
      mockRun.mockResolvedValueOnce({});
      // Both tables already exist
      mockAll.mockResolvedValueOnce([{ count: 1 }]);
      mockAll.mockResolvedValueOnce([{ count: 1 }]);

      const result = await setupVectorExtension();

      expect(result).toBe(true);
      // Should not call CREATE VIRTUAL TABLE
      expect(mockRun).toHaveBeenCalledTimes(1); // Only vec_version
    });

    it('should handle errors during table creation gracefully', async () => {
      const mockRun = drizzleDb.run as ReturnType<typeof vi.fn>;
      const mockAll = drizzleDb.all as ReturnType<typeof vi.fn>;

      // vec_version() succeeds
      mockRun.mockResolvedValueOnce({});
      // questions_vec doesn't exist
      mockAll.mockResolvedValueOnce([{ count: 0 }]);
      // But create fails
      mockRun.mockRejectedValueOnce(new Error('Create failed'));

      const result = await setupVectorExtension();

      expect(result).toBe(false);
    });
  });
});