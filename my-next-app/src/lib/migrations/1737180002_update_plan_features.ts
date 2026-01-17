export async function up(db: any) {
    console.log('Migrating: Updating plan features with new AI descriptions...');

    const updates: Record<string, string[]> = {
        'free': ['每日 10 次 AI 对话', '每日 30 道练习题', '每日 5 次 AI 助记', '每日 3 次 第一性原理', '基础知识库访问'],
        'basic': ['每日 100 次 AI 对话', '无限练习题目', '每日 50 次 AI 助记', '每日 30 次 第一性原理', '每日 50 次 AI 复盘', '优先客服支持'],
        'pro': ['无限 AI 对话', '无限练习题目', '无限 AI 助记 & 第一性原理', '无限 AI 复盘', '全部高级功能', '专属客服']
    };

    for (const [id, features] of Object.entries(updates)) {
        try {
            db.prepare('UPDATE subscription_plans SET features = ? WHERE id = ?')
                .run(JSON.stringify(features), id);
            console.log(`Updated plan ${id} features.`);
        } catch (e) {
            console.error(`Failed to update plan ${id}:`, e);
        }
    }
}
