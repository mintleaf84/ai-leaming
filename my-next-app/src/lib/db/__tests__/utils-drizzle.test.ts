import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSetting, setSetting, setUserAsAdmin } from "../utils-drizzle";

// Test the functions by mocking at the appropriate level
describe("utils-drizzle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSetting", () => {
    it("should be a function", () => {
      expect(getSetting).toBeDefined();
      expect(typeof getSetting).toBe("function");
    });
  });

  describe("setSetting", () => {
    it("should be a function", () => {
      expect(setSetting).toBeDefined();
      expect(typeof setSetting).toBe("function");
    });
  });

  describe("setUserAsAdmin", () => {
    it("should be a function", () => {
      expect(setUserAsAdmin).toBeDefined();
      expect(typeof setUserAsAdmin).toBe("function");
    });
  });
});
