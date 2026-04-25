import { createClient, WebDAVClient } from 'webdav';
import db, { getSetting, setSetting } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/utils/encryption';
import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import path from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream';
import { promisify } from 'util';

const pipelineAsync = promisify(pipeline);

const SETTING_KEYS = {
    ENABLED: 'backup_enabled',
    URL: 'backup_webdav_url',
    USER: 'backup_webdav_user',
    PASS: 'backup_webdav_pass', // 加密存储
    PATH: 'backup_webdav_path',
    RETENTION: 'backup_retention_days',
};

const BACKUP_SECRET = process.env.BACKUP_ENCRYPTION_KEY;

if (!BACKUP_SECRET) {
    console.warn('⚠️ [备份系统] 未检测到 BACKUP_ENCRYPTION_KEY 环境变量！');
    console.warn('   当前正使用不安全的默认密钥加密 WebDAV 凭据。');
    console.warn('   请务必在 .env 文件中设置该变量，以确保您的存储账号安全。');
}

const SECRET = BACKUP_SECRET || 'ai-learning-backup-secret-key-32-chars';

export interface BackupConfig {
    enabled: boolean;
    url: string;
    user: string;
    pass: string;
    remotePath: string;
    retentionDays: number;
}

export class BackupService {
    /**
     * 获取备份配置
     */
    static async getConfig(): Promise<BackupConfig> {
        const url = getSetting(db, SETTING_KEYS.URL) || '';
        const user = getSetting(db, SETTING_KEYS.USER) || '';
        const encryptedPass = getSetting(db, SETTING_KEYS.PASS) || '';
        const remotePath = getSetting(db, SETTING_KEYS.PATH) || '/backups';
        const enabled = getSetting(db, SETTING_KEYS.ENABLED) === 'true';
        const retentionDays = parseInt(getSetting(db, SETTING_KEYS.RETENTION) || '365', 10);

        let pass = '';
        if (encryptedPass) {
            try {
                pass = decrypt(encryptedPass, SECRET);
            } catch (e) {
                console.error('[Backup] Failed to decrypt password');
            }
        }

        return { enabled, url, user, pass, remotePath, retentionDays };
    }

    /**
     * 保存备份配置
     */
    static async saveConfig(config: Partial<BackupConfig>) {
        if (config.url !== undefined) setSetting(db, SETTING_KEYS.URL, config.url);
        if (config.user !== undefined) setSetting(db, SETTING_KEYS.USER, config.user);
        if (config.pass !== undefined) {
            const encrypted = encrypt(config.pass, SECRET);
            setSetting(db, SETTING_KEYS.PASS, encrypted);
        }
        if (config.remotePath !== undefined) setSetting(db, SETTING_KEYS.PATH, config.remotePath);
        if (config.enabled !== undefined) setSetting(db, SETTING_KEYS.ENABLED, config.enabled ? 'true' : 'false');
        if (config.retentionDays !== undefined) setSetting(db, SETTING_KEYS.RETENTION, config.retentionDays.toString());
    }

    /**
     * 测试 WebDAV 连接
     */
    static async testConnection(config: BackupConfig): Promise<boolean> {
        try {
            const client = createClient(config.url, {
                username: config.user,
                password: config.pass,
            });
            await client.getDirectoryContents('/');
            return true;
        } catch (error) {
            console.error('[Backup] Connection test failed:', error);
            return false;
        }
    }

    /**
     * 执行备份流程
     */
    static async performBackup(): Promise<string> {
        const config = await this.getConfig();
        if (!config.url || !config.user || !config.pass) {
            throw new Error('Backup configuration is incomplete');
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const dbName = process.env.DB_FILENAME || 'ai-learning.db';
        const tempDir = path.resolve(process.cwd(), 'data', 'temp_backups');
        const backupPath = path.join(tempDir, `${dbName}.${timestamp}.bak`);
        const zipPath = `${backupPath}.gz`;

        try {
            // 1. 创建临时目录
            await fs.mkdir(tempDir, { recursive: true });

            // 2. SQLite 备份 (VACUUM INTO)
            console.log(`[Backup] Creating database snapshot: ${backupPath}`);
            // 使用 better-sqlite3 的 backup 方法
            await db.backup(backupPath);

            // 3. 压缩
            console.log(`[Backup] Compressing backup: ${zipPath}`);
            await pipelineAsync(
                createReadStream(backupPath),
                createGzip(),
                createWriteStream(zipPath)
            );

            // 4. 上传到 WebDAV
            const client = createClient(config.url, {
                username: config.user,
                password: config.pass,
            });

            // 确保目录存在
            const paths = config.remotePath.split('/').filter(p => p);
            let currentPath = '';
            for (const p of paths) {
                currentPath += `/${p}`;
                if (!(await client.exists(currentPath))) {
                    await client.createDirectory(currentPath);
                }
            }

            const remoteFileName = `${dbName}.${timestamp}.gz`;
            const remoteFullTarget = path.join(config.remotePath, remoteFileName).replace(/\\/g, '/');
            
            console.log(`[Backup] Uploading to WebDAV: ${remoteFullTarget}`);
            const backupBuffer = await fs.readFile(zipPath);
            await client.putFileContents(remoteFullTarget, backupBuffer);

            // 5. 清理历史备份
            await this.rotateBackups(client, config);

            return remoteFileName;
        } finally {
            // 清理本地临时文件
            try {
                if (await fs.stat(backupPath).catch(() => null)) await fs.unlink(backupPath);
                if (await fs.stat(zipPath).catch(() => null)) await fs.unlink(zipPath);
            } catch (e) {
                console.warn('[Backup] Failed to cleanup temp files', e);
            }
        }
    }

    /**
     * 清理过期备份 (Retention Policy)
     */
    private static async rotateBackups(client: WebDAVClient, config: BackupConfig) {
        try {
            console.log(`[Backup] Checking for old backups (retention: ${config.retentionDays} days)`);
            const items = await client.getDirectoryContents(config.remotePath) as any[];
            const now = new Date();
            const threshold = config.retentionDays * 24 * 60 * 60 * 1000;

            for (const item of items) {
                if (item.type !== 'file' || !item.lastmod) continue;
                
                const lastModDate = new Date(item.lastmod);
                if (now.getTime() - lastModDate.getTime() > threshold) {
                    console.log(`[Backup] Deleting old backup: ${item.filename}`);
                    await client.deleteFile(item.filename);
                }
            }
        } catch (error) {
            console.error('[Backup] Rotation failed:', error);
        }
    }
}
