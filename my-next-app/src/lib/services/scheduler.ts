import cron, { ScheduledTask } from 'node-cron';
import { BackupService } from './backup-service';

let backupTask: ScheduledTask | null = null;

/**
 * 初始化后台调度任务
 */
export async function initScheduler() {
    console.log('⏰ [Scheduler] 正在初始化后台任务...');

    // 1. 数据库备份任务 (每天凌晨 3:00 执行)
    // 语法: 分 时 日 月 周
    if (backupTask) {
        backupTask.stop();
    }

    backupTask = cron.schedule('0 3 * * *', async () => {
        try {
            const config = await BackupService.getConfig();
            
            if (!config.enabled) {
                console.log('📦 [Scheduler] 自动备份已禁用，跳过本次任务');
                return;
            }

            console.log('📦 [Scheduler] 开始执行每日自动备份...');
            const fileName = await BackupService.performBackup();
            console.log(`✅ [Scheduler] 自动备份成功: ${fileName}`);
        } catch (error) {
            console.error('❌ [Scheduler] 自动备份执行失败:', error);
        }
    });

    console.log('✅ [Scheduler] 任务调度器已就绪 (每日 03:00 备份)');
}
