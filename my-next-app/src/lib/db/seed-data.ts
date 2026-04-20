import Database from 'better-sqlite3';
import { getSetting } from './utils';

/**
 * 插入示例数据
 */
export function seedData(db: Database.Database) {
    console.log('[DB] Seeding data...');

    migrateAIConfig(db);
    initializeRoutes(db);
    initializeSubscriptionPlans(db);
    initializeUserSubscriptions(db);

    console.log('[DB] Seeding completed');
}

function migrateAIConfig(db: Database.Database) {
    try {
        const configCount = db.prepare('SELECT COUNT(*) as count FROM ai_configs').get() as { count: number };
        if (configCount.count === 0) {
            const apiKey = getSetting(db, 'ai_api_key');
            const apiUrl = getSetting(db, 'ai_api_url');
            if (apiKey || apiUrl) {
                db.prepare(`
          INSERT INTO ai_configs (name, api_url, api_key, model_economy, model_premium, model_embedding, embedding_dimensions, model_rerank, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).run(
                    'Default Config',
                    apiUrl || 'https://api.openai.com/v1',
                    apiKey || '',
                    getSetting(db, 'ai_model_economy') || 'gpt-4o-mini',
                    getSetting(db, 'ai_model_premium') || 'gpt-4o',
                    'text-embedding-3-small',
                    768,
                    ''
                );
                console.log('[DB Seed] Created "Default Config" from system_settings');
            }
        }
    } catch { /* ignore */ }
}

function initializeRoutes(db: Database.Database) {
    try {
        const routeCount = db.prepare('SELECT COUNT(*) as count FROM ai_model_routes').get() as { count: number };
        if (routeCount.count === 0) {
            const activeConfig = db.prepare('SELECT * FROM ai_configs WHERE is_active = 1').get() as unknown;
            if (activeConfig) {
                console.log('[DB Seed] Initializing ai_model_routes...');
                const insertRoute = db.prepare('INSERT INTO ai_model_routes (feature, config_id, model_name) VALUES (?, ?, ?)');
                const features = [
                    { key: 'economy', model: activeConfig.model_economy },
                    { key: 'premium', model: activeConfig.model_premium },
                    { key: 'embedding', model: activeConfig.model_embedding },
                    { key: 'rerank', model: activeConfig.model_rerank },
                    { key: 'knowledge', model: activeConfig.model_knowledge }
                ];
                features.forEach(f => {
                    if (f.model) insertRoute.run(f.key, activeConfig.id, f.model);
                });
            }
        }
    } catch { /* ignore */ }
}

function initializeSubscriptionPlans(db: Database.Database) {
    try {
        const planCount = db.prepare('SELECT COUNT(*) as count FROM subscription_plans').get() as { count: number };
        if (planCount.count === 0) {
            console.log('[DB Seed] Initializing subscription plans...');
            const insertPlan = db.prepare(`
        INSERT INTO subscription_plans (id, name, tier, price_monthly, limits, features, is_active, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
            insertPlan.run('free', '免费版', 'free', 0,
                JSON.stringify({ ai_chat: 10, practice: 30, review: 5, rag: 20 }),
                JSON.stringify(['每日 10 次 AI 对话', '每日 30 道练习题', '基础知识库访问']), 1, 1);
            insertPlan.run('basic', '基础版', 'basic', 2900,
                JSON.stringify({ ai_chat: 100, practice: -1, review: 50, rag: 100 }),
                JSON.stringify(['每日 100 次 AI 对话', '无限练习题目', '每日 50 次 AI 复盘']), 1, 2);
            insertPlan.run('pro', '专业版', 'pro', 9900,
                JSON.stringify({ ai_chat: -1, practice: -1, review: -1, rag: -1 }),
                JSON.stringify(['无限 AI 对话', '无限练习题目', '无限 AI 复盘', 'VIP 客服支持']), 1, 3);
        }
    } catch { /* ignore */ }
}

/**
 * 为现有用户创建默认订阅（免费版）
 */
function initializeUserSubscriptions(db: Database.Database) {
    try {
        db.exec(`
            INSERT OR IGNORE INTO user_subscriptions (user_id, plan_id, status)
            SELECT id, 'free', 'active' FROM users 
            WHERE id NOT IN (SELECT user_id FROM user_subscriptions)
        `);
    } catch { /* ignore */ }
}

