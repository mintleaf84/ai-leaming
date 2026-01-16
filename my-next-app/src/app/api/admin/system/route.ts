import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/auth';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { getApiCallStats } from '@/lib/api-stats-service';

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
        timestamp: Date.now()
    });
}
