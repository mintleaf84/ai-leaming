import { describe, it, expect, vi, beforeEach } from "vitest";
import { BackupService } from "../backup-service";
import { Readable, Writable } from "stream";
import { createClient } from "webdav";

// Mock fs & fs/promises
vi.mock("fs", () => {
  const mockedReads = vi.fn(
    () =>
      new Readable({
        read() {
          this.push(null);
        },
      }),
  );
  const mockedWrites = vi.fn(
    () =>
      new Writable({
        write(chunk, enc, cb) {
          cb();
        },
      }),
  );
  return {
    createReadStream: mockedReads,
    createWriteStream: mockedWrites,
    default: {
      createReadStream: mockedReads,
      createWriteStream: mockedWrites,
    },
  };
});

vi.mock("fs/promises", () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(Buffer.from("dummy")),
    unlink: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ size: 100 }),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from("dummy")),
  unlink: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ size: 100 }),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// Mock WebDAV (避免真实的网路请求)
vi.mock("webdav", () => ({
  createClient: vi.fn(() => ({
    getDirectoryContents: vi.fn().mockResolvedValue([]),
    putFileContents: vi.fn().mockResolvedValue(true),
    exists: vi.fn().mockResolvedValue(true),
    createDirectory: vi.fn().mockResolvedValue(true),
    deleteFile: vi.fn().mockResolvedValue(true),
  })),
}));

// Mock Encryption (避免处理真实的加密二进制)
vi.mock("@/lib/utils/encryption", () => ({
  encrypt: vi.fn((text) => `encrypted-${text}`),
  decrypt: vi.fn((data) => data.replace("encrypted-", "")),
}));

// Mock pipeline
vi.mock("util", async (importOriginal) => {
  const original: any = await importOriginal();
  const mockedPromisify = (fn: any) => {
    if (fn && (fn.name === "pipeline" || fn.toString().includes("pipeline"))) {
      return vi.fn().mockResolvedValue(true);
    }
    return original.promisify(fn);
  };
  return {
    ...original,
    promisify: mockedPromisify,
    default: {
      ...original.default,
      promisify: mockedPromisify,
    },
  };
});

// Mock DB
const { mockGet, mockAll } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockAll: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const drizzleMock: any = {
    select: vi.fn(() => {
      const chain: any = new Proxy(() => {}, {
        get: (_, prop) => {
          if (prop === "all")
            return vi.fn().mockImplementation(() => Promise.resolve(mockAll()));
          if (prop === "get")
            return vi.fn().mockImplementation(() => Promise.resolve(mockGet()));
          if (prop === "then")
            return (resolve: any) => resolve(mockAll() || []);
          return chain;
        },
        apply: () => chain,
      });
      return chain;
    }),
    run: vi.fn().mockResolvedValue({ changes: 1 }),
    backup: vi.fn().mockResolvedValue(true),
  };

  return {
    default: drizzleMock,
    db: drizzleMock,
    drizzleDb: drizzleMock,
    getSetting: vi.fn(),
    setSetting: vi.fn(),
  };
});

describe("BackupService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should get config correctly with decryption", async () => {
    const { getSetting } = await import("@/lib/db");
    (getSetting as any).mockImplementation((key: string) => {
      if (key === "backup_webdav_url") return "http://dav.com";
      if (key === "backup_webdav_user") return "user1";
      return null;
    });

    const config = await BackupService.getConfig();
    expect(config.url).toBe("http://dav.com");
    expect(config.user).toBe("user1");
  });

  it("should test connection successfully", async () => {
    const config = {
      enabled: true,
      url: "http://dav.com",
      user: "user",
      pass: "pass",
      remotePath: "/backups",
      retentionDays: 30,
    };

    const success = await BackupService.testConnection(config);
    expect(success).toBe(true);
    expect(createClient).toHaveBeenCalledWith(config.url, expect.anything());
  });

  it("should perform backup correctly", async () => {
    // Setup config mock
    const { getSetting } = await import("@/lib/db");
    (getSetting as any).mockImplementation((key: string) => {
      if (key === "backup_webdav_url") return "http://dav.com";
      if (key === "backup_webdav_user") return "user";
      if (key === "backup_webdav_pass") return "encrypted-pass";
      if (key === "backup_webdav_path") return "/backups";
      return null;
    });

    // 执行备份
    const fileName = await BackupService.performBackup();

    expect(fileName).toContain(".gz");

    const dbModule = await import("@/lib/db");
    expect(dbModule.drizzleDb.run).toHaveBeenCalled();
  });
});
