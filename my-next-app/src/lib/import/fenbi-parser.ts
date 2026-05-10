/**
 * 粉笔 APP 数据解析器
 * 用于解析粉笔 APP 导出的错题 JSON 数据
 */

import { keypointIdsToHierarchy, keypointNamesToHierarchy } from './keypoint-tree';

// ==================== 类型定义 ====================

/** 解析后的题目 */
export interface ParsedQuestion {
    externalId: string;           // 粉笔题目 globalId
    content: string;              // 题目内容（纯文本）
    contentHtml: string;          // 题目内容（原始 HTML）
    options: string[];            // 选项数组
    answer: string;               // 正确答案（A/B/C/D 或 正确/错误 或 填空内容）
    explanation: string;          // 解析（纯文本）
    explanationHtml: string;      // 解析（原始 HTML）
    tags: string[];               // 知识点
    source: string;               // 来源
    type: 'single' | 'multi' | 'truefalse' | 'fill_blank';  // 题目类型
    dimension: 'knowledge' | 'understanding' | 'application';
    // 材料内容（不定项选择题等有材料的题目）
    material?: string;              // 材料内容（纯文本）
    materialHtml?: string;          // 材料内容（原始 HTML）
    // 统计数据（可选）
    stats?: {
        totalAnswers: number;       // 全站总作答人数
        correctRatio: number;       // 全站正确率（%）
        mostWrongAnswer: string;    // 最常见错误选项
    };
}

/** 解析后的作答记录 */
export interface ParsedRecord {
    externalId: string;           // 粉笔题目 globalId
    userAnswer: string;           // 用户答案（A/B/C/D 或 正确/错误）
    isCorrect: boolean;           // 是否正确
    durationMs: number;           // 答题耗时（毫秒）
}

/** 导入结果 */
export interface FenbiImportResult {
    sessionName: string;          // 会话名称
    questions: ParsedQuestion[];  // 题目列表
    records: ParsedRecord[];      // 作答记录
    totalCount: number;           // 总题数
    correctCount: number;         // 正确数
    errorCount: number;           // 错误数
    statsCount: number;           // 有统计数据的题目数（调试用）
}

// ==================== 粉笔原始数据类型 ====================

interface FenbiUserAnswer {
    key: string;
    id: number;
    time: number;  // 秒
    answer: {
        choice?: string;      // 选择题答案
        blanks?: string[];    // 填空题答案
        results?: number[];   // 填空题各空正确性 (1=正确)
        type: number;
    };
    status: number;  // 1=正确, -1=错误
    scoreRate: number;
}

interface FenbiSolution {
    id: number;
    globalId: string;
    content: string;
    type: number;  // 1=单选, 2=多选, 3=不定项, 5=判断, 61=填空
    accessories: Array<{
        options?: string[];
        type: number;
    }>;
    solution: string;
    source?: string;
    keypoints?: Array<{ id: number; name: string }>;
    correctAnswer: {
        choice?: string;      // 选择题正确答案
        blanks?: string[];    // 填空题正确答案
        type: number;
    };
}

// 材料类型
interface FenbiMaterial {
    id: number;
    globalId: string;
    content: string;          // 材料 HTML 内容
    accessories: unknown[];
}

// 题目卡片节点（用于获取题目与材料的关联）
interface FenbiCardNode {
    key?: string;             // 题目 globalId
    materialKeys?: string[];  // 关联的材料 globalId 数组
    nodeType: number;
    children?: FenbiCardNode[];
}

interface FenbiExerciseData {
    name?: string;
    userAnswers: Record<string, FenbiUserAnswer>;
}

interface FenbiSolutionsData {
    name?: string;
    solutions: FenbiSolution[];
    materials?: FenbiMaterial[];  // 材料数组
    card?: {                      // 题目卡片结构（包含题目与材料的关联）
        children?: FenbiCardNode[];
        nodeType: number;
    };
}

// 题目统计数据类型
interface FenbiStatsItem {
    id: number;
    totalCount: number;           // 全站总作答人数
    correctRatio: number;         // 全站正确率（%）
    mostWrongAnswer: {
        choice: string;
        type: number;
    };
}

interface _FenbiStatsData {
    data: Record<string, FenbiStatsItem>;
}

/**
 * 移除 HTML 标签，保留纯文本
 */
function stripHtml(html: string): string {
    if (!html) return '';
    return html
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .trim();
}

/**
 * 将选项索引转换为字母
 * "0" -> "A", "1" -> "B", etc.
 */
function indexToLetter(index: string): string {
    const num = parseInt(index, 10);
    if (isNaN(num) || num < 0 || num > 25) return index;
    return String.fromCharCode(65 + num);  // A=65
}

/**
 * 将判断题选项转换为中文
 * "0" -> "正确", "1" -> "错误"
 */
function indexToBoolean(index: string): string {
    return index === '0' ? '正确' : '错误';
}

/**
 * 将多选题索引转换为字母
 * "0,1,3" -> "A,B,D"
 */
function multiIndexToLetters(indices: string): string {
    return indices.split(',').map(i => indexToLetter(i.trim())).join(',');
}

/**
 * 推断题目类型
 */
function inferQuestionType(fenbiType: number, accessories: FenbiSolution['accessories']): 'single' | 'multi' | 'truefalse' | 'fill_blank' {
    // 填空题
    if (fenbiType === 61) return 'fill_blank';
    // 判断题
    if (fenbiType === 5) return 'truefalse';
    // 多选题 或 不定项选择题（type: 3 的答案格式与多选题相同）
    if (fenbiType === 2 || fenbiType === 3) return 'multi';
    // 单选题
    if (fenbiType === 1) return 'single';

    // 根据选项数量推断
    const options = accessories?.[0]?.options;
    if (!options || options.length === 0) return 'single';
    if (options.length === 2) return 'truefalse';
    return 'single';
}

/**
 * 推断认知维度（默认理解）
 */
function inferDimension(content: string, _tags: string[]): 'knowledge' | 'understanding' | 'application' {
    const contentLower = content.toLowerCase();

    // 应用类关键词
    if (contentLower.includes('案例') || contentLower.includes('实践') ||
        contentLower.includes('应该') || contentLower.includes('做法')) {
        return 'application';
    }

    // 识记类关键词
    if (contentLower.includes('是指') || contentLower.includes('属于') ||
        contentLower.includes('提出') || contentLower.includes('哪一项')) {
        return 'knowledge';
    }

    return 'understanding';
}

// ==================== 主解析函数 ====================

/**
 * 解析粉笔 APP 的 JSON 数据
 * @param exerciseJson 包含 userAnswers 的答题数据 JSON
 * @param solutionsJson 包含 solutions 的题目详情 JSON
 * @param statsJson 可选，包含题目统计数据的 JSON
 */
export function parseFenbiData(
    exerciseJson: string | object,
    solutionsJson: string | object,
    statsJson?: string | object
): FenbiImportResult {
    // 解析 JSON
    let exerciseData: FenbiExerciseData;
    if (typeof exerciseJson === 'string') {
        const parsed = JSON.parse(exerciseJson);
        exerciseData = parsed.data || parsed;
    } else {
        const obj = exerciseJson as Record<string, unknown>;
        exerciseData = (obj.data || obj) as FenbiExerciseData;
    }

    let solutionsData: FenbiSolutionsData;
    if (typeof solutionsJson === 'string') {
        solutionsData = JSON.parse(solutionsJson);
    } else {
        solutionsData = solutionsJson as FenbiSolutionsData;
    }

    // 解析统计数据（可选）
    let statsData: Record<string, FenbiStatsItem> = {};
    if (statsJson) {
        if (typeof statsJson === 'string') {
            const parsed = JSON.parse(statsJson);
            statsData = parsed.data || parsed;
        } else {
            const obj = statsJson as Record<string, unknown>;
            statsData = (obj.data || obj) as Record<string, FenbiStatsItem>;
        }
        console.log('[fenbi-parser] statsData 解析成功，共', Object.keys(statsData).length, '条统计数据');
        console.log('[fenbi-parser] statsData 示例 keys:', Object.keys(statsData).slice(0, 3));
    } else {
        console.log('[fenbi-parser] 未提供 statsJson 参数');
    }

    const userAnswers = exerciseData.userAnswers || {};
    const solutions = solutionsData.solutions || [];
    const materials = solutionsData.materials || [];

    // 构建材料映射表 (globalId -> material)
    const materialMap = new Map<string, FenbiMaterial>();
    for (const mat of materials) {
        materialMap.set(mat.globalId, mat);
    }
    if (materials.length > 0) {
        console.log('[fenbi-parser] 解析到', materials.length, '个材料');
    }

    // 从 card 结构中提取题目与材料的关联 (questionGlobalId -> materialGlobalIds)
    const questionMaterialMap = new Map<string, string[]>();
    function extractMaterialKeys(node: FenbiCardNode) {
        if (node.key && node.materialKeys && node.materialKeys.length > 0) {
            questionMaterialMap.set(node.key, node.materialKeys);
        }
        if (node.children) {
            for (const child of node.children) {
                extractMaterialKeys(child);
            }
        }
    }
    if (solutionsData.card?.children) {
        for (const child of solutionsData.card.children) {
            extractMaterialKeys(child);
        }
        console.log('[fenbi-parser] 解析到', questionMaterialMap.size, '个题目有材料关联');
    }

    // 会话名称
    const sessionName = solutionsData.name || exerciseData.name || `粉笔导入 ${new Date().toLocaleDateString('zh-CN')}`;

    const questions: ParsedQuestion[] = [];
    const records: ParsedRecord[] = [];
    let correctCount = 0;
    let errorCount = 0;

    // 遍历题目
    for (const solution of solutions) {
        const externalId = solution.globalId;
        const questionType = inferQuestionType(solution.type, solution.accessories);

        // 获取选项
        let options: string[] = [];
        if (questionType === 'truefalse') {
            options = ['正确', '错误'];
        } else if (questionType !== 'fill_blank') {
            options = solution.accessories?.[0]?.options || [];
        }

        // 转换正确答案
        let correctAnswer: string;
        if (questionType === 'fill_blank') {
            // 填空题：从 blanks 数组提取
            correctAnswer = solution.correctAnswer?.blanks?.join('；') || '';
        } else if (questionType === 'truefalse') {
            correctAnswer = indexToBoolean(solution.correctAnswer?.choice || '0');
        } else if (questionType === 'multi') {
            // 多选题：逗号分隔的索引转字母
            correctAnswer = multiIndexToLetters(solution.correctAnswer?.choice || '');
        } else {
            // 单选题
            correctAnswer = indexToLetter(solution.correctAnswer?.choice || '');
        }

        // 提取知识点（使用层级树查找完整路径）
        const keypointIds = solution.keypoints?.map(kp => kp.id) || [];
        const keypointNames = solution.keypoints?.map(kp => kp.name) || [];

        let tags: string[] = [];

        // 优先使用 ID 查找完整路径（精确匹配）
        if (keypointIds.length > 0) {
            tags = keypointIdsToHierarchy(keypointIds);
        }

        // 如果 ID 查找失败，回退到名称匹配
        if (tags.length === 0 && keypointNames.length > 0) {
            tags = keypointNamesToHierarchy(keypointNames);
        }

        // 兜底：使用默认标签
        if (tags.length === 0) {
            tags = ['未分类'];
        }

        // 推断维度
        const dimension = inferDimension(solution.content, tags);

        // 获取统计数据（如有）- 尝试多种 key 形式匹配
        // statsData 的 key 可能是数字 id 或字符串 globalId，需要全面兼容
        const questionStats = statsData[externalId]                       // 尝试 globalId（字符串）
            || statsData[String(solution.id)]                            // 尝试 id 转字符串
            || statsData[solution.id as unknown as string]               // 尝试 id 直接访问
            || (typeof solution.id === 'number' && statsData[solution.id]); // 尝试数字 key 直接匹配

        // 调试日志（打印前 3 题的匹配情况）
        if (solutions.indexOf(solution) < 3) {
            console.log(`[fenbi-parser] 题目 #${solutions.indexOf(solution) + 1}:`);
            console.log(`  - externalId: ${externalId}`);
            console.log(`  - solution.id: ${solution.id}`);
            console.log(`  - statsData keys 示例:`, Object.keys(statsData).slice(0, 5));
            console.log(`  - 匹配结果 questionStats:`, questionStats ? '有数据' : '无数据');
        }

        // 获取关联的材料内容
        const materialKeys = questionMaterialMap.get(externalId) || [];
        let materialContent = '';
        let materialHtml = '';
        if (materialKeys.length > 0) {
            const materialContents = materialKeys
                .map(key => materialMap.get(key)?.content)
                .filter(Boolean) as string[];
            if (materialContents.length > 0) {
                materialHtml = materialContents.join('\n');
                materialContent = stripHtml(materialHtml);
            }
        }

        // 构建题目对象
        const question: ParsedQuestion = {
            externalId,
            content: stripHtml(solution.content),
            contentHtml: solution.content,
            options,
            answer: correctAnswer,
            explanation: stripHtml(solution.solution),
            explanationHtml: solution.solution,
            tags,
            source: solution.source || '',
            type: questionType,
            dimension,
            // 材料内容
            material: materialContent || undefined,
            materialHtml: materialHtml || undefined,
            // 统计数据
            stats: questionStats ? {
                totalAnswers: questionStats.totalCount,
                correctRatio: Math.round(questionStats.correctRatio * 10) / 10,  // 保留一位小数即可
                mostWrongAnswer: questionStats.mostWrongAnswer
                    ? (questionType === 'truefalse'
                        ? indexToBoolean(questionStats.mostWrongAnswer.choice)
                        : questionType === 'multi'
                            ? multiIndexToLetters(questionStats.mostWrongAnswer.choice)
                            : indexToLetter(questionStats.mostWrongAnswer.choice))
                    : ''
            } : undefined
        };
        questions.push(question);

        // 查找用户答案
        const userAnswer = userAnswers[externalId];
        if (userAnswer) {
            let userChoice: string;
            if (questionType === 'fill_blank') {
                // 填空题：从 blanks 数组提取
                userChoice = userAnswer.answer?.blanks?.join('；') || '';
            } else if (questionType === 'truefalse') {
                userChoice = indexToBoolean(userAnswer.answer?.choice || '0');
            } else if (questionType === 'multi') {
                // 多选题
                userChoice = multiIndexToLetters(userAnswer.answer?.choice || '');
            } else {
                // 单选题
                userChoice = indexToLetter(userAnswer.answer?.choice || '');
            }

            const isCorrect = userAnswer.status === 1;
            if (isCorrect) {
                correctCount++;
            } else {
                errorCount++;
            }

            records.push({
                externalId,
                userAnswer: userChoice,
                isCorrect,
                durationMs: userAnswer.time * 1000  // 秒转毫秒
            });
        }
    }

    // 计算有统计数据的题目数
    const statsCount = questions.filter(q => q.stats?.correctRatio != null).length;

    return {
        sessionName,
        questions,
        records,
        totalCount: questions.length,
        correctCount,
        errorCount,
        statsCount
    };
}

/**
 * 验证粉笔 JSON 数据格式
 */
export function validateFenbiJson(
    exerciseJson: string,
    solutionsJson: string
): { valid: boolean; error?: string } {
    try {
        const exerciseObj = JSON.parse(exerciseJson);
        const solutionsObj = JSON.parse(solutionsJson);

        // 检查答题数据
        const exerciseData = exerciseObj.data || exerciseObj;
        if (!exerciseData.userAnswers || typeof exerciseData.userAnswers !== 'object') {
            return { valid: false, error: '答题数据缺少 userAnswers 字段' };
        }

        // 检查题目数据
        if (!solutionsObj.solutions || !Array.isArray(solutionsObj.solutions)) {
            return { valid: false, error: '题目数据缺少 solutions 数组' };
        }

        if (solutionsObj.solutions.length === 0) {
            return { valid: false, error: '题目数据为空' };
        }

        return { valid: true };
    } catch (e) {
        return { valid: false, error: `JSON 解析失败: ${(e as Error).message}` };
    }
}
