import { NextResponse } from "next/server";
import { BackupService } from "@/lib/services/backup-service";
import { requireRole } from "@/lib/auth/auth";
import { log, logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole(["admin"]);
    const config = await BackupService.getConfig();
    const { pass: _pass, ...safeConfig } = config;
    return NextResponse.json(safeConfig);
  } catch (error: unknown) {
    logger.error({ err: error }, "[API] 读取备份配置失败");
    const status =
      error instanceof Error &&
      (error.message.includes("Unauthorized") ||
        error.message.includes("Forbidden"))
        ? 401
        : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status },
    );
  }
}

export async function POST(req: Request) {
  try {
    await requireRole(["admin"]);
    const body = await req.json();
    if (!body.pass) {
      delete body.pass;
    }
    await BackupService.saveConfig(body);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    logger.error({ err: error }, "[API] 保存备份配置失败");
    const status =
      error instanceof Error &&
      (error.message.includes("Unauthorized") ||
        error.message.includes("Forbidden"))
        ? 401
        : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status },
    );
  }
}

export async function PUT() {
  try {
    await requireRole(["admin"]);
    const fileName = await BackupService.performBackup();
    return NextResponse.json({ success: true, fileName });
  } catch (error: unknown) {
    const status =
      error instanceof Error &&
      (error.message.includes("Unauthorized") ||
        error.message.includes("Forbidden"))
        ? 401
        : 500;
    log.error("[API] Backup failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    await requireRole(["admin"]);
    const body = await req.json();
    const config = await BackupService.getConfig();
    if (!body.pass) {
      delete body.pass;
    }
    const testConfig = { ...config, ...body };
    const success = await BackupService.testConnection(testConfig);
    return NextResponse.json({ success });
  } catch (error: unknown) {
    logger.error({ err: error }, "[API] 备份连接测试失败");
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
