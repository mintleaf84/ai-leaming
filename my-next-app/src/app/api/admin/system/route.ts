import { NextResponse, NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/auth';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { getApiCallStats } from '@/lib/api-stats-service';
import db from '@/lib/db';

export async function GET() {
    try {
        await requireRole(['admin']);
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // DB Size
    const dbPath = path.resolve(process.cwd(), 'data', 'ai-learning.db');
    let dbSize = 0;
    try {
        const stats = fs.statSync(dbPath);
        dbSize = stats.size;
    } catch {
        // ignore
    }

    // App Version
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    let appVersion = 'v1.0.0';
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.version) appVersion = `v${pkg.version}`;
    } catch { }

    return NextResponse.json({
        os: {
            platform: os.platform(),
            release: os.release(),
            uptime: os.uptime(),
            loadavg: os.loadavg(),
            cpus: os.cpus().length,
            memory: {
                total: os.totalmem(),
                free: os.freemem(),
            }
        },
        db: {
            size: dbSize,
            walSize: 0
        },
        process: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: process.version
        },
        ai: getApiCallStats(),
        demoMode: getDemoModeStatus(),
        appVersion: appVersion,
        timestamp: Date.now()
    });
}

/** 获取演示模式状态 */
function getDemoModeStatus(): boolean {
    try {
        const row = db.prepare("SELECT value FROM system_settings WHERE key = 'demo_mode_enabled'").get() as { value: string } | undefined;
        return row?.value === 'true';
    } catch {
        return false;
    }
}

/** POST: 演示模式控制 */
export async function POST(request: NextRequest) {
    try {
        await requireRole(['admin']);
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    // 确保 system_settings 表存在
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    } catch { }

    if (action === 'toggle_demo_mode') {
        const current = getDemoModeStatus();
        const newValue = !current;
        db.prepare(`INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('demo_mode_enabled', ?, datetime('now'))`).run(String(newValue));
        console.log(`[Admin] 演示模式已${newValue ? '开启' : '关闭'}`);
        return NextResponse.json({ success: true, demoMode: newValue });
    }

    if (action === 'reset_demo_session') {
        // 确保 is_demo 列存在
        try { db.prepare("ALTER TABLE practice_sessions ADD COLUMN is_demo INTEGER DEFAULT 0").run(); } catch { }
        // 清理所有演示会话的答题记录
        const demoSessions = db.prepare('SELECT id FROM practice_sessions WHERE is_demo = 1').all() as { id: string }[];
        for (const s of demoSessions) {
            db.prepare('DELETE FROM practice_logs WHERE session_id = ?').run(s.id);
        }
        // 删除演示会话记录
        db.prepare('DELETE FROM practice_sessions WHERE is_demo = 1').run();
        console.log('[Admin] 演示数据集已重置');
        return NextResponse.json({ success: true, message: '演示数据集已重置，下次进入练习时将重新生成' });
    }

    return NextResponse.json({ error: '无效的操作' }, { status: 400 });
}
