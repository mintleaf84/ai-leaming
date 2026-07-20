import { drizzleDb } from "./index";
import { getSetting } from "./utils-drizzle";
import { sql } from "drizzle-orm";

/**
 * 插入示例数据 (Drizzle 版本)
 */
export async function seedData() {
  console.log("[DB] Seeding data via Drizzle...");

  await migrateAIConfig();
  await initializeRoutes();
  await initializeSubscriptionPlans();
  await initializeUserSubscriptions();
  await ensureAdminUser();

  console.log("[DB] Seeding completed");
}

async function ensureAdminUser() {
  try {
    await drizzleDb.run(sql`UPDATE users SET role = 'admin' WHERE id = 1`);
    console.log("[DB Seed] Ensured user 1 is admin");
  } catch {
    /* ignore */
  }
}

async function migrateAIConfig() {
  try {
    const result = await drizzleDb.all<Record<string, unknown>>(
      sql`SELECT COUNT(*) as count FROM ai_configs`,
    );
    const configCount = result[0]?.count as number;

    if (configCount === 0) {
      const apiKey = await getSetting("ai_api_key");
      const apiUrl = await getSetting("ai_api_url");
      if (apiKey || apiUrl) {
        await drizzleDb.run(sql`
          INSERT INTO ai_configs (name, api_url, api_key, model_economy, model_premium, model_embedding, embedding_dimensions, model_rerank, is_active)
          VALUES ('Default Config', ${apiUrl || "https://api.openai.com/v1"}, ${apiKey || ""}, ${(await getSetting("ai_model_economy")) || "gpt-4o-mini"}, ${(await getSetting("ai_model_premium")) || "gpt-4o"}, 'text-embedding-3-small', 768, '', 1)
        `);
        console.log('[DB Seed] Created "Default Config" from system_settings');
      }
    }
  } catch {
    /* ignore */
  }
}

async function initializeRoutes() {
  try {
    const result = await drizzleDb.all<Record<string, unknown>>(
      sql`SELECT COUNT(*) as count FROM ai_model_routes`,
    );
    const routeCount = result[0]?.count as number;

    if (routeCount === 0) {
      const activeConfig = await drizzleDb.all<Record<string, unknown>>(
        sql`SELECT * FROM ai_configs WHERE is_active = 1 LIMIT 1`,
      );
      const config = activeConfig[0];
      if (config) {
        console.log("[DB Seed] Initializing ai_model_routes...");
        const features = [
          { key: "economy", model: config.model_economy },
          { key: "premium", model: config.model_premium },
          { key: "embedding", model: config.model_embedding },
          { key: "rerank", model: config.model_rerank },
          { key: "knowledge", model: config.model_knowledge },
        ];
        for (const f of features) {
          if (f.model) {
            await drizzleDb.run(
              sql`INSERT INTO ai_model_routes (feature, config_id, model_name) VALUES (${f.key}, ${config.id}, ${f.model})`,
            );
          }
        }
      }
    }
  } catch {
    /* ignore */
  }
}

async function initializeSubscriptionPlans() {
  try {
    const result = await drizzleDb.all<Record<string, unknown>>(
      sql`SELECT COUNT(*) as count FROM subscription_plans`,
    );
    const planCount = result[0]?.count as number;

    if (planCount === 0) {
      console.log("[DB Seed] Initializing subscription plans...");
      const plans = [
        {
          id: "free",
          name: "免费版",
          tier: "free",
          price: 0,
          limits: { ai_chat: 10, practice: 30, review: 5, rag: 20 },
          features: [
            "每日 10 次 AI 对话",
            "每日 30 道练习题",
            "基础知识库访问",
          ],
          sort: 1,
        },
        {
          id: "basic",
          name: "基础版",
          tier: "basic",
          price: 2900,
          limits: { ai_chat: 100, practice: -1, review: 50, rag: 100 },
          features: [
            "每日 100 次 AI 对话",
            "无限练习题目",
            "每日 50 次 AI 复盘",
          ],
          sort: 2,
        },
        {
          id: "pro",
          name: "专业版",
          tier: "pro",
          price: 9900,
          limits: { ai_chat: -1, practice: -1, review: -1, rag: -1 },
          features: [
            "无限 AI 对话",
            "无限练习题目",
            "无限 AI 复盘",
            "VIP 客服支持",
          ],
          sort: 3,
        },
      ];

      for (const p of plans) {
        await drizzleDb.run(sql`
                    INSERT INTO subscription_plans (id, name, tier, price_monthly, limits, features, is_active, sort_order)
                    VALUES (${p.id}, ${p.name}, ${p.tier}, ${p.price}, ${JSON.stringify(p.limits)}, ${JSON.stringify(p.features)}, 1, ${p.sort})
                `);
      }
    }
  } catch {
    /* ignore */
  }
}

async function initializeUserSubscriptions() {
  try {
    await drizzleDb.run(sql`
            INSERT OR IGNORE INTO user_subscriptions (user_id, plan_id, status)
            SELECT id, 'free', 'active' FROM users 
            WHERE id NOT IN (SELECT user_id FROM user_subscriptions)
        `);
  } catch {
    /* ignore */
  }
}
