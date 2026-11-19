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
//
// 用**共享单例**而不是每次 new 一个：测试需要在 createClient 之后拿到同一个 client
// 去断言/改行为（例如让 putFileContents 抛 403）。
const webdavClientMock = vi.hoisted(() => ({
  getDirectoryContents: vi.fn(),
  putFileContents: vi.fn(),
  exists: vi.fn(),
  createDirectory: vi.fn(),
  deleteFile: vi.fn(),
}));

vi.mock("webdav", () => ({
  createClient: vi.fn(() => webdavClientMock),
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

  beforeEach(() => {
    webdavClientMock.getDirectoryContents.mockResolvedValue([]);
    webdavClientMock.putFileContents.mockResolvedValue(true);
    webdavClientMock.exists.mockResolvedValue(true);
    webdavClientMock.createDirectory.mockResolvedValue(true);
    webdavClientMock.deleteFile.mockResolvedValue(true);
  });

  it("连接测试会真的写一个探针文件并删掉（只读账号要在这一步暴露）", async () => {
    const config = {
      enabled: true,
      url: "http://dav.com",
      user: "user",
      pass: "pass",
      remotePath: "/backups",
      retentionDays: 30,
      passwordStatus: "ok" as const,
    };

    const result = await BackupService.testConnection(config);
    expect(result.ok).toBe(true);
    expect(createClient).toHaveBeenCalledWith(config.url, expect.anything());

    expect(webdavClientMock.putFileContents).toHaveBeenCalledTimes(1);
    expect(webdavClientMock.deleteFile).toHaveBeenCalledTimes(1);
  });

  it("写探针文件失败时返回 ok=false 与可读原因（而不是笼统的 false）", async () => {
    webdavClientMock.putFileContents.mockRejectedValueOnce(
      Object.assign(new Error("Invalid response: 403 Forbidden"), {
        status: 403,
      }),
    );

    const result = await BackupService.testConnection({
      enabled: true,
      url: "http://dav.com",
      user: "user",
      pass: "pass",
      remotePath: "/backups",
      retentionDays: 30,
      passwordStatus: "ok",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("403");
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
