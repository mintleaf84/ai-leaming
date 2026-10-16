import { describe, it, expect, vi, beforeEach } from "vitest";
import { SOCRATIC_TUTOR_PROMPT } from "../prompts";
import { buildEnhancedSystemPrompt } from "@/lib/services/chat-rag";

// Mock DB because buildEnhancedSystemPrompt calls getPromptFromDb
vi.mock("@/lib/db", () => {
  const mockDrizzleDb = {
    query: {
      prompt_templates: { findFirst: vi.fn().mockResolvedValue(null) },
    },
  };
  return {
    default: mockDrizzleDb,
    db: {},
    drizzleDb: mockDrizzleDb,
    drizzleSchema: {
      prompt_templates: { key: "key", template: "template" },
    },
  };
});

describe("Socratic Tutor Mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should export SOCRATIC_TUTOR_PROMPT", () => {
    expect(SOCRATIC_TUTOR_PROMPT).toBeDefined();
    expect(typeof SOCRATIC_TUTOR_PROMPT).toBe("string");
    expect(SOCRATIC_TUTOR_PROMPT).toContain("苏格拉底");
  });

  it("should contain key socratic principles", () => {
    const p = SOCRATIC_TUTOR_PROMPT;
    expect(p).toContain("拒绝直接回答");
    expect(p).toContain("循循善诱");
    expect(p).toContain("纠正与反问");
  });

  it("should return socratic prompt when mode is socratic", async () => {
    const prompt = await buildEnhancedSystemPrompt(undefined, "socratic");
    expect(prompt).toContain("苏格拉底");
    expect(prompt).not.toContain("资深的教师招聘考试辅导专家");
  });

  it("should return default prompt when mode is standard or undefined", async () => {
    const prompt = await buildEnhancedSystemPrompt(undefined, "standard");
    expect(prompt).toContain("资深的教师招聘考试辅导专家");
    expect(prompt).not.toContain("苏格拉底");
  });
});
