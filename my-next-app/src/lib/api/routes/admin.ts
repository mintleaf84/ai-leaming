import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import db, { closeDb, reinitDb } from '@/lib/db'
import { requireRole } from '@/lib/auth/auth'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { logAdminAction } from '@/lib/admin/audit'
import { getApiCallStats } from '@/lib/api-stats-service'

export const adminRoute = new OpenAPIHono()

// --- Helper Functions ---

function getDemoModeStatus(): boolean {
    try {
        const row = db.prepare("SELECT value FROM system_settings WHERE key = 'demo_mode_enabled'").get() as { value: string } | undefined;
        return row?.value === 'true';
    } catch {
        return false;
    }
}

function escapeCsv(field: any): string {
    if (field === null || field === undefined) return '';
    const str = String(field);
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

// --- Routes ---

/** GET /api/admin/system - 系统状态 */
const systemStatusDef = createRoute({
    method: 'get',
    path: '/system',
    summary: '获取系统运行状态',
    responses: {
        200: { description: '成功返回系统信息' },
        401: { description: '未授权' }
    }
})

adminRoute.openapi(systemStatusDef, async (c) => {
    try { await requireRole(['admin']); } catch { return c.json({ error: 'Unauthorized' }, 401); }

    const dbPath = path.resolve(process.cwd(), 'data', 'ai-learning.db');
    let dbSize = 0;
    try { dbSize = fs.statSync(dbPath).size; } catch { }

    const pkgPath = path.resolve(process.cwd(), 'package.json');
    let appVersion = 'v1.0.0';
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.version) appVersion = `v${pkg.version}`;
    } catch { }

    return c.json({
        os: {
            platform: os.platform(),
            release: os.release(),
            uptime: os.uptime(),
            loadavg: os.loadavg(),
            cpus: os.cpus().length,
            memory: { total: os.totalmem(), free: os.freemem() }
        },
        db: { size: dbSize, walSize: 0 },
        process: { uptime: process.uptime(), memory: process.memoryUsage(), version: process.version },
        ai: getApiCallStats(),
        demoMode: getDemoModeStatus(),
        appVersion,
        timestamp: Date.now()
    });
})

/** POST /api/admin/system - 演示模式控制 */
const systemActionDef = createRoute({
    method: 'post',
    path: '/system',
    summary: '执行系统管理操作（如演示模式开关）',
    responses: {
        200: { description: '操作成功' },
        400: { description: '无效操作' },
        401: { description: '未授权' }
    }
})

adminRoute.openapi(systemActionDef, async (c) => {
    try { await requireRole(['admin']); } catch { return c.json({ error: 'Unauthorized' }, 401); }
    const { action } = await c.req.json();

    try {
        db.exec(`CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    } catch { }

    if (action === 'toggle_demo_mode') {
        const current = getDemoModeStatus();
        const newValue = !current;
        db.prepare(`INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('demo_mode_enabled', ?, datetime('now'))`).run(String(newValue));
        return c.json({ success: true, demoMode: newValue });
    }

    if (action === 'reset_demo_session') {
        try { db.prepare("ALTER TABLE practice_sessions ADD COLUMN is_demo INTEGER DEFAULT 0").run(); } catch { }
        const demoSessions = db.prepare('SELECT id FROM practice_sessions WHERE is_demo = 1').all() as { id: string }[];
        for (const s of demoSessions) {
            db.prepare('DELETE FROM practice_logs WHERE session_id = ?').run(s.id);
        }
        db.prepare('DELETE FROM practice_sessions WHERE is_demo = 1').run();
        return c.json({ success: true, message: '演示数据集已重置' });
    }

    return c.json({ error: '无效的操作' }, 400);
})

/** GET /api/admin/backup - 备份下载 */
const backupDef = createRoute({
    method: 'get',
    path: '/backup',
    summary: '下载数据库备份',
    responses: {
        200: { description: '成功返回数据库二进制文件' },
        401: { description: '未授权' },
        500: { description: '备份失败' }
    }
})

adminRoute.openapi(backupDef, async (c) => {
    let user;
    try {
        user = await requireRole(['admin']);
    } catch {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `ai-learning-backup-${timestamp}.db`;
    const tempDir = path.resolve(process.cwd(), 'temp_backups');
    const tempPath = path.resolve(tempDir, filename);

    try {
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        db.prepare(`VACUUM INTO ?`).run(tempPath);
        logAdminAction(user.id, user.username, 'BACKUP_DATABASE', 'system', 'database', { filename });
        const fileBuffer = fs.readFileSync(tempPath);
        fs.unlinkSync(tempPath);

        return c.body(fileBuffer, 200, {
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Type': 'application/x-sqlite3',
        });
    } catch (error) {
        if (fs.existsSync(tempPath)) try { fs.unlinkSync(tempPath); } catch { }
        return c.json({ error: 'Backup failed' }, 500);
    }
})

/** POST /api/admin/restore - 数据库还原 */
const restoreDef = createRoute({
    method: 'post',
    path: '/restore',
    summary: '上传并还原数据库',
    responses: {
        200: { description: '还原成功' },
        400: { description: '无效文件' },
        401: { description: '未授权' },
        500: { description: '还原失败' }
    }
})

adminRoute.openapi(restoreDef, async (c) => {
    let user;
    try {
        user = await requireRole(['admin']);
    } catch {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    try {
        const body = await c.req.parseBody();
        const file = body['file'] as File;
        if (!file) return c.json({ error: 'No file uploaded' }, 400);

        const dbPath = path.resolve(process.cwd(), 'data', 'ai-learning.db');
        const backupPath = path.resolve(process.cwd(), 'data', `ai-learning.db.bak-${Date.now()}`);
        const tempPath = path.resolve(process.cwd(), 'data', 'temp_restore.db');

        const buffer = Buffer.from(await file.arrayBuffer());
        if (!buffer.subarray(0, 16).toString().startsWith('SQLite format 3')) {
            return c.json({ error: '无效的 SQLite 数据库文件' }, 400);
        }

        fs.writeFileSync(tempPath, buffer);
        closeDb();

        try {
            if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, backupPath);
            if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
            fs.renameSync(tempPath, dbPath);
            reinitDb();
            logAdminAction(user.id, user.username, 'RESTORE_DATABASE', 'system', 'database', {
                filename: file.name,
                backupCreated: path.basename(backupPath)
            });
            return c.json({ success: true, backupCreated: path.basename(backupPath) });
        } catch (e: any) {
            try { if (fs.existsSync(backupPath) && !fs.existsSync(dbPath)) fs.copyFileSync(backupPath, dbPath); } catch { }
            try { reinitDb(); } catch { }
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            return c.json({ error: 'Restore failed: ' + e.message }, 500);
        }
    } catch (error: any) {
        try { reinitDb(); } catch { }
        return c.json({ error: 'Restore failed: ' + error.message }, 500);
    }
})

// --- Questions Export (Existing) ---

const ExportQuestionsQuerySchema = z.object({
    search: z.string().optional(),
    tag: z.string().optional(),
    dimension: z.string().optional(),
})

const exportQuestionsDef = createRoute({
    method: 'get',
    path: '/export/questions',
    summary: '导出题库为CSV',
    request: { query: ExportQuestionsQuerySchema },
    responses: {
        200: { content: { 'text/csv': { schema: z.string() } }, description: 'CSV 文件数据' },
        401: { description: '未授权' }
    }
})

adminRoute.openapi(exportQuestionsDef, async (c) => {
    try {
        await requireRole(['admin']);
    } catch {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    const { search, tag, dimension } = c.req.valid('query')
    const conditions: string[] = []
    const params: any[] = []

    if (search) { conditions.push('content LIKE ?'); params.push(`%${search}%`); }
    if (tag) { 
        conditions.push('EXISTS (SELECT 1 FROM json_each(questions.tags) WHERE value = ?)'); 
        params.push(tag); 
    }
    if (dimension) { conditions.push('dimension = ?'); params.push(dimension); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const questions = db.prepare(`SELECT * FROM questions ${whereClause} ORDER BY id DESC`).all(...params) as any[];

    const headers = ['ID', '类型', '维度', '题干', '选项', '答案', '解析', '标签', '正确率(%)', '创建时间'];
    let csvContent = '\uFEFF' + headers.map(escapeCsv).join(',') + '\n';

    for (const q of questions) {
        const row = [q.id, q.type, q.dimension, q.content, q.options, q.answer, q.explanation, q.tags, q.correct_ratio, q.created_at];
        csvContent += row.map(escapeCsv).join(',') + '\n';
    }

    const fileName = `questions_export_${new Date().toISOString().split('T')[0]}.csv`;
    return c.text(csvContent, 200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
    });
})
