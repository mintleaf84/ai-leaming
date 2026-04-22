import Database from 'better-sqlite3';
import { addColumnIfNotExists } from '../db/utils';

/**
 * 迁移：为练习会话表添加 questions_json, practice_mode, is_demo 字段
 * 以及添加 AI 深度分析报告字段
 */
export async function up(db: Database.Database) {
    console.log('  -> Adding columns to practice_sessions...');
    
    // 1. 添加 questions_json (存储完整题目快照)
    addColumnIfNotExists(db, 'practice_sessions', 'questions_json', 'TEXT');
    
    // 2. 添加 practice_mode (练习模式：focus, random 等)
    addColumnIfNotExists(db, 'practice_sessions', 'practice_mode', 'TEXT');
    
    // 3. 添加 is_demo (标识是否为演示模式)
    addColumnIfNotExists(db, 'practice_sessions', 'is_demo', 'INTEGER DEFAULT 0');

    // 4. 添加 analysis_report (AI 深度分析报告)
    addColumnIfNotExists(db, 'practice_sessions', 'analysis_report', 'TEXT');

    console.log('  ✅ practice_sessions columns updated.');
}
