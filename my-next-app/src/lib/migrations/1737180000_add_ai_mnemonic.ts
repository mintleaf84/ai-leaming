import db from '../db';

export function up() {
    console.log('Running migration: add_ai_mnemonic_to_questions');
    try {
        db.prepare('ALTER TABLE questions ADD COLUMN ai_mnemonic TEXT').run();
        console.log('Migration completed successfully');
    } catch (error: any) {
        if (error.message.includes('duplicate column name')) {
            console.log('Column ai_mnemonic already exists, skipping');
        } else {
            console.error('Migration failed:', error);
            throw error;
        }
    }
}
