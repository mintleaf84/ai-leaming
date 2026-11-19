import { createClient, WebDAVClient } from "webdav";
import dayjs from "dayjs";
import { drizzleDb, getSetting, setSetting } from "@/lib/db";
import { sql } from "drizzle-orm";
import { encrypt, decrypt } from "@/lib/utils/encryption";
import fs from "fs/promises";
import { createReadStream, createWriteStream } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { createGzip } from "zlib";
import { pipeline } from "stream";
import { promisify } from "util";
import { env } from "@/env";
import { log } from "@/lib/logger";
import { AppError } from "@/lib/errors/app-error";

const pipelineAsync = promisify(pipeline);

const SETTING_KEYS = {
  ENABLED: "backup_enabled",
  URL: "backup_webdav_url",
  USER: "backup_webdav_user",
  PASS: "backup_webdav_pass", // 加密存储
  PATH: "backup_webdav_path",
  RETENTION: "backup_retention_days",
};

/**
 * 构建期（`next build` 收集页面数据时会把本模块加载一遍）不要求生产密钥：
 * 镜像构建只带占位值，真正的密钥在运行时注入。
 */
const IS_BUILD_PHASE =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.SKIP_ENV_VALIDATION === "1";

const CONFIGURED_SECRET = env.BACKUP_ENCRYPTION_KEY;

/** 仅在开发/测试（或构建期）使用的兜底密钥；生产缺密钥时**不允许**静默回落到它。 */
const DEV_FALLBACK_SECRET = "ai-learning-backup-secret-key-32-chars";

/**
 * 服务端没有配置 `BACKUP_ENCRYPTION_KEY`。
 *
 * 以前这个错误是在**模块顶层**直接 throw 的，后果是 `scheduler.ts`（静态 import）
 * 整条链失败 → `initScheduler` 不执行 → 每日自动备份与过期导入任务清理都静默消失，
 * 而且只有 instrumentation 的一行日志。现在改为"使用备份功能时才报错"。
 */
export class BackupSecretMissingError extends AppError {
  constructor() {
    super(
      "business",
      "备份功能未启用：服务端未配置 BACKUP_ENCRYPTION_KEY（无法加解密 WebDAV 密码）",
      { code: "backup.secret.missing" },
    );
    this.name = "BackupSecretMissingError";
  }
}

/** 已保存的密文解不开：通常是部署密钥变了（换机器/重装时重新生成过）。 */
export class BackupPasswordUndecryptableError extends AppError {
  constructor() {
    super(
      "business",
      "已保存的 WebDAV 密码无法解密：服务端备份密钥与保存时不一致，请在页面上重新填写密码",
      { code: "backup.password.undecryptable" },
    );
    this.name = "BackupPasswordUndecryptableError";
  }
}

/** 密码状态（非敏感），让管理页能区分"没设置"与"解不开"。 */
export type BackupPasswordStatus =
  "unset" | "ok" | "secret-missing" | "undecryptable";

export interface BackupConfig {
  enabled: boolean;
  url: string;
  user: string;
  pass: string;
  remotePath: string;
  retentionDays: number;
  passwordStatus: BackupPasswordStatus;
}

export interface BackupTestResult {
  ok: boolean;
  message?: string;
}

/**
 * 取用于加解密的密钥。
 *
 * 生产环境缺密钥时**抛错而不是回落内置值**：内置值是公开的字符串，
 * 用它加密的 WebDAV 密码等于明文。
 */
function resolveSecret(): string {
  if (CONFIGURED_SECRET) return CONFIGURED_SECRET;
  if (process.env.NODE_ENV === "production" && !IS_BUILD_PHASE) {
    throw new BackupSecretMissingError();
  }
  return DEV_FALLBACK_SECRET;
}

if (!CONFIGURED_SECRET) {
  // 只告警，不阻断模块加载 —— 具体功能在被调用时才报错（见 resolveSecret）
  log.warn(
    "[Backup] BACKUP_ENCRYPTION_KEY 未设置：生产环境请配置，否则 WebDAV 备份不可用" +
      "（start.sh 会自动生成并持久化到 data/.env.production）",
  );
}

/** 逐级创建远端目录（`/a/b` → MKCOL /a、/a/b） */
async function ensureRemotePath(client: WebDAVClient, remotePath: string) {
  const segments = remotePath.split("/").filter((segment) => segment);
  let current = "";
  for (const segment of segments) {
    current += `/${segment}`;
    if (!(await client.exists(current))) {
      await client.createDirectory(current);
    }
  }
}

export class BackupService {
  /**
   * 获取备份配置
   *
   * `passwordStatus` 让调用方区分三种"没有密码"：根本没设置、密钥缺失、密文解不开。
   * 以前三者都表现为 `pass: ""`，管理页只能说"配置不完整"，排查全靠猜。
   */
  static async getConfig(): Promise<BackupConfig> {
    const url = (await getSetting(SETTING_KEYS.URL)) || "";
    const user = (await getSetting(SETTING_KEYS.USER)) || "";
    const encryptedPass = (await getSetting(SETTING_KEYS.PASS)) || "";
    const remotePath = (await getSetting(SETTING_KEYS.PATH)) || "/backups";
    const enabled = (await getSetting(SETTING_KEYS.ENABLED)) === "true";
    const retentionDays = parseInt(
      (await getSetting(SETTING_KEYS.RETENTION)) || "365",
      10,
    );

    let pass = "";
    let passwordStatus: BackupPasswordStatus = "unset";

    if (encryptedPass) {
      try {
        pass = decrypt(encryptedPass, resolveSecret());
        passwordStatus = "ok";
      } catch (error) {
        // audit-allow: 显式降级——解不开就标记 passwordStatus，让管理页/备份流程给出
        //   "密钥缺失"或"密码无法解密"的可读结论；此处已记结构化日志，不向上抛
        const secretMissing = error instanceof BackupSecretMissingError;
        passwordStatus = secretMissing ? "secret-missing" : "undecryptable";
        log.error(
          { reason: passwordStatus },
          "[Backup] 无法解密已保存的 WebDAV 密码",
        );
      }
    }

    return {
      enabled,
      url,
      user,
      pass,
      remotePath,
      retentionDays,
      passwordStatus,
    };
  }

  /**
   * 保存备份配置
   */
  static async saveConfig(config: Partial<BackupConfig>) {
    if (config.url !== undefined)
      await setSetting(SETTING_KEYS.URL, config.url);
    if (config.user !== undefined)
      await setSetting(SETTING_KEYS.USER, config.user);
    if (config.pass !== undefined && config.pass !== "") {
      // 空字符串表示"不修改密码"（管理页始终不回显密码），不能覆盖成空密文
      const encrypted = encrypt(config.pass, resolveSecret());
      await setSetting(SETTING_KEYS.PASS, encrypted);
    }
    if (config.remotePath !== undefined)
      await setSetting(SETTING_KEYS.PATH, config.remotePath);
    if (config.enabled !== undefined)
      await setSetting(SETTING_KEYS.ENABLED, config.enabled ? "true" : "false");
    if (config.retentionDays !== undefined)
      await setSetting(SETTING_KEYS.RETENTION, config.retentionDays.toString());
  }

  /**
   * 测试 WebDAV 连接。
   *
   * 不再只列根目录：那只验证了"能读"。实际备份需要**建目录 + 写文件 + 删文件**，
   * 只读账号/配额满/目录不可写都会在"测试成功"之后才失败。这里在配置的
   * `remotePath` 里写一个临时文件再删掉，把三类权限一次性验证。
   */
  static async testConnection(config: BackupConfig): Promise<BackupTestResult> {
    const client = createClient(config.url, {
      username: config.user,
      password: config.pass,
    });

    try {
      await client.getDirectoryContents("/");
    } catch (error) {
      log.error("[Backup] 连接测试失败（读取根目录）:", error);
      return { ok: false, message: `读取根目录失败：${describeError(error)}` };
    }

    try {
      await ensureRemotePath(client, config.remotePath);
    } catch (error) {
      log.error("[Backup] 连接测试失败（创建目录）:", error);
      return {
        ok: false,
        message: `在 ${config.remotePath} 创建目录失败：${describeError(error)}`,
      };
    }

    const probePath = `${config.remotePath.replace(/\/+$/, "")}/.ai-learning-write-test-${Date.now()}`;
    try {
      await client.putFileContents(
        probePath,
        `probe ${randomBytes(4).toString("hex")}`,
        {
          overwrite: true,
        },
      );
      await client.deleteFile(probePath);
      return { ok: true };
    } catch (error) {
      log.error("[Backup] 连接测试失败（写入/删除探针文件）:", error);
      return {
        ok: false,
        message: `写入 ${config.remotePath} 失败（只读账号或配额已满？）：${describeError(error)}`,
      };
    }
  }

  /**
   * 执行备份流程
   */
  static async performBackup(): Promise<string> {
    const config = await this.getConfig();

    // 三类"没有密码"给出各自的处理建议，而不是统一的"配置不完整"
    if (config.passwordStatus === "secret-missing") {
      throw new BackupSecretMissingError();
    }
    if (config.passwordStatus === "undecryptable") {
      throw new BackupPasswordUndecryptableError();
    }
    if (!config.url || !config.user || !config.pass) {
      throw new Error("Backup configuration is incomplete");
    }

    const timestamp = dayjs().format("YYYY-MM-DD-HH-mm-ss");
    const dbName = process.env.DB_FILENAME || "ai-learning.db";
    const tempDir = path.resolve(process.cwd(), "data", "temp_backups");
    const backupPath = path.join(tempDir, `${dbName}.${timestamp}.bak`);
    const zipPath = `${backupPath}.gz`;

    try {
      // 1. 创建临时目录
      await fs.mkdir(tempDir, { recursive: true });

      // 2. SQLite 备份 (VACUUM INTO)：在线快照，不需要停写
      log.info(`[Backup] Creating database snapshot: ${backupPath}`);
      await drizzleDb.run(
        sql.raw(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`),
      );

      // 3. 压缩
      log.info(`[Backup] Compressing backup: ${zipPath}`);
      await pipelineAsync(
        createReadStream(backupPath),
        createGzip(),
        createWriteStream(zipPath),
      );

      // 4. 上传到 WebDAV
      const client = createClient(config.url, {
        username: config.user,
        password: config.pass,
      });

      await ensureRemotePath(client, config.remotePath);

      const remoteFileName = `${dbName}.${timestamp}.gz`;
      const remoteFullTarget = path
        .join(config.remotePath, remoteFileName)
        .replace(/\\/g, "/");

      // 流式上传：以前把整份 gz 读进内存（`fs.readFile`），库大了会把容器撑爆。
      // contentLength 必须显式给：部分 WebDAV 服务端不接受 chunked 上传。
      const { size } = await fs.stat(zipPath);
      log.info(
        `[Backup] Uploading to WebDAV: ${remoteFullTarget} (${size} bytes)`,
      );
      await client.putFileContents(
        remoteFullTarget,
        createReadStream(zipPath),
        {
          contentLength: size,
          overwrite: true,
        },
      );

      // 5. 清理历史备份（失败不影响本次备份，但必须在日志里说清原因）
      await this.rotateBackups(client, config);

      return remoteFileName;
    } finally {
      // 清理本地临时文件
      try {
        if (await fs.stat(backupPath).catch(() => null))
          await fs.unlink(backupPath);
        if (await fs.stat(zipPath).catch(() => null)) await fs.unlink(zipPath);
      } catch (e) {
        // audit-allow: finally 中不得用 return 打断（会覆盖 try 的返回值），清理失败仅记录后继续
        log.warn("[Backup] Failed to cleanup temp files", e);
      }
    }
  }

  /**
   * 清理过期备份 (Retention Policy)
   */
  private static async rotateBackups(
    client: WebDAVClient,
    config: BackupConfig,
  ) {
    try {
      log.info(
        `[Backup] Checking for old backups (retention: ${config.retentionDays} days)`,
      );
      const items = (await client.getDirectoryContents(
        config.remotePath,
      )) as Array<{ type: string; lastmod: string; filename: string }>;
      const now = dayjs();

      let deleted = 0;
      for (const item of items) {
        if (item.type !== "file" || !item.lastmod) continue;

        const lastModDate = dayjs(item.lastmod);
        if (now.diff(lastModDate, "day") > config.retentionDays) {
          log.info(`[Backup] Deleting old backup: ${item.filename}`);
          await client.deleteFile(item.filename);
          deleted += 1;
        }
      }
      log.info(
        `[Backup] Rotation done: scanned=${items.length} deleted=${deleted}`,
      );
    } catch (error) {
      // audit-allow: 显式降级——轮转失败不影响本次备份结果（上传已成功），
      //   但把"哪一步失败"写清楚，否则用户只看到"备份成功"、远端堆满旧文件
      log.warn(
        { err: describeError(error), remotePath: config.remotePath },
        "[Backup] Rotation failed（本次备份已成功，但旧备份未被清理）",
      );
    }
  }
}

/** 把任意异常压成一行可读信息（WebDAV 客户端的错误对象层级很深） */
function describeError(error: unknown): string {
  if (error instanceof Error) {
    const withStatus = error as Error & { status?: number };
    return withStatus.status
      ? `${error.message} (HTTP ${withStatus.status})`
      : error.message;
  }
  return String(error);
}
