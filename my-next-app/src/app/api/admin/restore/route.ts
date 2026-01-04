import { NextResponse } from 'next/server';
import { closeDb, reinitDb } from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { requireRole } from '@/lib/auth/auth';
import { logAdminAction } from '@/lib/admin/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    const user = await requireRole(['admin']);
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        console.log(`[Restore] Received file: ${file.name}, size: ${file.size}`);

        const dbPath = path.resolve(process.cwd(), 'ai-learning.db');
        const backupPath = path.resolve(process.cwd(), `ai-learning.db.bak-${Date.now()}`);
        const tempPath = path.resolve(process.cwd(), 'temp_restore.db');

        // 1. 保存上传文件到临时位置
        const buffer = Buffer.from(await file.arrayBuffer());

        // 2. 简单校验 SQLite 文件头
        const header = buffer.subarray(0, 16).toString();
        if (!header.startsWith('SQLite format 3')) {
            return NextResponse.json({ error: '无效的 SQLite 数据库文件' }, { status: 400 });
        }

        fs.writeFileSync(tempPath, buffer);

        // 3. 关闭数据库连接
        // 必须关闭，否则 Windows 无法重命名/删除文件
        closeDb();

        try {
            // 4. 备份当前数据库
            if (fs.existsSync(dbPath)) {
                console.log(`[Restore] Backing up current DB to ${backupPath}`);
                // 使用 copy 而不是 rename，为了更安全
                fs.copyFileSync(dbPath, backupPath);
            }

            // 5. 替换数据库文件
            // 先尝试删除旧文件（Windows 可能需要）
            if (fs.existsSync(dbPath)) {
                fs.unlinkSync(dbPath);
            }

            // 移动临时文件到正式位置
            fs.renameSync(tempPath, dbPath);
            console.log('[Restore] Database replaced successfully');

            // 6. 重新初始化连接
            reinitDb();

            // 7. 在新数据库中记录日志
            logAdminAction(user.id, user.username, 'RESTORE_DATABASE', 'system', 'database', {
                filename: file.name,
                backupCreated: path.basename(backupPath)
            });

            return NextResponse.json({ success: true, backupCreated: path.basename(backupPath) });
        } catch (e: any) {
            console.error('[Restore] Deployment failed:', e);

            // 尝试回滚
            try {
                if (fs.existsSync(backupPath) && !fs.existsSync(dbPath)) {
                    console.log('[Restore] Rolling back...');
                    fs.copyFileSync(backupPath, dbPath);
                }
            } catch (rollbackErr) {
                console.error('[Restore] Rollback failed:', rollbackErr);
            }

            // 无论如何尝试重新打开连接
            try { reinitDb(); } catch { }

            // 清理临时文件
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
            }

            return NextResponse.json({ error: 'Restore failed: ' + e.message }, { status: 500 });
        }
    } catch (error: any) {
        console.error('[Restore] API Error:', error);
        // 确保连接恢复
        try { reinitDb(); } catch { }
        return NextResponse.json({ error: 'Restore failed: ' + error.message }, { status: 500 });
    }
}
