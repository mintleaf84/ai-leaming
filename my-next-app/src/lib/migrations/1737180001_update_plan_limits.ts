export async function up(db: unknown) {
    console.log('Migrating: Updating plan limits with new AI features...');

    const updates: Record<string, { mnemonic: number; first_principles: number }> = {
        'free': { mnemonic: 5, first_principles: 3 },
        'basic': { mnemonic: 50, first_principles: 30 },
        'pro': { mnemonic: -1, first_principles: -1 }
    };

    const plans = db.prepare('SELECT id, limits FROM subscription_plans').all() as unknown[];

    for (const plan of plans) {
        if (!updates[plan.id]) continue;

        try {
            const limits = JSON.parse(plan.limits);
            const newLimits = {
                ...limits,
                mnemonic: updates[plan.id].mnemonic,
                first_principles: updates[plan.id].first_principles
            };

            db.prepare('UPDATE subscription_plans SET limits = ? WHERE id = ?')
                .run(JSON.stringify(newLimits), plan.id);

            console.log(`Updated plan ${plan.id} with new limits.`);
        } catch (e) {
            console.error(`Failed to update plan ${plan.id}:`, e);
        }
    }
}
