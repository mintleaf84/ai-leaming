// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// 1. Mock dependencies
const { mockImportService } = vi.hoisted(() => ({
  mockImportService: {
    importFenbiData: vi.fn(),
  },
}));

vi.mock("@/lib/services/import-service", () => ({
  importService: mockImportService,
}));

vi.mock("@/lib/auth/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: 1 }),
}));

vi.mock("@/lib/import/fenbi-parser", () => ({
  validateFenbiJson: vi.fn(),
  parseFenbiData: vi.fn(),
}));

import { validateFenbiJson, parseFenbiData } from "@/lib/import/fenbi-parser";
import { importFenbiDataAction } from "../import";

describe("Import Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should successfully call importService with parsed data", async () => {
    // Setup Parser Mocks
    vi.mocked(validateFenbiJson).mockReturnValue({ valid: true });
    vi.mocked(parseFenbiData).mockReturnValue({
      sessionName: "Test Session",
      totalCount: 1,
      correctCount: 1,
      errorCount: 0,
      questions: [{ externalId: "ext-1" } as any],
      records: [{ externalId: "ext-1" } as any],
    } as any);

    // Setup Service Mock
    mockImportService.importFenbiData.mockResolvedValue({
      sessionId: "test-session-id",
      importedCount: 1,
      newQuestionsCount: 1,
    });

    const result = await importFenbiDataAction({
      exerciseJson: "{}",
      solutionsJson: "{}",
    });

    expect(result.data?.success).toBe(true);
    expect(result.data?.sessionId).toBe("test-session-id");
    expect(result.data?.importedCount).toBe(1);
    expect(mockImportService.importFenbiData).toHaveBeenCalledWith(
      1,
      expect.anything(),
    );
  });

  it("should return error if validation fails", async () => {
    vi.mocked(validateFenbiJson).mockReturnValue({
      valid: false,
      error: "Invalid JSON",
    });

    const result = await importFenbiDataAction({
      exerciseJson: "invalid",
      solutionsJson: "invalid",
    });

    expect(result.data?.success).toBeFalsy();
    expect(result.data?.message).toBe("Invalid JSON");
    expect(mockImportService.importFenbiData).not.toHaveBeenCalled();
  });

  it("should handle service errors gracefully", async () => {
    vi.mocked(validateFenbiJson).mockReturnValue({ valid: true });
    vi.mocked(parseFenbiData).mockReturnValue({
      questions: [{ id: 1 }],
    } as any);

    mockImportService.importFenbiData.mockRejectedValue(
      new Error("Database connection failed"),
    );

    const result = await importFenbiDataAction({
      exerciseJson: "{}",
      solutionsJson: "{}",
    });

    expect(result.data?.success).toBeFalsy();
    expect(result.serverError).toContain("Database connection failed");
  });

  it("should return error if parsed data is empty", async () => {
    vi.mocked(validateFenbiJson).mockReturnValue({ valid: true });
    vi.mocked(parseFenbiData).mockReturnValue({
      questions: [],
    } as any);

    const result = await importFenbiDataAction({
      exerciseJson: "{}",
      solutionsJson: "{}",
    });

    expect(result.data?.success).toBeFalsy();
    expect(result.data?.message).toContain("解析结果为空");
  });
});
