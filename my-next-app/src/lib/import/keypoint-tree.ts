/**
 * 知识点层级工具
 * 根据粉笔知识点树查找知识点的完整路径
 */

import fs from 'fs';
import path from 'path';

interface KeypointNode {
    id: number;
    name: string;
    children: KeypointNode[] | null;
}

// 缓存
let keypointPathMap: Map<number, string> | null = null;

/**
 * 加载知识点树并构建 ID -> 路径 映射
 */
function loadKeypointPaths(): Map<number, string> {
    if (keypointPathMap) return keypointPathMap;

    keypointPathMap = new Map();

    try {
        const jsonPath = path.join(process.cwd(), 'public', 'data', 'keypoints.json');
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as KeypointNode[];

        // 递归遍历构建路径映射
        function traverse(nodes: KeypointNode[], parentPath: string = '') {
            for (const node of nodes) {
                const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
                keypointPathMap!.set(node.id, currentPath);

                if (node.children && node.children.length > 0) {
                    traverse(node.children, currentPath);
                }
            }
        }

        traverse(data);
        console.log(`[keypoint-tree] 已加载 ${keypointPathMap.size} 个知识点路径`);
    } catch (error) {
        console.warn('[keypoint-tree] 无法加载知识点树:', error);
    }

    return keypointPathMap;
}

/**
 * 根据知识点 ID 获取完整路径
 */
export function getKeypointPath(id: number): string | null {
    const map = loadKeypointPaths();
    return map.get(id) || null;
}

/**
 * 根据知识点名称模糊匹配路径（兜底方案）
 */
export function findKeypointPathByName(name: string): string | null {
    const map = loadKeypointPaths();
    for (const [, path] of map) {
        if (path.endsWith(name) || path.endsWith(`/${name}`)) {
            return path;
        }
    }
    return null;
}

/**
 * 将知识点 ID 数组转换为层级路径数组
 * 返回各级路径，例如: [123, 456, 789] → ["教育学", "教育学/教育概述", "教育学/教育概述/教育的属性"]
 */
export function keypointIdsToHierarchy(ids: number[]): string[] {
    const paths: string[] = [];

    for (const id of ids) {
        const fullPath = getKeypointPath(id);
        if (fullPath) {
            // 将完整路径拆分为各级
            const parts = fullPath.split('/');
            for (let i = 0; i < parts.length; i++) {
                const partialPath = parts.slice(0, i + 1).join('/');
                if (!paths.includes(partialPath)) {
                    paths.push(partialPath);
                }
            }
        }
    }

    return paths.sort();
}

/**
 * 将知识点名称数组转换为层级路径（兼容旧数据）
 */
export function keypointNamesToHierarchy(names: string[]): string[] {
    if (names.length === 0) return ['未分类'];

    const paths: string[] = [];

    for (const name of names) {
        // 先尝试通过名称匹配
        const fullPath = findKeypointPathByName(name);
        if (fullPath) {
            const parts = fullPath.split('/');
            for (let i = 0; i < parts.length; i++) {
                const partialPath = parts.slice(0, i + 1).join('/');
                if (!paths.includes(partialPath)) {
                    paths.push(partialPath);
                }
            }
        } else {
            // 匹配不到就直接使用名称
            if (!paths.includes(name)) {
                paths.push(name);
            }
        }
    }

    return paths.length > 0 ? paths.sort() : ['未分类'];
}
