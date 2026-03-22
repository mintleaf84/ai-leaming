// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { masteryService } from '../mastery';

// Mock DB
const { mockDb } = vi.hoisted(() => {
    return {
        mockDb: {
            prepare: vi.fn(),
        }
    };
});

vi.mock('@/lib/db', () => ({ default: mockDb }));

describe('Mastery Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('updateMastery', () => {
        it('should calculate new score correctly on correct answer', () => {
            const mockRun = vi.fn();
            mockDb.prepare.mockReturnValue({
                get: vi.fn().mockReturnValue({ score: 50, correct_count: 5, total_count: 10 }),
                run: mockRun
            });

            const result = masteryService.updateMastery(1, 'Tag1', 'knowledge', true);
            
            // New total = 11, New correct = 6. Score = (6/11)*100 approx 54.5454
            expect(result[0].newScore).toBeCloseTo(54.54, 1);
            expect(result[0].tagName).toBe('Tag1');

            // 验证数据库更新
            expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO user_mastery'));
            expect(mockRun).toHaveBeenCalledWith(
                1, 
                'Tag1', 
                expect.closeTo(54.54, 1), 
                6, 
                11
            );
        });

        it('should not increase correct_count if isMonitoredCorrect is true', () => {
            const mockRun = vi.fn();
            mockDb.prepare.mockReturnValue({
                get: vi.fn().mockReturnValue({ score: 50, correct_count: 5, total_count: 10 }),
                run: mockRun
            });

            const result = masteryService.updateMastery(1, 'Tag1', 'knowledge', true, true);
            
            // New total = 11, New correct = 5. Score = (5/11)*100 approx 45.4545
            expect(result[0].newScore).toBeCloseTo(45.45, 1);
            expect(mockRun).toHaveBeenCalledWith(
                1, 
                'Tag1', 
                expect.closeTo(45.45, 1), 
                5, 
                11
            );
        });
    });

    describe('getMasteryTree', () => {
        it('should build recursive tree from flat tags', () => {
            const mockRows = [
                { tag_name: 'CS', score: 80 },
                { tag_name: 'CS/Algorithms', score: 70 },
                { tag_name: 'CS/Algorithms/Sort', score: 90 },
                { tag_name: 'Math', score: 60 },
            ];

            mockDb.prepare.mockReturnValue({
                all: vi.fn().mockReturnValue(mockRows)
            });

            const tree = masteryService.getMasteryTree(1);

            expect(tree).toHaveLength(2); // CS and Math
            const csNode = tree.find(n => n.name === 'CS');
            expect(csNode?.children).toHaveLength(1);
            expect(csNode?.children[0].name).toBe('Algorithms');
            expect(csNode?.children[0].children[0].name).toBe('Sort');
        });

        it('should handle orphaned children as roots', () => {
            const mockRows = [
                { tag_name: 'A/B/C', score: 100 },
            ];
            mockDb.prepare.mockReturnValue({
                all: vi.fn().mockReturnValue(mockRows)
            });

            const tree = masteryService.getMasteryTree(1);
            expect(tree).toHaveLength(1);
            expect(tree[0].name).toBe('C');
        });
    });

    describe('getHierarchyMastery', () => {
        it('should return avg score for hierarchy', () => {
            mockDb.prepare.mockReturnValue({
                get: vi.fn().mockReturnValue({ avgScore: 75, count: 3 })
            });

            const result = masteryService.getHierarchyMastery(1, 'Tag1');
            expect(result.avgScore).toBe(75);
            expect(result.count).toBe(3);

            // 验证 SQL 参数传递
            expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('AVG(score)'));
            const lastCall = vi.mocked(mockDb.prepare).mock.results.at(-1)?.value;
            expect(lastCall.get).toHaveBeenCalledWith(1, 'Tag1', 'Tag1/%');
        });
    });
});
