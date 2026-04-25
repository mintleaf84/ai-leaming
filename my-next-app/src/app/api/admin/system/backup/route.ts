import { NextResponse } from 'next/server';
import { BackupService } from '@/lib/services/backup-service';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const config = await BackupService.getConfig();
        // 不要返回密码给前端，即使是加密后的
        const { pass, ...safeConfig } = config;
        return NextResponse.json(safeConfig);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        if (!body.pass) {
            delete body.pass; // 防止空字符串覆盖已保存的密码
        }
        await BackupService.saveConfig(body);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// 手动触发备份
export async function PUT() {
    try {
        const fileName = await BackupService.performBackup();
        return NextResponse.json({ success: true, fileName });
    } catch (error: any) {
        console.error('[API] Backup failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// 测试连接
export async function PATCH(req: Request) {
    try {
        const body = await req.json();
        const config = await BackupService.getConfig();
        if (!body.pass) {
            delete body.pass; // 如果前端传空字符串，则使用 config 中现有的解密密码
        }
        // 合并当前输入的配置用于测试
        const testConfig = { ...config, ...body };
        const success = await BackupService.testConnection(testConfig);
        return NextResponse.json({ success });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message });
    }
}
