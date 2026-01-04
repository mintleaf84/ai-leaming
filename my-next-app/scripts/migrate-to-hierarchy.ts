/**
 * 更新旧数据的知识点为层级路径格式
 */

import db from '../src/lib/db';
import { findKeypointPathByName } from '../src/lib/import/keypoint-tree';
import { masteryService } from '../src/lib/mastery-service';

async function migrateToHierarchy() {
    console.log('🔄 开始将知识点转换为层级路径格式...\n');

    // 1. 更新 questions 表的 tags
    console.log('1. 更新 questions 表...');
    const questions = db.prepare('SELECT id, tags FROM questions WHERE tags IS NOT NULL').all() as { id: number; tags: string }[];

    let updatedQuestions = 0;
    const updateQuestion = db.prepare('UPDATE questions SET tags = ? WHERE id = ?');

    for (const q of questions) {
        try {
            const oldTags = JSON.parse(q.tags) as string[];
            const newTags: string[] = [];

            for (const tag of oldTags) {
                // 如果已经是路径格式，跳过
                if (tag.includes('/')) {
                    newTags.push(tag);
                    continue;
                }

                // 查找完整路径
                const fullPath = findKeypointPathByName(tag);
                if (fullPath) {
                    // 添加各级路径
                    const parts = fullPath.split('/');
                    for (let i = 0; i < parts.length; i++) {
                        const partialPath = parts.slice(0, i + 1).join('/');
                        if (!newTags.includes(partialPath)) {
                            newTags.push(partialPath);
                        }
                    }
                } else {
                    // 匹配不到就保持原样
                    if (!newTags.includes(tag)) {
                        newTags.push(tag);
                    }
                }
            }

            // 更新
            if (JSON.stringify(newTags.sort()) !== JSON.stringify(oldTags.sort())) {
                updateQuestion.run(JSON.stringify(newTags), q.id);
                updatedQuestions++;
            }
        } catch (e) {
            console.warn(`   跳过题目 ${q.id}:`, e);
        }
    }

    console.log(`   ✅ 更新了 ${updatedQuestions}/${questions.length} 道题目\n`);

    // 2. 更新 user_mastery 表
    console.log('2. 更新 user_mastery 表...');
    const masteryRows = db.prepare('SELECT user_id, tag_name, score FROM user_mastery').all() as { user_id: number; tag_name: string; score: number }[];

    // 先清空
    db.exec('DELETE FROM user_mastery');

    // 重新插入转换后的数据
    const insertMastery = db.prepare(`
    INSERT INTO user_mastery (user_id, tag_name, score, last_updated)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, tag_name) DO UPDATE SET
      score = MAX(excluded.score, user_mastery.score),
      last_updated = CURRENT_TIMESTAMP
  `);

    let updatedMastery = 0;
    const newMasteryMap = new Map<string, number>(); // path -> score

    for (const row of masteryRows) {
        // 如果已经是路径格式
        if (row.tag_name.includes('/')) {
            const key = `${row.user_id}:${row.tag_name}`;
            newMasteryMap.set(key, Math.max(newMasteryMap.get(key) || 0, row.score));
            continue;
        }

        // 查找完整路径
        const fullPath = findKeypointPathByName(row.tag_name);
        if (fullPath) {
            // 添加各级路径的掌握度
            const parts = fullPath.split('/');
            for (let i = 0; i < parts.length; i++) {
                const partialPath = parts.slice(0, i + 1).join('/');
                const key = `${row.user_id}:${partialPath}`;
                // 使用最低层级（最细粒度）的分数
                if (i === parts.length - 1) {
                    newMasteryMap.set(key, row.score);
                } else {
                    // 父级取平均或保持已有值
                    if (!newMasteryMap.has(key)) {
                        newMasteryMap.set(key, row.score);
                    }
                }
            }
        } else {
            // 匹配不到就保持原样
            const key = `${row.user_id}:${row.tag_name}`;
            newMasteryMap.set(key, row.score);
        }
    }

    // 插入转换后的数据
    for (const [key, score] of newMasteryMap) {
        const [userId, tagName] = key.split(':');
        insertMastery.run(parseInt(userId), tagName, score);
        updatedMastery++;
    }

    console.log(`   ✅ 转换为 ${updatedMastery} 条层级掌握度记录\n`);

    // 3. 打印新的树形结构
    console.log('3. 新的掌握度树:');
    const tree = masteryService.getMasteryTree(1);

    function printTree(nodes: any[], indent: string = '') {
        for (const node of nodes.slice(0, 10)) { // 只打印前10个
            const bar = '█'.repeat(Math.round(node.score / 10)) + '░'.repeat(10 - Math.round(node.score / 10));
            console.log(`${indent}${bar} ${node.score.toFixed(0)}% - ${node.name}`);
            if (node.children.length > 0) {
                printTree(node.children.slice(0, 3), indent + '  ');
            }
        }
    }

    printTree(tree);

    console.log('\n✅ 迁移完成！');
}

migrateToHierarchy().catch(console.error);
