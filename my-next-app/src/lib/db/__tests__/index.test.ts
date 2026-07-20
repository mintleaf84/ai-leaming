import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the modules before importing
vi.mock("better-sqlite3", () => ({
  default: vi.fn(() => ({
    pragma: vi.fn(),
    loadExtension: vi.fn(),
    prepare: vi.fn(() => ({
      get: vi.fn(() => ({ version: "0.1.0" })),
    })),
    close: vi.fn(),
  })),
}));

vi.mock("sqlite-vec", () => ({
  getLoadablePath: vi.fn(() => "/mock/path/vec0.dll"),
}));

vi.mock("@libsql/client", () => ({
  createClient: vi.fn(() => ({
    execute: vi.fn().mockResolvedValue({}),
    close: vi.fn(),
  })),
}));

vi.mock("drizzle-orm/libsql", () => ({
  drizzle: vi.fn(() => ({})),
  migrate: vi.fn().mockResolvedValue({}),
}));

vi.mock("./drizzle-schema", () => ({}));
vi.mock("./vector-setup", () => ({
  setupVectorExtension: vi.fn().mockResolvedValue(true),
}));
vi.mock("./seed-data", () => ({
  seedData: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/env", () => ({
  env: {
    DB_FILENAME: "test.db",
  },
}));

describe("Database Index Module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Module exports", () => {
    it("should export getLegacyDb function", async () => {
      const { getLegacyDb } = await import("../index");
      expect(getLegacyDb).toBeDefined();
      expect(typeof getLegacyDb).toBe("function");
    });

    it("should export closeDb function", async () => {
      const { closeDb } = await import("../index");
      expect(closeDb).toBeDefined();
      expect(typeof closeDb).toBe("function");
    });

    it("should export reinitDb function", async () => {
      const { reinitDb } = await import("../index");
      expect(reinitDb).toBeDefined();
      expect(typeof reinitDb).toBe("function");
    });

    it("should export initDatabase function", async () => {
      const { initDatabase } = await import("../index");
      expect(initDatabase).toBeDefined();
      expect(typeof initDatabase).toBe("function");
    });

    it("should export setupVectorExtension", async () => {
      const { setupVectorExtension } = await import("../index");
      expect(setupVectorExtension).toBeDefined();
    });

    it("should export seedData", async () => {
      const { seedData } = await import("../index");
      expect(seedData).toBeDefined();
    });

    it("should export getSetting and setSetting", async () => {
      const { getSetting, setSetting } = await import("../index");
      expect(getSetting).toBeDefined();
      expect(setSetting).toBeDefined();
    });

    it("should export drizzleSchema", async () => {
      const { drizzleSchema } = await import("../index");
      expect(drizzleSchema).toBeDefined();
    });

    it("should export drizzleDb", async () => {
      const { drizzleDb } = await import("../index");
      expect(drizzleDb).toBeDefined();
    });
  });

  describe("resetDrizzleMock", () => {
    it("should export resetDrizzleMock function", async () => {
      const { resetDrizzleMock } = await import("../index");
      expect(resetDrizzleMock).toBeDefined();
      expect(typeof resetDrizzleMock).toBe("function");
    });
  });
});
