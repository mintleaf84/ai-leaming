
import { drizzleDb, drizzleSchema } from '../src/lib/db';
import { sql } from 'drizzle-orm';

async function checkSettings() {
    try {
        const settings = await drizzleDb.select().from(drizzleSchema.system_settings).all();
        console.log('All settings:', JSON.stringify(settings, null, 2));
        
        const speedSettings = settings.filter(s => s.key.startsWith('reading_speed_'));
        console.log('Reading speed settings:', JSON.stringify(speedSettings, null, 2));
    } catch (err) {
        console.error('Error checking settings:', err);
    }
}

checkSettings();
