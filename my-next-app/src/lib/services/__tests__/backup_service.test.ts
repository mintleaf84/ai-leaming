import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BackupService } from '../backup-service';
import { createClient } from 'webdav';
import fs from 'fs/promises';

// Mock WebDAV (避免真实的网路请求)
vi.mock('webdav', () => ({
    createClient: vi.fn(() => ({
        getDirectoryContents: vi.fn().mockResolvedValue([]),
        putFileContents: vi.fn().mockResolvedValue(true),
        exists: vi.fn().mockResolvedValue(true),
        createDirectory: vi.fn().mockResolvedValue(true),
        deleteFile: vi.fn().mockResolvedValue(true),
    }))
}));

// Mock Encryption (避免处理真实的加密二进制)
vi.mock('@/lib/utils/encryption', () => ({
    encrypt: vi.fn((text) => `encrypted-${text}`),
    decrypt: vi.fn((data) => data.replace('encrypted-', '')),
}));

// Mock DB
vi.mock('@/lib/db', () => ({
    __esModule: true,
    default: {
        // 关键点：我们不 Mock fs，而是在 mock 的 backup 方法中真实写入一个假文件。
        // 这样后续真实的 createReadStream 和 pipeline 就能找到文件并正常执行压缩，
        // 最后 BackupService 会在 finally 块中自动清理这些临时文件。
        backup: vi.fn(async (targetPath: string) => {
            await fs.writeFile(targetPath, 'dummy database content for testing');
            return true;
        }),
    },
    getSetting: vi.fn(),
    setSetting: vi.fn(),
}));

describe('BackupService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should get config correctly with decryption', async () => {
        const { getSetting } = await import('@/lib/db');
        (getSetting as any).mockImplementation((db: any, key: string) => {
            if (key === 'backup_webdav_url') return 'http://dav.com';
            if (key === 'backup_webdav_user') return 'user1';
            return null;
        });

        const config = await BackupService.getConfig();
        expect(config.url).toBe('http://dav.com');
        expect(config.user).toBe('user1');
    });

    it('should test connection successfully', async () => {
        const config = {
            enabled: true,
            url: 'http://dav.com',
            user: 'user',
            pass: 'pass',
            remotePath: '/backups',
            retentionDays: 30
        };

        const success = await BackupService.testConnection(config);
        expect(success).toBe(true);
        expect(createClient).toHaveBeenCalledWith(config.url, expect.anything());
    });

    it('should perform backup correctly', async () => {
        // Setup config mock
        const { getSetting } = await import('@/lib/db');
        (getSetting as any).mockImplementation((db: any, key: string) => {
            if (key === 'backup_webdav_url') return 'http://dav.com';
            if (key === 'backup_webdav_user') return 'user';
            if (key === 'backup_webdav_pass') return 'encrypted-pass';
            if (key === 'backup_webdav_path') return '/backups';
            return null;
        });

        // 执行备份 (这会触发真实的流压缩和本地临时文件的创建与销毁)
        const fileName = await BackupService.performBackup();
        
        expect(fileName).toContain('.gz');
        
        const dbModule = await import('@/lib/db');
        const db = dbModule.default;
        expect(db?.backup).toHaveBeenCalled();
    });
});
