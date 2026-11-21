// @vitest-environment node
/**
 * 备份 / 恢复契约测试（真实 SQLite、真实加密、真实文件 IO；只 mock WebDAV 网络层）
 *
 * 为什么不能沿用 `backup_service.test.ts`：那份测试把 fs、webdav、加密、db 全 mock 了，
 * 能证明"函数被调用过"，不能证明"导出的文件里有数据""密码不是明文""恢复是全有或全无"。
 * 按 `docs/engineering.md` 规则 3，这三条都属于关键路径，必须有真实依赖的测试。
 *
 * 允许的 mock：
 *   - `webdav` 的 createClient：只有网络层。上传的字节被真实收下并落盘校验，
 *     所以"备份内容"这一语义没有被 mock 掉。
 *
 * 恢复侧不走 WebDAV（线上恢复入口是 `POST /api/admin/restore` 上传文件），
 * 这里用真路由 + 真文件系统；`process.cwd()` 指向临时目录，避免碰到仓库里的 data/。
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";

/**
 * 部署密钥必须在**读 env 的模块被 import 之前**固定。
 *
 * `backup-service` 在模块顶层就把 `env.BACKUP_ENCRYPTION_KEY` 读进常量 `SECRET`，
 * 之后（包括 beforeAll 里）再改 `process.env` 对它无效；未设置时它会退到内置默认密钥，
 * 而测试若用另一个值解密，`decrypt` 必然抛 "Failed to decrypt data" —— 环境变量
 * 有没有导出，就成了测试绿不绿的原因。`vi.hoisted` 的回调在本文件所有 import 之前执行，
 * 所以这里设的值就是服务后续读到的值；加密（服务内部）与解密（断言时显式传入）共用它。
 */
const BACKUP_KEY = vi.hoisted(() => {
  const key = "contract-test-backup-key";
  process.env.BACKUP_ENCRYPTION_KEY = key;
  return key;
});

const dbFile = `test-backup-restore-${process.pid}.db`;
process.env.DB_FILENAME = dbFile;

/** WebDAV 假服务器：只保存字节，不做任何网络 IO */
const remote = vi.hoisted(() => ({
  files: new Map<string, Buffer>(),
  dirs: new Set<string>(),
  listed: [] as Array<{ type: string; lastmod: string; filename: string }>,
}));

vi.mock("webdav", () => ({
  createClient: () => ({
    exists: async (p: string) => remote.dirs.has(p),
    createDirectory: async (p: string) => {
      remote.dirs.add(p);
      return true;
    },
    // 生产代码已改为**流式上传**（大库不再整份读进内存）：假服务器必须能收流
    putFileContents: async (
      p: string,
      data: string | Buffer | AsyncIterable<Buffer | string>,
    ) => {
      const chunks: Buffer[] = [];
      if (typeof data === "string") {
        chunks.push(Buffer.from(data));
      } else if (Buffer.isBuffer(data)) {
        chunks.push(data);
      } else {
        for await (const chunk of data) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
      }
      remote.files.set(p, Buffer.concat(chunks));
      return true;
    },
    getDirectoryContents: async () => remote.listed,
    deleteFile: async () => true,
  }),
}));

/** 请求侧 cookie（真 JWT，鉴权走真实现 + 真库） */
const authState = vi.hoisted(() => ({ token: null as string | null }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      if (name === "auth_token" && authState.token) {
        return { name, value: authState.token };
      }
      return undefined;
    },
    set: () => undefined,
    delete: () => undefined,
    getAll: () => [],
    has: () => Boolean(authState.token),
  }),
  headers: async () => new Map<string, string>(),
}));

type DbModule = typeof import("@/lib/db");
type BackupModule = typeof import("@/lib/services/backup-service");
type AdminRouteModule = typeof import("@/lib/api/routes/admin");

let dbm: DbModule;
let BackupService: BackupModule["BackupService"];
let adminRoute: AdminRouteModule["adminRoute"];
let decrypt: (typeof import("@/lib/utils/encryption"))["decrypt"];

const ADMIN_ID = 1;
const WEBDAV_PASS = "s3cr3t-webdav-password";

let tmpRoot = "";

function gunzipToFile(gz: Buffer, target: string) {
  fs.writeFileSync(target, zlib.gunzipSync(gz));
}

function query<T>(file: string, statement: string): T[] {
  const db = new Database(file, { readonly: true });
  try {
    return db.prepare(statement).all() as T[];
  } finally {
    db.close();
  }
}

/** 造一个「看起来像数据库」但缺表的 SQLite：只有一张无关表 */
function makeEmptySqlite(file: string) {
  const db = new Database(file);
  db.exec("CREATE TABLE not_our_app (x INTEGER)");
  db.prepare("INSERT INTO not_our_app (x) VALUES (1)").run();
  db.close();
}

async function postRestore(
  file: File,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const form = new FormData();
  form.append("file", file);
  const res = await adminRoute.request("/restore", {
    method: "POST",
    body: form,
  });
  return {
    status: res.status,
    body: (await res.json()) as Record<string, unknown>,
  };
}

function sqliteFile(name: string, source: Buffer | string): File {
  const buf = typeof source === "string" ? fs.readFileSync(source) : source;
  return new File([new Uint8Array(buf)], name, {
    type: "application/x-sqlite3",
  });
}

describe("备份 / 恢复契约（真库 + 真加密 + 真文件）", () => {
  beforeAll(async () => {
    dbm = await import("@/lib/db");
    await dbm.initDatabase();

    const semver = await import("@/lib/auth/auth");
    authState.token = await semver.encrypt({
      user: {
        id: ADMIN_ID,
        username: "backup-admin",
        role: "admin",
        token_version: 0,
      },
      expires: new Date(Date.now() + 3600_000),
    });
    await dbm.drizzleDb.run(
      sql`INSERT OR IGNORE INTO users (id, username, password_hash, role, token_version)
          VALUES (${ADMIN_ID}, 'backup-admin', 'x', 'admin', 0)`,
    );

    BackupService = (await import("@/lib/services/backup-service"))
      .BackupService;
    decrypt = (await import("@/lib/utils/encryption")).decrypt;
    adminRoute = (await import("@/lib/api/routes/admin")).adminRoute;

    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "backup-contract-"));

    // 备份配置是两个分组共用的前置条件：恢复分组的"要恢复的备份"也是现调
    // performBackup() 做出来的。必须放在外层 beforeAll —— 挂在导出分组的
    // beforeAll 上时，单独 `-t "上传合法备份"` 跑恢复用例会被过滤掉，
    // performBackup() 直接报 "Backup configuration is incomplete"。
    await BackupService.saveConfig({
      enabled: true,
      url: "https://dav.example.com/dav",
      user: "dav-user",
      pass: WEBDAV_PASS,
      remotePath: "/backups",
      retentionDays: 30,
    });
  });

  afterAll(async () => {
    dbm.closeDb();
    await dbm.closeDrizzle();
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(path.resolve(process.cwd(), "data", dbFile + suffix), {
        force: true,
      });
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  beforeEach(() => {
    remote.files.clear();
    remote.dirs.clear();
    remote.listed = [];
  });

  // ---------------- 导出 ----------------

  describe("导出（performBackup）", () => {
    beforeAll(async () => {
      // 配置已在外层 beforeAll 备好，这里只放"本组独有"的导出素材
      await dbm.drizzleDb.insert(dbm.drizzleSchema.questions).values({
        content: `备份标记题-${process.pid}`,
        options: JSON.stringify(["甲", "乙"]),
        answer: "A",
        explanation: "解析",
        tags: JSON.stringify(["备份"]),
        dimension: "knowledge",
        type: "single",
        external_id: `backup-marker-${process.pid}`,
      });
    });

    it("导出的备份是可解析的 SQLite 快照，且包含当前库里的数据", async () => {
      const name = await BackupService.performBackup();
      expect(name).toMatch(/\.gz$/);

      const uploaded = [...remote.files.entries()].find(([p]) =>
        p.endsWith(name),
      );
      expect(uploaded).toBeTruthy();
      const gz = uploaded![1];
      // gzip 头
      expect(gz[0]).toBe(0x1f);
      expect(gz[1]).toBe(0x8b);

      const snapshot = path.join(tmpRoot, "snapshot-a.db");
      gunzipToFile(gz, snapshot);

      expect(fs.readFileSync(snapshot).subarray(0, 15).toString()).toBe(
        "SQLite format 3",
      );

      const rows = query<{ content: string; tags: string }>(
        snapshot,
        `SELECT content, tags FROM questions WHERE content = '备份标记题-${process.pid}'`,
      );
      expect(rows).toHaveLength(1);
      expect(JSON.parse(rows[0].tags)).toEqual(["备份"]);

      // 预期表都在（缺表说明备份是半成品）
      const tables = query<{ name: string }>(
        snapshot,
        "SELECT name FROM sqlite_master WHERE type='table'",
      ).map((t) => t.name);
      for (const expected of [
        "users",
        "questions",
        "practice_logs",
        "system_settings",
      ]) {
        expect(tables).toContain(expected);
      }
    });

    it("凭据不进明文：备份里的 WebDAV 密码是密文，且能用部署密钥解回原值", async () => {
      const name = await BackupService.performBackup();
      const gz = [...remote.files.entries()].find(([p]) =>
        p.endsWith(name),
      )![1];
      const snapshot = path.join(tmpRoot, "snapshot-cred.db");
      gunzipToFile(gz, snapshot);

      const rows = query<{ key: string; value: string }>(
        snapshot,
        "SELECT key, value FROM system_settings WHERE key LIKE 'backup_webdav_%'",
      );
      const passRow = rows.find((r) => r.key === "backup_webdav_pass");
      expect(passRow).toBeTruthy();

      // 安全语义：明文不得出现（连字段值里也不能有）
      expect(passRow!.value).not.toContain(WEBDAV_PASS);
      expect(passRow!.value).not.toBe(WEBDAV_PASS);

      // 但必须是可逆的：用同一个部署密钥能解回来
      expect(decrypt(passRow!.value, BACKUP_KEY)).toBe(WEBDAV_PASS);

      // 其它非敏感配置照常明文（证明不是整表被搅乱）
      const urlRow = rows.find((r) => r.key === "backup_webdav_url");
      expect(urlRow!.value).toBe("https://dav.example.com/dav");
    });

    it("远程路径按 /backups 逐级创建，上传目标落在该目录下", async () => {
      const name = await BackupService.performBackup();
      expect(remote.dirs.has("/backups")).toBe(true);
      const key = [...remote.files.keys()].find((p) => p.endsWith(name))!;
      expect(key).toBe(`/backups/${name}`);
    });

    it("配置不完整时明确报错，不做半截备份", async () => {
      await BackupService.saveConfig({ pass: "" });
      // 空密码会被加密成密文（不是空串），因此这里直接改写为真实空配置
      await dbm.drizzleDb.run(
        sql`DELETE FROM system_settings WHERE key = 'backup_webdav_pass'`,
      );
      const filesBefore = remote.files.size;

      await expect(BackupService.performBackup()).rejects.toThrow(
        /configuration is incomplete/i,
      );
      expect(remote.files.size).toBe(filesBefore);

      // 复原配置，后续用例还要用
      await BackupService.saveConfig({ pass: WEBDAV_PASS });
    });
  });

  // ---------------- 恢复 ----------------

  describe("恢复（POST /api/admin/restore）", () => {
    let cwdSpy: ReturnType<typeof vi.spyOn>;
    let restoreCwd = "";
    let snapshotPath = "";

    beforeAll(async () => {
      // 先做一份真快照，作为"要恢复的备份"
      const name = await BackupService.performBackup();
      const gz = [...remote.files.entries()].find(([p]) =>
        p.endsWith(name),
      )![1];
      snapshotPath = path.join(tmpRoot, "restore-source.db");
      gunzipToFile(gz, snapshotPath);
    });

    beforeEach(() => {
      // 每个用例一个干净的"假工作目录"，绝不碰仓库里的 data/
      restoreCwd = fs.mkdtempSync(path.join(tmpRoot, "cwd-"));
      fs.mkdirSync(path.join(restoreCwd, "data"), { recursive: true });
      // 当前线上库（stand-in）：只有一张 old_live 表
      const live = new Database(path.join(restoreCwd, "data", dbFile));
      live.exec("CREATE TABLE old_live (x INTEGER)");
      live.prepare("INSERT INTO old_live (x) VALUES (42)").run();
      live.close();

      cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(restoreCwd);
    });

    afterEach(() => {
      cwdSpy.mockRestore();
    });

    it("上传合法备份 → 线上库被替换成快照内容，旧库留一份 .bak", async () => {
      const res = await postRestore(sqliteFile("backup.db", snapshotPath));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const livePath = path.join(restoreCwd, "data", dbFile);
      const tables = query<{ name: string }>(
        livePath,
        "SELECT name FROM sqlite_master WHERE type='table'",
      ).map((t) => t.name);
      expect(tables).toContain("questions");
      expect(tables).not.toContain("old_live");

      // 旧库被保住，可读、内容仍是替换前的
      const backups = fs
        .readdirSync(path.join(restoreCwd, "data"))
        .filter((f) => f.includes(".bak-"));
      expect(backups).toHaveLength(1);
      const kept = query<{ x: number }>(
        path.join(restoreCwd, "data", backups[0]),
        "SELECT x FROM old_live",
      );
      expect(kept[0].x).toBe(42);
    });

    it("不是 SQLite 的文件 → 400，线上库一个字节都不动", async () => {
      const livePath = path.join(restoreCwd, "data", dbFile);
      const before = fs.readFileSync(livePath);

      const res = await postRestore(
        sqliteFile("fake.db", Buffer.from("this is not a database at all")),
      );
      expect(res.status).toBe(400);
      expect(String(res.body.error)).toMatch(/无效的 SQLite/);
      expect(fs.readFileSync(livePath).equals(before)).toBe(true);
    });

    it("写入阶段失败 → 500，且线上库仍然可读、仍是替换前的内容（全有或全无）", async () => {
      const livePath = path.join(restoreCwd, "data", dbFile);
      // 让临时文件路径变成目录，迫使 fs.writeFileSync 失败
      fs.mkdirSync(path.join(restoreCwd, "data", "temp_restore.db"));

      const res = await postRestore(sqliteFile("backup.db", snapshotPath));
      expect(res.status).toBe(500);
      expect(String(res.body.error)).toMatch(/Restore failed/);

      // 用**内容**而不是字节比较：SQLite 被打开/关闭会改文件头与 WAL 元数据，
      // 字节不等不代表数据变了；"全有或全无"要断言的是数据仍然全是旧的
      const tables = query<{ name: string }>(
        livePath,
        "SELECT name FROM sqlite_master WHERE type='table'",
      ).map((t) => t.name);
      expect(tables).toContain("old_live");
      expect(tables).not.toContain("questions");
      const rows = query<{ x: number }>(livePath, "SELECT x FROM old_live");
      expect(rows[0].x).toBe(42);
    });

    it("没有文件字段 → 400", async () => {
      const res = await adminRoute.request("/restore", {
        method: "POST",
        body: new FormData(),
      });
      expect(res.status).toBe(400);
    });

    // ---- 已知缺陷 ----
    it("缺表的 SQLite（只有一张无关表）不被当成合法备份：400 且线上库不变", async () => {
      const bogus = path.join(tmpRoot, "bogus-empty.db");
      makeEmptySqlite(bogus);
      const res = await postRestore(sqliteFile("bogus.db", bogus));
      expect(res.status).toBe(400);
    });

    it("恢复目标跟随 DB_FILENAME（改库名的部署不会恢复错文件）", async () => {
      const res = await postRestore(sqliteFile("backup.db", snapshotPath));
      expect(res.status).toBe(200);

      // DB_FILENAME 指向的库应当就是被恢复的那一个
      const target = path.join(restoreCwd, "data", dbFile);
      const tables = fs.existsSync(target)
        ? query<{ name: string }>(
            target,
            "SELECT name FROM sqlite_master WHERE type='table'",
          ).map((t) => t.name)
        : [];
      // 恢复目标必须是 DB_FILENAME 指向的那个库，而不是硬编码的 data/ai-learning.db
      expect(tables).toContain("questions");
    });
  });
});
