
import { describe, it, expect } from 'vitest';
import { SOCRATIC_TUTOR_PROMPT } from '../prompts';
import { buildEnhancedSystemPrompt } from '@/lib/services/chat-rag';

// Mock chat-rag service partially if needed, but for now we might integrate test it or mock it
// Since buildEnhancedSystemPrompt likely imports DEFAULT_CHAT_SYSTEM_PROMPT from prompts.ts,
// we want to test if we can switch prompts.
// But first, let's verify prompts.ts exports what we need.

describe('Socratic Tutor Mode', () => {
    it('should export SOCRATIC_TUTOR_PROMPT', () => {
        expect(SOCRATIC_TUTOR_PROMPT).toBeDefined();
        expect(typeof SOCRATIC_TUTOR_PROMPT).toBe('string');
        expect(SOCRATIC_TUTOR_PROMPT).toContain('苏格拉底');
    });

    it('should contain key socratic principles', () => {
        const p = SOCRATIC_TUTOR_PROMPT;
        expect(p).toContain('拒绝直接回答');
        expect(p).toContain('循循善诱');
        expect(p).toContain('纠正与反问');
    });

    // We anticipate modifying buildEnhancedSystemPrompt or a similar function to accept a 'mode'
    it('should return socratic prompt when mode is socratic', () => {
        // @ts-expect-error - we haven't updated the signature yet, so TS will complain, but this is TDD
        const prompt = buildEnhancedSystemPrompt(undefined, 'socratic');
        expect(prompt).toContain('苏格拉底');
        expect(prompt).not.toContain('资深的教师招聘考试辅导专家'); // Should not have default system prompt content if possible, or mixed is fine but main persona should change
    });

    it('should return default prompt when mode is standard or undefined', () => {
        // @ts-expect-error - testing invalid mode input
        const prompt = buildEnhancedSystemPrompt(undefined, 'standard');
        expect(prompt).toContain('资深的教师招聘考试辅导专家');
        expect(prompt).not.toContain('苏格拉底');
    });
});
