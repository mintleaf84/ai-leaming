import { describe, it, expect } from 'vitest';
import { TEST_SCHEMA_SQL, createTestTables } from '../test-schema-utils';
import Database from 'better-sqlite3';

describe('test-schema-utils', () => {
  describe('TEST_SCHEMA_SQL', () => {
    it('should contain users table definition', () => {
      expect(TEST_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS users');
      expect(TEST_SCHEMA_SQL).toContain('username TEXT UNIQUE NOT NULL');
      expect(TEST_SCHEMA_SQL).toContain('password_hash TEXT NOT NULL');
      expect(TEST_SCHEMA_SQL).toContain('role TEXT');
    });

    it('should contain questions table definition', () => {
      expect(TEST_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS questions');
      expect(TEST_SCHEMA_SQL).toContain('content TEXT NOT NULL');
      expect(TEST_SCHEMA_SQL).toContain('options TEXT');
      expect(TEST_SCHEMA_SQL).toContain('answer TEXT');
      expect(TEST_SCHEMA_SQL).toContain('tags TEXT');
    });

    it('should contain practice_sessions table definition', () => {
      expect(TEST_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS practice_sessions');
      expect(TEST_SCHEMA_SQL).toContain('session_name TEXT');
      expect(TEST_SCHEMA_SQL).toContain('total_questions INTEGER');
      expect(TEST_SCHEMA_SQL).toContain('correct_count INTEGER');
      expect(TEST_SCHEMA_SQL).toContain('practice_mode TEXT');
      expect(TEST_SCHEMA_SQL).toContain('is_demo INTEGER');
    });

    it('should contain practice_logs table definition', () => {
      expect(TEST_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS practice_logs');
      expect(TEST_SCHEMA_SQL).toContain('session_id TEXT');
      expect(TEST_SCHEMA_SQL).toContain('question_id INTEGER NOT NULL');
      expect(TEST_SCHEMA_SQL).toContain('user_answer TEXT');
      expect(TEST_SCHEMA_SQL).toContain('is_correct INTEGER NOT NULL');
      expect(TEST_SCHEMA_SQL).toContain('duration_ms INTEGER');
    });

    it('should contain user_mastery table definition', () => {
      expect(TEST_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS user_mastery');
      expect(TEST_SCHEMA_SQL).toContain('tag_name TEXT NOT NULL');
      expect(TEST_SCHEMA_SQL).toContain('score REAL');
      expect(TEST_SCHEMA_SQL).toContain('correct_count INTEGER');
      expect(TEST_SCHEMA_SQL).toContain('total_count INTEGER');
      expect(TEST_SCHEMA_SQL).toContain('history TEXT');
    });

    it('should contain observation_zone table definition', () => {
      expect(TEST_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS observation_zone');
      expect(TEST_SCHEMA_SQL).toContain('reason TEXT');
      expect(TEST_SCHEMA_SQL).toContain('status TEXT');
      expect(TEST_SCHEMA_SQL).toContain('entered_at TEXT');
    });

    it('should contain question_srs table definition', () => {
      expect(TEST_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS question_srs');
      expect(TEST_SCHEMA_SQL).toContain('stability REAL');
      expect(TEST_SCHEMA_SQL).toContain('difficulty REAL');
      expect(TEST_SCHEMA_SQL).toContain('elapsed_days INTEGER');
      expect(TEST_SCHEMA_SQL).toContain('scheduled_days INTEGER');
      expect(TEST_SCHEMA_SQL).toContain('reps INTEGER');
      expect(TEST_SCHEMA_SQL).toContain('lapses INTEGER');
      expect(TEST_SCHEMA_SQL).toContain('state INTEGER');
      expect(TEST_SCHEMA_SQL).toContain('due_date TEXT');
    });

    it('should contain system_settings table definition', () => {
      expect(TEST_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS system_settings');
      expect(TEST_SCHEMA_SQL).toContain('key TEXT NOT NULL');
      expect(TEST_SCHEMA_SQL).toContain('value TEXT');
    });

    it('should contain api_keys table definition', () => {
      expect(TEST_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS api_keys');
      expect(TEST_SCHEMA_SQL).toContain('key_string TEXT UNIQUE NOT NULL');
      expect(TEST_SCHEMA_SQL).toContain('description TEXT');
      expect(TEST_SCHEMA_SQL).toContain('is_active INTEGER');
    });

    it('should contain session_reviews table definition', () => {
      expect(TEST_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS session_reviews');
      expect(TEST_SCHEMA_SQL).toContain('review_data TEXT');
    });

    it('should define primary keys correctly', () => {
      expect(TEST_SCHEMA_SQL).toContain('PRIMARY KEY');
      expect(TEST_SCHEMA_SQL).toContain('AUTOINCREMENT');
    });

    it('should define foreign key references correctly', () => {
      expect(TEST_SCHEMA_SQL).toContain('REFERENCES');
    });
  });

  describe('createTestTables', () => {
    it('should create tables in memory database', () => {
      const db = new Database(':memory:');

      expect(() => createTestTables(db)).not.toThrow();

      // Verify tables were created
      const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
      const tableNames = result.map(r => r.name);

      expect(tableNames).toContain('users');
      expect(tableNames).toContain('questions');
      expect(tableNames).toContain('practice_sessions');
      expect(tableNames).toContain('practice_logs');
      expect(tableNames).toContain('user_mastery');
      expect(tableNames).toContain('observation_zone');
      expect(tableNames).toContain('question_srs');
      expect(tableNames).toContain('system_settings');
      expect(tableNames).toContain('api_keys');
      expect(tableNames).toContain('session_reviews');

      db.close();
    });
  });
});