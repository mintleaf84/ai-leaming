import { NextResponse } from 'next/server';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { requireRole } from '@/lib/auth/auth';
import { logAdminAction } from '@/lib/admin/audit';

export const dynamic = 'force-dynamic';

export async function GET() {
    const user = await requireRole(['admin']);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `ai-learning-backup-${timestamp}.db`;
    const tempDir = path.resolve(process.cwd(), 'temp_backups');
    const tempPath = path.resolve(tempDir, filename);

    try {
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        console.log(`[Backup] Starting backup to ${tempPath}`);

        // 使用 SQLite VACUUM INTO 生成一致性快照
        // 这不需要停止服务，SQLite 会处理锁
        db.prepare(`VACUUM INTO ?`).run(tempPath);

        // 记录日志
        logAdminAction(user.id, user.username, 'BACKUP_DATABASE', 'system', 'database', { filename });

        const fileBuffer = fs.readFileSync(tempPath);

        // 读取后立即删除临时文件
        fs.unlinkSync(tempPath);

        return new NextResponse(fileBuffer, {
            headers: {
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Type': 'application/x-sqlite3',
            },
        });
    } catch (error) {
        console.error('[Backup] Failed:', error);
        // 尝试清理
        if (fs.existsSync(tempPath)) {
            try { fs.unlinkSync(tempPath); } catch { }
        }
        return NextResponse.json({ error: 'Backup failed' }, { status: 500 });
    }
}
